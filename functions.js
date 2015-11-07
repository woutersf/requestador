/**
 * FailedRequests
 */
var failedRequest = function(content) {
    var util = require('util');
    var logfile = global.config.log.failedRequests;
    var failed_file = fs.createWriteStream(logfile, {flags : 'a'});
    failed_file.write(util.format(content) + '\n');
};

/**
 * Do sending
 */
var executeSender = function(req, sender, body, headers){
    if (sender.type == 'POST') {
        module.exports.executeSenderHTTP(req, sender, body, headers);
    }
    if (sender.type == 'GET') {
        module.exports.executeSenderHTTP(req, sender, headers);
    }
    if (sender.type == 'SOCKET') {
        module.exports.executeSenderSOCKET(req, sender, body, headers);
    }
    if (sender.type == 'AMQP') {
        module.exports.executeSenderAMQP(req, sender, body, headers);
    }
}

/**
 * Do HTTP POST sending
 */
var executeSenderHTTP = function(req, sender, body, headers){
    var request = require('request');
    if (global.config.proxy.proxy_enabled) {
        console.log('[HTTP] PROXY: ' + 'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port);
        request = request.defaults({'proxy':'http://' + global.config.proxy.proxy_server + ':' + global.config.proxy.proxy_port});
    }
    var querystring = require('querystring');
    var PostHeaders = {
        'Content-Type':     'application/x-www-form-urlencoded',
    }
    console.log('[HTTP] sender HTTP');
    console.log(sender);
    for (var p in headers) {
        if( headers.hasOwnProperty(p) ) {
            //result += p + " , " + obj[p] + "\n";
            PostHeaders['Forwarded-header-' + p] = headers[p];
        }
    }
    if (sender.type == 'POST') {
        //POST
        var postObject = {
          headers: PostHeaders,
          url:     sender.url,
          body:    body
        };
        request.post(postObject, function(error, response, body){
          if (!error && response.statusCode == 200) {
                console.log('[POSTREQUEST] request returned OK');
                console.log(body)
            } else {
                console.log('[POSTREQUEST] request returned NOK: ' , error);
                var postResultObject = postObject;
                postResultObject.error = error;
                failedRequest(JSON.stringify(postResultObject));
            }
        });
    }else{

        //GET
        var getObject = {
            url: sender.url,
            method: sender.type,
            headers: headers,
        }

        // Start the request
        request(getObject, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('[GETREQUEST] request returned OK');
                // Print out the response body
                console.log(body)
            } else {
                console.log('[GETREQUEST] request returned NOK: ' , error);
                var getResultObject = getObject;
                getResultObject.error = error;
                failedRequest(JSON.stringify(getResultObject));
            }
        });
    }
}


/**
 * Do AMQP sending
 */
var executeSenderAMQP = function(req, sender, body, headers){
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
        global.amqpConnection.queue(sender.queue, queueOptions, function(q) {
            var exchangeOptions = {
                type: 'topic', //'direct', 'fanout'
            };
            global.amqpConnection.exchange(sender.exchange, exchangeOptions, function(exchange){
                console.log('[AMQP] exchange created ', sender.exchange);
                queue = q;
                queue.bind(exchange, sender.key);
                console.log('[AMQP] exchange added to queue ', sender.exchange, sender.queue);
                var options = {};
                options.headers = {};
                exchange.publish(sender.key, body, options, function(){
                    console.log('[AMQP] Published to Exchange ' + exchange.name + ' message:', body);
                })
            });
        });
    }
}
/**
 * Do socket sending
 */
var executeSenderSOCKET = function(req, sender, body, headers){
    if (!global.config.server.usesocketio) {
        console.log('[SOCKET] SOCKET is disabled');
        return false;
    }
    console.log('[SOCKET] execute socket ', sender.url);
    if (typeof global.socket != 'undefined') {
        global.socket.broadcast.emit(sender.url, body);
        console.log('[SOCKET] pushed');
    }
}

/**
 * Loop listeners
 */
var loopListeners = function(listeners, senders, req, method, uri, body, headers){
    var ret = false;
    listeners.forEach(function(listener){
        if (listener.type == method && listener.url == uri)  {
            listener.senders.forEach(function(senderName){
                senders.forEach(function(sender){
                    if (sender.name == senderName) {
                        module.exports.executeSender(req, sender, body, headers);
                        ret =  true;
                    }
                });
            });
        }
    });
    return ret;
}


/**
 * Write contents to a file.
 */
var writeSettings = function(file, data, callback){
    var fs = require('fs');
    fs.writeFile(file, data, function(err) {
        if (err) {
            console.log(err);
            callback(err);
        }
        console.log("The file was saved!");
        callback();
    });


}

var requestIsStatic = function(req,res){
    if(req.url.indexOf('.jpg')> 0 || req.url.indexOf('.gif')> 0 || req.url.indexOf('.png')> 0 || req.url.indexOf('.js')> 0 || req.url.indexOf('.css')> 0) {
        return true;
    }
    return false;
}

var serveStatic = function(req,res){
    //var path = require('path');
    var fs = require('fs');
    if (req.url.indexOf('js')> 0){
        var file = './' + req.url;
    }else if (req.url.indexOf('css')> 0){
        var file = './' + req.url;
    }else{
        var file = './' + req.url;
        console.log(file);
    }
    if (fs.existsSync(file)) {
        var fs = require('fs');
        var html = fs.readFileSync(file);
        var mime = require('mime')
        var mimetype = mime.lookup(file);
        res.writeHead(200, {'Content-Type': mimetype});
        res.end(html);
    }else{
        res.writeHead(404, {'Content-Type': 'text/html'});
        res.end('file does not exist');
    }
}


module.exports = {
  executeSenderAMQP: executeSenderAMQP,
  executeSenderSOCKET: executeSenderSOCKET,
  executeSenderHTTP: executeSenderHTTP,
  loopListeners: loopListeners,
  executeSender: executeSender,
  requestIsStatic: requestIsStatic,
  serveStatic: serveStatic,
  writeSettings: writeSettings
}
