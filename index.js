
var ini = require('ini')
var functions = require('./functions');
var data = require('./data');
var http = require('http');
var request = require('request');
fs = require('fs');
var mime = require('mime');
var qs = require('querystring');
var Stomp = require('stomp-client');
var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'))
console.log('Config parsed:');
console.log(config);
if (config.amq.useamq) {
    try{
        var client = new Stomp(config.amq.ip, config.amq.port, config.amq.user, config.amq.password);
        client.connect(function(sessionId) {
            data.getSenders(function(senders){
                data.getListeners(function(listeners){
                    listeners.forEach(function(listener){
                        if (listener.type.toUpperCase() == 'AMQ') {
                            client.subscribe(listener.url, function(body, headers) {
                              console.log('This is the body of a message on the subscribed queue:', body);
                                console.log('=============AMQ MESG================');
                                console.log('[QIO] [' + listener.url + ']received on Queue: ' , body);
                                functions.loopListeners(listeners, senders, null, 'STOMP', listener.url, body);
                            });
                        }
                    });
                });
            });
        });
    }
    catch(e) {
        console.log('could not connect to AMQ');
    }
}




var server = http.createServer( function(req, res) {
    if (functions.requestIsStatic(req,res)) {
        functions.serveStatic(req,res);
    }
    console.log('=============REQUEST================');
    console.log(req.url);
    if (req.method == 'POST') {
        console.log("POST");
        var body = '';
        req.on('data', function (data) {
            body += data;
        });
        req.on('end', function () {
            console.log("Body: " + body);
            if (req.url == '/admin/senders') {
                functions.writeSettings(req, res, './data/senders.inc', data, function(){
                    var html = fs.readFileSync('./html/saved.html');
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(html);
                });

            }else if (req.url == '/admin/listeners') {
                console.log(req.body,body);
                console.log(qs.parse(req.body));
                // functions.writeSettings(req, res, './data/listeners.inc', data, function(){
                //     var html = fs.readFileSync('./html/saved.html');
                //     res.writeHead(200, {'Content-Type': 'text/html'});
                //     res.end(html);
                // });
            }else{
                data.getSenders(function(senders){
                    data.getListeners(function(listeners){
                        var val = functions.loopListeners(listeners, senders, req, req.method, req.url, body);
                        if (val){
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            res.end('received');
                        }else{
                            res.writeHead(404, {'Content-Type': 'text/html'});
                            res.end('nothing here');
                        }
                        var html = fs.readFileSync('./html/received.html');
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.end(html);
                    });
                });
            }
        });
        // res.writeHead(200, {'Content-Type': 'text/html'});
        // res.end('post received');
    }
    else
    {
        console.log("GET");
        if (req.url == '/admin') {
            var html = fs.readFileSync('./html/admin.html');
            html = html.toString();
            var listeners = fs.readFileSync('./data/listeners.inc' );
            var senders = fs.readFileSync('./data/senders.inc' );
            var newhtml = html.replace('{listeners}',listeners);
            newhtml = newhtml.replace('{senders}',senders);
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newhtml );
        }else{
            data.getSenders(function(senders){
                data.getListeners(function(listeners){
                    var val = functions.loopListeners(listeners, senders, req, req.method, req.url, body);
                    if (val){
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.end('received');
                    }else{
                        res.writeHead(404, {'Content-Type': 'text/html'});
                        res.end('nothing here');
                    }
                    var html = fs.readFileSync('./html/received.html');
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(html);

                });
            });
        }
    }
});
global.server = server;


if (config.server.usesocketio) {
    global.io = require('socket.io')(server);
    console.log('[IO] attempt connect');
    global.io.on('connection', function(socket){
        global.socket = socket;
        console.log('[IO] connect');
        data.getSenders(function(senders){
            data.getListeners(function(listeners){
                listeners.forEach(function(listener){
                    if (listener.type.toUpperCase() == 'SOCKET') {
                        socket.on(listener.url, function(msg){
                            console.log('=============SOCKET MESG================');
                            console.log('[IO] [' + listener.url + ']received on socket: ' , msg);
                            functions.loopListeners(listeners, senders, null, 'SOCKET', listener.url, msg);
                        });
                    }
                });
            });
        });

        socket.on('event', function(data){
            console.log('[IO] event');
        });
        socket.on('disconnect', function(){
            console.log('[IO] disconnect');
        });
        socket.on('connect', function(){
            console.log('[IO] connect');
        });
    });
}

port = config.server.port;
host = config.server.ip;
server.listen(port, host);
console.log('Listening at http://' + host + ':' + port);
