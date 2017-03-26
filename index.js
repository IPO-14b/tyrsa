const {app, BrowserWindow} = require('electron')
const path = require('path')
const url = require('url')
let win
const electronOauth2 = require('electron-oauth2');
var gDrive = require('google-drive')
var jsonfile = require('jsonfile')
var resultArray = new Array();
var config = {
    clientId: '782392691234-oo2qfvrlp3gnp9kqlh5srvuk41huhm80.apps.googleusercontent.com',
    clientSecret: 'vBOI4nVVUX-edmJ2QKWtf3SM',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://accounts.google.com/o/oauth2/token',
    useBasicAuthorizationHeader: false,
    redirectUri: 'http://localhost'
};

function createWindow () {
  win = new BrowserWindow({width: 800, height: 600,show:false})
   const windowParams = {
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
        nodeIntegration: false
    }
  }

  let wait = new BrowserWindow({parent:win, modal:true,width: 800, height: 600})
  wait.loadURL(url.format({ 
    pathname: path.join(__dirname, 'wait.html'),
    protocol: 'file:',
    slashes: true
  }))

  const options = {
    scope: 'https://www.googleapis.com/auth/drive',
    accessType: 'offline'
  }
  const myApiOauth = electronOauth2(config, windowParams);

  myApiOauth.getAccessToken(options)
    .then(token => {
      myApiOauth.refreshToken(token.refresh_token)
        .then(newToken => {
          var file = 'data.json'
          jsonfile.readFile(file, function (err,obj) {
            if (typeof obj === 'undefined'){
              console.log("Launching listFiles")
              listFiles(newToken.access_token)
            }
            else{
              console.log("launching write")
              resultArray = obj
              write()
            }
          })
          //listFiles(newToken.access_token)
        });
    });

  win.loadURL(url.format({ 
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
  win.on('closed', () => {
    //win = null
    app.quit()
  })
}

app.on('ready', createWindow)


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

 app.on('activate', () => {
   if (win === null) {
     createWindow()
   }
 })

function listFiles(token,requirePageToken,pageToken){
  if(requirePageToken === false){
    var request = {
      pageSize: 1000,
      q: "trashed=false"
    };
  }else{
    var request = {
      pageSize: 1000,
      pageToken: pageToken,
      q: "trashed=false"
    };
  }
  var breakRecursive = false;
  gDrive(token).files().list(request,(params,callback) => {
    try{
      var body = JSON.parse(callback.body)
      var nextPageToken = body["nextPageToken"]
      if(requirePageToken === true && pageToken == null){
        breakRecursive = true;
        write();
        return;
      }
      body = body["items"]
      for(var i in body){
        try{
          var root = body[i]["parents"][0].isRoot
          if(root){
            var name = body[i]["title"]
            var id = body[i]["id"]
            var tmp = {};
            tmp.id = id;
            tmp.name = name;
            if(body[i]["mimeType"] === "application/vnd.google-apps.folder"){
              tmp.folder = true;
            }
            else{
              tmp.folder = false;
            }
            resultArray.push(tmp)
          }
        }
        catch(e){}
      }
      if(breakRecursive === false)
        return listFiles(token,true,nextPageToken)
      else
        console.log(resultArray)
    }
    catch(e){}
  })
  return true;
}

function write(){
  var file = 'data.json'
  console.log("Try to write to JSON")
  jsonfile.writeFile(file, resultArray, function(err) {
    if(err != 'null')
      console.error(err)
  })
  console.log(resultArray)
  win.show();
  win.webContents.send('info',resultArray);
}
