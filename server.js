var ini = require('ini')
var fs = require('fs');
var http = require('http');
var request = require('request');
var mime = require('mime');
var qs = require('querystring');
var amqp = require('amqp');
var util = require('util');

var functions = require('./functions');
var data = require('./data');

var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'));
global.config = config;


var log_file = fs.createWriteStream(__dirname + config.log.logFile, {flags : 'a'});
var log_stdout = process.stdout;

console.log = function(d) { //
    if (config.log.logToFile) {
        log_file.write(util.format(d) + '\n');
    }
    if (config.log.logToConsole) {
        log_stdout.write(util.format(d) + '\n');
    }
};


//Global variable

var amqpConnection;

//////////////////    AMQP   //////////////////////
if (config.amqp.useamq) {
    console.log('[AMQP] AMQP is enabled');
    try{
        var functionBindQueue = "bindQueue";
        console.log('[AMQP] connecting');
        var connOptions = {
            host : config.amqp.ip,
            //heartbeat : config.amq.heartbeat,
            port: config.amqp.port,
            login: config.amqp.user,
            password: config.amqp.password,
            vhost: config.amqp.vhost
        };

        amqpConnection = amqp.createConnection(connOptions, { reconnectBackoffStrategy : "exponential" });
        global.amqpConnection = amqpConnection;
        //events
        //connect/data/error/ready/end

        amqpConnection.on('error', function(err) {
            console.log('[AMQP] error ');
            console.log(err);
        });
        amqpConnection.on('end', function() {
            console.log('[AMQP] ended ');
        });
        amqpConnection.on('ready', function() {
            console.log('[AMQP] connection ready');
            var subscribed = [];
                data.getSenders(function(senders){
                    data.getListeners(function(listeners){
                        listeners.forEach(function(listener){
                            if (listener.type.toUpperCase() == 'AMQP') {
                                var options = {
                                    autoDelete: false,
                                    durable: false,
                                    closeChannelOnUnsubscribe: true,
                                    noDeclare: true
                                };
                                console.log('[AMQP] queue:');
                                console.log(listener.queue);
                                amqpConnection.queue(listener.queue, options, function(q) {
                                    console.log('[AMQP] queue created ', listener.queue);
                                    // var exchangeOptions = {
                                    //     type: 'topic', //'direct', 'fanout'
                                    // };
                                    // console.log('[AMQP] creating exchange ', listener.exchange, exchangeOptions);
                                    // amqpConnection.exchange(listener.exchange, exchangeOptions, function(exchange){
                                        //console.log('[AMQP] exchange created ', listener.exchange);
                                        //queue = q;
                                        //queue.bind(exchange, listener.key);
                                        //subscribed.push(listener);
                                        q.subscribe(function(message, headers, deliveryInfo, messageObject) {
                                            console.log('=============AMQ MESG================');
                                            console.log('[AMQ] [' + listener.url + ']received on Queue: ' );
                                            console.log('[AMQ] [headers]', headers );
                                            console.log('[AMQ] [deliveryInfo]', deliveryInfo );
                                            console.log(typeof message);
                                            if (typeof message  == 'object') {
                                                var json = JSON.stringify(message)
                                            }
                                            console.log( message);
                                            console.log( message.toString('utf-8'));
                                            console.log('[AMQ] [message]', json );
                                            functions.loopListeners(listeners, senders, null, 'AMQP', listener.url, json, headers);
                                        });
                                        //console.log(subscribed);
                                    //});Exchange

                                });
                            }
                        });
                    });
                });
            });

        amqpConnection.on('close', function(msg) {
            console.log("[AMQP] connection closed: " + msg);
        });
    }
    catch(e) {
        console.log('[AMQ] could not connect to AMQ');
        console.log(e);
    }
}else{
    console.log('[AMQ] AMQ is disabled in config');
}



//////////////////    WEB   //////////////////////
var server = http.createServer( function(req, res) {
    if (functions.requestIsStatic(req,res)) {
        functions.serveStatic(req,res);
    }
    if (req.method == 'POST' && config.web.useweb) {
        console.log('=============POST================');
        console.log(req.url);
        var body = '';
        req.on('data', function (data) {
            body += data;
            if (body.length > 1e6) {
                // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                request.connection.destroy();
            }
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
                console.log(req);
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
    else if(req.method == 'GET' && config.web.useweb)
    {
        if (req.url == global.config.web.webpollurl) {
            var newhtml = 'ok';
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newhtml);
        }else if (req.url == '/admin' && global.config.web.webadmin) {
            var html = fs.readFileSync('./html/admin.html');
            html = html.toString();
            var listeners = fs.readFileSync('./data/listeners.inc' );
            var senders = fs.readFileSync('./data/senders.inc' );
            var newhtml = html.replace('{listeners}',listeners);
            newhtml = newhtml.replace('{senders}',senders);
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newhtml );
        }else{
            console.log('=============GET================');
            console.log(req.url);
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
    }else{
        console.log('[WEB] unsupported request type or server not enabled in config');
    }
});
global.server = server;



//////////////////    SOCKET   //////////////////////

if (config.server.usesocketio) {
    console.log('[IO] socket IO is enabled');
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
}else{
    console.log('[IO] socket IO is disabled in config');
}



//////////////////    START   //////////////////////
port = config.server.port;
host = config.server.ip;
if (config.server.useweb || config.server.usesocketio) {
    server.listen(port, host);
}else{
    console.log('[WEB] server disabled in config');
}

console.log('Listening at http://' + host + ':' + port);

