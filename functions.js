/**
 * Check if file exists
 */
function checkExistingFiles() {
    checkExistingFile('./config/config.ini', false);
    checkExistingFile('./data/amqp.ini', false);
    checkExistingFile('./data/listeners.inc', false);
    checkExistingFile('./data/senders.inc', false);
}
/**
 *
 */
function checkExistingLogFiles() {
    checkExistingFile(config.log.failedRequests, true);
    if (config.log.logToFile) {
        checkExistingFile(config.log.logFile, true);
    }
}

/**
 * Check if a file exists
 */
function checkExistingFile(file, create) {
    console.log('[boot] checking file ' + file);
    var fs = require('fs');

    if (fs.existsSync(file)) {
        //No problem.
    }
    else {
        if (create) {
            fs.createWriteStream(file, {flags: 'a'});
            console.log(file + ' CREATED');
        } else {
            throw new Error('file ' + file + ' does not exist');
        }
    }
}

/**
 * FailedRequest
 */
var failedRequests = function (content) {
    var util = require('util');
    var logfile = global.config.log.failedRequests;
    //Exists
    if (!fs.existsSync(logfile)) {
        console.log('[FAILEDREQUESTS] created log file ' + logfile);
        var fd = fs.openSync(logfile, 'w');
    }
    var failed_file = fs.createWriteStream(logfile, {flags: 'a'});
    failed_file.write(util.format(content) + '\n');
    failed_file.end();
};



/**
 * connect to single Amqp Server
 */
var connectAmqpServer = function (amqpServer) {
    var data = require('./data');
    var amqp = require('amqp');
    console.log('[' + amqpServer.name + '] AMQP connecting');
    var connOptions = {
        host: amqpServer.ip,
        //heartbeat : config.amq.heartbeat,
        port: amqpServer.port,
        login: amqpServer.user,
        password: amqpServer.password,
        vhost: amqpServer.vhost
    };
    var amqpConnection;
    amqpConnection = amqp.createConnection(connOptions, {reconnectBackoffStrategy: "exponential"});
    global.amqpConnection = amqpConnection;
    amqpConnection.on('error', function (err) {
        console.log('[' + amqpServer.name + '] error ');
        console.log(err);
    });
    amqpConnection.on('end', function () {
        console.log('[' + amqpServer.name + '] ended');
    });
    amqpConnection.on('ready', function () {
        console.log('[' + amqpServer.name + '] connection ready');
        var subscribed = [];
        data.getSenders(function (senders) {
            data.getListeners(function (listeners) {
                listeners.forEach(function (listener) {
                    if (listener.type.toUpperCase() == 'AMQP' && listener.server == amqpServer.name) {
                        console.log('received on correct listener.');
                        console.log(listener.server);
                        var options = {
                            autoDelete: false,
                            durable: false,
                            closeChannelOnUnsubscribe: true,
                            noDeclare: true
                        };
                        amqpConnection.queue(listener.queue, options, function (q) {
                            console.log('[' + amqpServer.name + '] queue connected ' + listener.queue);
                            //var subscribeOptions = {ack: true};//Ack manually
                            var subscribeOptions = {ack: false};//Ack immedately
                            q.subscribe(subscribeOptions, function (message, headers, deliveryInfo, messageObject) {
                                console.log('=============AMQ MESG================');
                                console.log('[' + amqpServer.name + '] [' + listener.url + ']received on Queue: ');
                                console.log('[' + amqpServer.name + '] [headers]');
                                console.log(headers);
                                console.log('[' + amqpServer.name + '] [deliveryInfo]');
                                console.log(deliveryInfo);
                                if (typeof message.data != 'undefined') {
                                    message = message.data.toString('utf8');
                                }
                                console.log(message);
                                json = message;

                                var trigger = {};
                                trigger.type = 'AMQP';
                                trigger.message = messageObject;
                                trigger.queue = q;

                                module.exports.loopListeners(listeners, senders, null, 'AMQP', listener.url, json, headers, trigger);
                            });
                        });
                    }
                });
            });
        });
    });
    amqpConnection.on('close', function (msg) {
        console.log("[" + amqpServer.name + "] connection closed: " + msg);
    });
    global.amqpConnections.push(amqpConnection);
};


/**
 * Do sending
 */
var executeSender = function (req, sender, body, headers, trigger) {
    if (sender.type == 'POST') {
        module.exports.executeSenderHTTP(req, sender, body, headers, trigger);
    }
    if (sender.type == 'GET') {
        module.exports.executeSenderHTTP(req, sender, null, headers, trigger);
    }
    if (sender.type == 'SOCKET') {
        module.exports.executeSenderSOCKET(req, sender, body, headers);
        module.exports.ackTrigger(trigger);
    }
    if (sender.type == 'AMQP') {
        module.exports.executeSenderAMQP(req, sender, body, headers);
        module.exports.ackTrigger(trigger);
    }
};

var ackTrigger = function (trigger) {
    // Dead lettering is not supportet at the moment.
    // if (typeof trigger != 'undefined' && trigger.type  == 'AMQP') {
    //     module.exports.ackAmqpObject(trigger.message);
    // }
};

var rejectTrigger = function (trigger) {
    // Dead lettering is not supportet at the moment.
    // if (typeof trigger != 'undefined' && trigger.type  == 'AMQP') {
    //     module.exports.rejectAmqpObject(trigger);
    // }
};

var ackAmqpObject = function (amqpObject) {
    if (typeof amqpObject != 'undefined') {
        console.log('[AMQP] ack amqp message');
        amqpObject.acknowledge(false);
    }
};

var rejectAmqpObject = function (trigger) {
    if (typeof trigger != 'undefined') {
        console.log('[AMQP] reject amqp message');
        trigger.queue.shift(true, false);
    }

};

/**
 * Do HTTP POST sending
 */
var executeSenderHTTP = function (req, sender, body, headers, trigger) {
    var request = require('request');
    var querystring = require('querystring');
    var PostHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
    };
    console.log('[HTTP] sender HTTP');
    console.log(sender);
    for (var p in headers) {
        if (headers.hasOwnProperty(p)) {
            //result += p + " , " + obj[p] + "\n";
            PostHeaders['Forwarded-header-' + p] = headers[p];
        }
    }
    if (sender.type == 'POST') {
        //POST
        var postObject = {
            headers: PostHeaders,
            url: sender.url,
            body: require('querystring').stringify(body)
        };
        if (global.config.proxy.proxy_enabled) {
            console.log('[HTTP] PROXY: ' + 'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port);
            var proxy = 'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port;
            var HttpProxyAgent = require('http-proxy-agent');
            var agent = new HttpProxyAgent(proxy);
            postObject.agent = agent;
            postObject.proxy = proxy;
        }
        request.post(postObject, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('[POSTREQUEST] request returned OK');
                console.log(body);
                module.exports.ackTrigger(trigger);
            } else {
                console.log('[POSTREQUEST] request returned NOK: ');
                var postResultObject = postObject;
                postResultObject.error = error;
                failedRequests(JSON.stringify(postResultObject));
                module.exports.rejectTrigger(trigger);
            }
        });
    } else {
        //GET
        var getObject = {
            url: sender.url,
            method: sender.type,
            headers: headers,
        };
        if (global.config.proxy.proxy_enabled) {
            console.log('[HTTP] PROXY: ' + 'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port);
            var proxy = 'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port;
            var HttpProxyAgent = require('http-proxy-agent');
            var agent = new HttpProxyAgent(proxy);
            getObject.agent = agent;
            getObject.proxy = proxy;
        }

        // Start the request
        request(getObject, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('[GETREQUEST] request returned OK');
                // Print out the response body
                console.log(body);
                module.exports.ackTrigger(trigger);
            } else {
                console.log('[GETREQUEST] request returned NOK: ', error);
                var getResultObject = getObject;
                getResultObject.error = error;
                failedRequests(JSON.stringify(getResultObject));
                module.exports.rejectTrigger(trigger);
            }
        });
    }
};


/**
 * Do AMQP sending
 */
var executeSenderAMQP = function (req, sender, body, headers) {
    if (!global.config.amqp.useamq) {
        console.log('[AMQP] AMQP is disabled');
        return false;
    }
    console.log('[AMQP] send to queue ', sender, body, headers);
    console.log(sender);
    console.log(body);
    console.log(headers);
    //var senderParts =
    var body = 'testbody';
    if (typeof global.amqpConnection != 'undefined') {
        //amqpConnection.
        console.log('[AMQP] connected');
        var queueOptions = {
            autoDelete: false,
            durable: false,
            closeChannelOnUnsubscribe: true,
        };
        global.amqpConnection.queue(sender.queue, queueOptions, function (q) {
            var exchangeOptions = {
                type: 'topic', //'direct', 'fanout'
            };
            global.amqpConnection.exchange(sender.exchange, exchangeOptions, function (exchange) {
                console.log('[AMQP] exchange created ', sender.exchange);
                queue = q;
                queue.bind(exchange, sender.key);
                console.log('[AMQP] exchange added to queue ', sender.exchange, sender.queue);
                var options = {};
                options.headers = {};
                exchange.publish(sender.key, body, options, function () {
                    console.log('[AMQP] Published to Exchange ' + exchange.name + ' message:', body);
                })
            });
        });
    }
};
/**
 * Do socket sending
 */
var executeSenderSOCKET = function (req, sender, body, headers) {
    if (!global.config.server.usesocketio) {
        console.log('[SOCKET] SOCKET is disabled');
        return false;
    }
    console.log('[SOCKET] execute socket ' + sender.url);
    if (typeof global.io.sockets != 'undefined') {
        global.io.sockets.emit(sender.url, body);
        console.log('[SOCKET] pushed');
    }
};

/**
 * Loop listeners
 */
var loopListeners = function (listeners, senders, req, method, uri, body, headers, trigger) {
    var qs = require('querystring');
    var ret = false;
    listeners.forEach(function (listener) {
        if (listener.type == method && listener.url == uri) {
            listener.senders.forEach(function (senderName) {
                senders.forEach(function (sender) {
                    if (sender.name == senderName) {
                        module.exports.executeSender(req, sender, body, headers, trigger);
                        ret = true;
                    }
                });
            });
        }
    });
    return ret;
};


/**
 * Write contents to a file.
 */
var writeSettings = function (file, data, callback) {
    var fs = require('fs');
    fs.writeFile(file, data, function (err) {
        if (err) {
            console.log(err);
            callback(err);
        }
        console.log("The file was saved!");
        callback();
    });
};




module.exports = {
    connectAmqpServer: connectAmqpServer,
    executeSenderAMQP: executeSenderAMQP,
    executeSenderSOCKET: executeSenderSOCKET,
    executeSenderHTTP: executeSenderHTTP,
    loopListeners: loopListeners,
    executeSender: executeSender,
    writeSettings: writeSettings,
    rejectAmqpObject: rejectAmqpObject,
    ackAmqpObject: ackAmqpObject,
    ackTrigger: ackTrigger,
    rejectTrigger: rejectTrigger,
    checkExistingFiles: checkExistingFiles,
    checkExistingLogFiles: checkExistingLogFiles
};
