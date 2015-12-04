var ini = require('ini');
var fs = require('fs');
var http = require('http');
var request = require('request');
var mime = require('mime');
var qs = require('querystring');
var amqp = require('amqp');
var util = require('util');
var auth = require('http-auth');
var swig  = require('swig');
var pam = require('authenticate-pam');
var functions = require('./functions');
var data = require('./data');
functions.checkExistingFiles();
var config = ini.parse(fs.readFileSync('./config/config.ini', 'utf-8'));
global.config = config;
functions.checkExistingLogFiles();
if (config.log.logToFile) {
    var log_file = fs.createWriteStream(config.log.logFile, {flags: 'a'});
}
var log_stdout = process.stdout;


//////////////////    Must.start.parent.   //////////////////////
var process_id = process.argv[2];
if (!process_id) {
    throw new Error('no parent pid found');
    global.parentPid = process_id;
}



//////////////////    Logging   //////////////////////
console.log = function (d) {
    if (config.log.logToFile) {
        log_file.write(util.format(d) + '\n');
    }
    if (config.log.logToConsole) {
        log_stdout.write(util.format(d) + '\n');
    }
};


//////////////////    AMQP   //////////////////////
global.amqpConnections = [];
if (config.amqp.useamq) {
    var amqpServers = ini.parse(fs.readFileSync('./data/amqp.ini', 'utf-8'));
    Object.keys(amqpServers).forEach(function (index) {
        amqpServer = amqpServers[index]
        functions.connectAmqpServer(amqpServer);
    });
} else {
    console.log('[AMQ] AMQ is disabled in config');
}



//////////////////    Webserver   //////////////////////
port = config.server.port;
host = config.server.ip;
var path = require('path');
var express = require('express');
var app = express();
var http = require('http').Server(app);
var bodyParser = require('body-parser');

// Middleware
app.use(bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

// Logging middleware
app.use(function(request, response, next) {
    console.log(request.method + '\t' + request.headers.host + '\t' + request.url);
    next();
});

//Serve static content
app.use('/public', express.static(__dirname + '/public'));

// Web poll (for nagios or other status things).
app.get(global.config.web.webpollurl, function(req, res){
    res.send('ok');
});

// Admin area for administration of the thing.
app.get('/admin', function(req, res){
    res.send('admin');
    //showAdminAreaGet(req, res);
});
app.get('/admin/login', function(req, res){
    res.send('admin');
    //showAdminAreaGet(req, res);
});
app.get('/admin/logout', function(req, res){
    res.send('admin');
    //showAdminAreaGet(req, res);
});
app.get('/admin/restart', function(req, res){
    res.writeHead(302, {
        'Location': '/admin'
    });
    //res.send('');
    process.kill(global.parentPid, 'SIGHUP');
    res.send('admin');
});



app.post('/admin/listeners', function(req, res){
    var decodedBody = req.body;
    //var decodedBody = qs.parse(body);
    functions.writeSettings('./data/listeners.inc', decodedBody['listeners'], function (err) {
        if (err) {
            console.log('Error writing file');
            console.log(err);
        }
        var html = swig.renderFile('./html/saved.html', {});
        //res.writeHead(200, {'Content-Type': 'text/html'});
        res.send(html);
    });
});

app.post('/admin/senders', function(req, res){
    var decodedBody = req.body;
    functions.writeSettings('./data/senders.inc', decodedBody['senders'], function (err) {
        if (err) {
            console.log('Error writing file');
            console.log(err);
        }
        var html = swig.renderFile('./html/saved.html', {});
        //res.writeHead(200, {'Content-Type': 'text/html'});
        res.send(html);
    });
});



//Catch all POST requests for dynamic handling
app.post('*', function(req, res){;
    var decodedBody = req.body;
    if (global.config.web.requirepostsecret &&
        (typeof req.headers.requestadorsecret == 'undefined' || req.headers.requestadorsecret != global.config.web.requestadorsecret)) {
        res.status(401).send('Secret not in header or secret incorrect.');
        return false;
    }
    data.getSenders(function (senders) {
        data.getListeners(function (listeners) {
            var val = functions.loopListeners(listeners, senders, req, req.method, req.url, decodedBody);
            if (val) {
                res.send('ok');
                return true;
            } else {
                res.status(404).send('Not found');
                return false;
            }
        });
    });
});



//Catch all GET requests for dynamic handling
app.get('*', function(req, res){
    var body = '';
    data.getSenders(function (senders) {
        data.getListeners(function (listeners) {
            var val = functions.loopListeners(listeners, senders, req, req.method, req.url, body);
            if (val) {
                res.send('ok');
                return true;
            } else {
                res.status(404).send('Not found');
                return false;
            }
        });
    });
});




//////////////////    SOCKET   //////////////////////
if (config.server.usesocketio) {
    console.log('[IO] socket IO is enabled');
    global.io = require('socket.io')(http);
    console.log('[IO] attempt connect');
    //global.io.set( 'origins', '*' );
    global.io.on('connection', function (socket) {
        socket = socket;
        console.log('[IO] connect');
        data.getSenders(function (senders) {
            data.getListeners(function (listeners) {
                listeners.forEach(function (listener) {
                    if (listener.type.toUpperCase() == 'SOCKET') {
                        socket.on(listener.url, function (msg) {
                            console.log('=============SOCKET MESG================');
                            console.log('[IO] [' + listener.url + ']received on socket: ', msg);
                            if (msg == 'die') {
                                process.exit(1);
                            }
                            functions.loopListeners(listeners, senders, null, 'SOCKET', listener.url, msg);
                        });
                    }
                });
            });
        });

        socket.on('event', function (data) {
            console.log('[IO] event');
        });
        socket.on('disconnect', function () {
            console.log('[IO] disconnect');
        });
        socket.on('connect', function () {
            console.log('[IO] connect');
        });
    });
} else {
    console.log('[IO] socket IO is disabled in config');
}

if (config.server.useweb || config.server.usesocketio) {
    http.listen(port, function(){
        console.log('[WEB] Listening on port:' + port);
    });
} else {
    console.log('[WEB] server disabled in config');
}
