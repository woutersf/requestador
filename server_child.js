var ini = require('ini');
var fs = require('fs');
var http = require('http');
var request = require('request');
var mime = require('mime');
var qs = require('querystring');
var amqp = require('amqp');
var util = require('util');
var auth = require('http-auth');

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

/**
 * Don't start if not child of server
 */
var process_id = process.argv[2];
console.log(process_id);
if (!process_id) {
    throw new Error('no parent pid found');
    global.parentPid = process_id;
}


/**
 * Log to a file and in the terminal.
 */
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
/**
 * connect to amqp server and listen to all queues defined in "listeners"
 */
if (config.amqp.useamq) {
    var amqpServers = ini.parse(fs.readFileSync('./data/amqp.ini', 'utf-8'));
    Object.keys(amqpServers).forEach(function (index) {
        amqpServer = amqpServers[index]
        functions.connectAmqpServer(amqpServer);
    });
} else {
    console.log('[AMQ] AMQ is disabled in config');
}


//////////////////    WEB   //////////////////////
var server = http.createServer(function (req, res) {
    console.log(req.method + '\t' + req.headers.host + '\t' + req.url);
    if (req.method == 'POST' && config.web.useweb) {
        var body = '';
        req.on('data', function (data) {
            body += data;
            if (body.length > 1e6) {
                // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQUEST
                request.connection.destroy();
            }
        });
        req.on('end', function () {
            if (req.url == '/senders' && config.adminserver.enabled) {
                var decodedBody = qs.parse(body);
                functions.writeSettings('./data/senders.inc', decodedBody['senders'], function (err) {
                    if (err) {
                        console.log('Error writing file');
                        console.log(err);
                    }
                    var html = fs.readFileSync('./html/saved.html');
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(html);
                });
            } else if (req.url == '/listeners' && config.adminserver.enabled) {
                var decodedBody = qs.parse(body);
                functions.writeSettings('./data/listeners.inc', decodedBody['listeners'], function (err) {
                    if (err) {
                        console.log('Error writing file');
                        console.log(err);
                    }
                    var html = fs.readFileSync('./html/saved.html');
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(html);
                });
            } else {
                if (global.config.web.requirepostsecret && (typeof req.headers.requestadorsecret == 'undefined' || req.headers.requestadorsecret != global.config.web.requestadorsecret)) {
                    res.writeHead(401);
                    res.end('Secret not in header or secret incorrect.');
                }

                data.getSenders(function (senders) {
                    data.getListeners(function (listeners) {
                        var val = functions.loopListeners(listeners, senders, req, req.method, req.url, body);
                        if (val) {
                            res.writeHead(200, {'Content-Type': 'text/html'});
                            res.end('received');
                        } else {
                            res.writeHead(404, {'Content-Type': 'text/html'});
                            res.end('It works!');
                        }
                        var html = fs.readFileSync('./html/received.html');
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.end(html);
                    });
                });
            }
        });
    }
    else if (req.method == 'GET' && config.web.useweb) {
        if (functions.requestIsStatic(req, res)) {
            functions.serveStatic(req, res);
        }
        if (req.url == global.config.web.webpollurl) {
            var newhtml = 'ok';
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newhtml);
        } else if (req.url == '/admin' && config.adminserver.enabled) {
            var html = fs.readFileSync('./html/admin.html');
            html = html.toString();
            html = html.replace('{{socketserver}}', 'http://' + global.config.server.ip + ':' + global.config.server.port);
            var listeners = fs.readFileSync('./data/listeners.inc');
            var senders = fs.readFileSync('./data/senders.inc');
            var newhtml = html.replace('{listeners}', listeners);
            newhtml = newhtml.replace('{senders}', senders);
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(newhtml);

        } else if (req.url == '/admin/restart' && config.adminserver.enabled) {
            res.writeHead(302, {
                'Location': '/admin'
            });
            res.end();
            process.kill(global.parentPid, 'SIGHUP');
        } else {
            data.getSenders(function (senders) {
                data.getListeners(function (listeners) {
                    var val = functions.loopListeners(listeners, senders, req, req.method, req.url, body);
                    if (val) {
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.end('200:ok');
                    } else {
                        res.writeHead(404, {'Content-Type': 'text/html'});
                        res.end('404:Page not found');
                    }
                    var html = fs.readFileSync('./html/received.html');
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(html);

                });
            });
        }
    } else {
        console.log('[WEB] unsupported request type or server not enabled in config');
    }
});
global.server = server;


//////////////////    SOCKET   //////////////////////
if (config.server.usesocketio) {
    console.log('[IO] socket IO is enabled');
    global.io = require('socket.io')(server);
    console.log('[IO] attempt connect');
    //global.io.set( 'origins', '*' );
    global.io.on('connection', function (socket) {
        global.socket = socket;
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


//////////////////    START   //////////////////////
port = config.server.port;
host = config.server.ip;
if (config.server.useweb || config.server.usesocketio) {
    server.listen(port, host);
    console.log('[WEB] Listening at http://' + host + ':' + port);
} else {
    console.log('[WEB] server disabled in config');
}



