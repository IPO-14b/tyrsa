const {app, BrowserWindow, ipcMain} = require('electron')
const path = require('path')
const url = require('url')
fs = require('fs');
let win
const electronOauth2 = require('electron-oauth2');
var gDrive = require('google-drive')
var jsonfile = require('jsonfile')
var mime = require('mime-types');
var resultArray = new Array();
var config = {
    clientId: '782392691234-oo2qfvrlp3gnp9kqlh5srvuk41huhm80.apps.googleusercontent.com',
    clientSecret: 'vBOI4nVVUX-edmJ2QKWtf3SM',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://accounts.google.com/o/oauth2/token',
    useBasicAuthorizationHeader: false,
    redirectUri: 'http://localhost'
};
var globalToken;
global.currentPath = ".";
global.parentPath = "";
var request = require('request');
var Stack = require('stackjs');
var stack = new Stack();

const options = {
    scope: 'https://www.googleapis.com/auth/drive',
    accessType: 'offline'
}
/**
* Функция создания окна
* Отрисовка окна, авторазиация в Google API
*/
function createWindow () {
    win = new BrowserWindow({width: 800, height: 600,show:false})
    win.setMenu(null);
    const windowParams = {
        alwaysOnTop: true,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false
        }
    }
    //Создание окна
    let wait = new BrowserWindow({parent:win, modal:true,width: 800, height: 600, show:false})
    /** Обработка события загрузки URL */
    wait.loadURL(url.format({ 
        pathname: path.join(__dirname, 'wait.html'),
        protocol: 'file:',
        slashes: true
    }))
    const myApiOauth = electronOauth2(config, windowParams);
    //Получение токена
    myApiOauth.getAccessToken(options)
    .then(token => {
        myApiOauth.refreshToken(token.refresh_token)
        .then(newToken => {
            var file = 'data.json'
            jsonfile.readFile(file, function (err,obj) {
                if (typeof obj === 'undefined'){
                    globalToken = newToken.access_token;
                    listFiles(newToken.access_token)
                }
                else{
                    globalToken = newToken.access_token;
                    resultArray = obj
                    write()
                }
            })
        });
    });
    /** Обработка события загрузки URL */
    win.loadURL(url.format({ 
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        slashes: true
    }))
    /** Обработка события закрытия окна */
    win.on('closed', () => {
        app.quit()
    })
}
/** Обработчик события готовности программы к выполнению */
app.on('ready', createWindow)
/**
* Обработчик команды openFolder html страницы
*/
ipcMain.on('openFolder', (event, arg) =>{
    for(var i = 0; i < resultArray.length; i++){
        if(resultArray[i].name === arg){
            if(resultArray[i].folder){
                //Условие возврата на родительский каталог
                if(arg === "..."){
                    try{
                        resultArray = stack.peek();
                        win.webContents.send('info',resultArray);
                    }catch(e){}
                }
                else{
                    //Генерация запроса на получение дочерних элементов
                    var request = {
                        pageSize: 1000,
                        q: "trashed=false and '" + resultArray[i].id + "' in parents"
                    }
                    var parentId = resultArray[i].id
                    gDrive(globalToken).files().list(request, (params,callback) => {
                        //Формирование списка каталогов
                        var body = callback.body
                        body = JSON.parse(body)
                        body = body["items"]
                        parentPath = currentPath
                        currentPath = currentPath + "/" + resultArray[i]
                        stack.push(resultArray);
                        resultArray = new Array();
                        var tmp = {};
                        tmp.name = "...";
                        tmp.id = parentId;
                        tmp.folder = true;
                        resultArray.push(tmp)
                        for(var i in body){
                            tmp = {};
                            var name = body[i]["title"]
                            var id = body[i]["id"]
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
                        //Отправка списка каталогов на html страницу
                        win.webContents.send('info',resultArray);
                    })
                }
            }
            else
                win.webContents.send('error',"Это не папка");
            break;
        }
    }
})
/** 
* Обработка события синхронизации списка файлов корневого каталога
*/
ipcMain.on('sync',(event, arg) => {
    const myApiOauth = electronOauth2(config);
    //Получаем и обновляем токен
    myApiOauth.getAccessToken(options)
    .then(token => {
        myApiOauth.refreshToken(token.refresh_token)
        .then(newToken => {
            globalToken = newToken.access_token;
            //console.log(newToken)
            resultArray = new Array();
            listFiles(newToken.access_token)
        });
    });
})
/** 
* Обработка события скачивания файла
*/
ipcMain.on('downloadFile',(event, arg, path) =>{
    for(var i = 0; i < resultArray.length; i++){
        if(resultArray[i].name === arg){
            if(!resultArray[i].folder){
                //Генерация пути и адреса скачивания
                var fullpath = process.platform === "win32" ? path + "\\" + arg 
                    : path + "/" + arg; 
                var url = 'https://www.googleapis.com/drive/v2/files/' + resultArray[i].id + '?alt=media';
                //Отправка запроса на сервер Google Drive
                request({
                    'url': url,
                    'headers' : {
                        'Authorization': 'Bearer ' + globalToken
                    }
                })
                .on('response', function(response) {
                    if(response.statusCode == 200)
                        win.webContents.send('error',"Скачивание успешно");
                    else
                    win.webContents.send('error',"Ошибка при скачивании");
                })
                .pipe(fs.createWriteStream(fullpath))
            }
            else
                win.webContents.send('error',"Это не файл");
        }
    }
})
/** 
* Обработка события загрузки файла
*/
ipcMain.on('sendFile', (event, arg) => {  
    var fstatus = fs.statSync(arg);
      fs.open(arg, 'r', function(status, fileDescripter) {
        if (status) {
          callback(status.message);
          return;
        }
        //Загрузка файла с локальной машины в буфер
        var buffer = new Buffer(fstatus.size);
        console.log("NAME: ",path.parse(arg).base);
        fs.read(fileDescripter, buffer, 0, fstatus.size, 0, function(err, num) {
            request.post({
                'url': 'https://www.googleapis.com/upload/drive/v2/files',
                'qs': {
                    'uploadType': 'multipart'
                },
                'headers' : {
                    'Authorization': 'Bearer ' + globalToken
                },
                'multipart':  [
                    {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'body': JSON.stringify({
                            'title': path.parse(arg).base
                        })
                    },
                    {
                        'Content-Type': mime.lookup(arg) || "application/octet-stream",
                        'body': buffer
                    }
                ]
            },function(arg0,arg1,arg2){
                /** 
                * Функцмя обработки ошибок
                * @param {int} arg0 Код ошибки
                * @param {string} arg1 Текст ошибки
                * @param {string} arg2 Текст результата  
                */
                var jsonArg = JSON.parse(arg2)
                var name = jsonArg["title"]
                var id = jsonArg["id"]
                var tmp = {};
                tmp.id = id;
                tmp.name = name;
                tmp.folder = false;
                resultArray.push(tmp);
                write();
            });  
        });
    }); 
});
/**
* Обработка события закрытия окна
*/
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
/**
* Обработка события активации окна
*/
app.on('activate', () => {
    if (win === null) {
        createWindow()
    }
})
/**
* Обработка события закрытия окна
* @param {string} token Токен для запроса 
* @param {bool} requirePageToken Требование токена для многостраничных запросов
* @param {string} pageToken Токен первой страницы
*/
function listFiles(token,requirePageToken,pageToken){
    if(requirePageToken === false){
        var request = {
            pageSize: 1000,
            q: "trashed=false"
        };
    }
    else{
        var request = {
          pageSize: 200,
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

/**
* Функция отправки данных на html страницу
*/
function write(){
    var file = 'data.json'
    jsonfile.writeFile(file, resultArray, function(err) {})
    win.show();
    win.webContents.send('info',resultArray);
    win.webContents.openDevTools();
}
