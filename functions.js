
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
    var querystring = require('querystring');
    var PostHeaders = {
        'Content-Type':     'application/x-www-form-urlencoded',
    }
    console.log('sender HTTP',headers);
    for (var p in headers) {
        if( headers.hasOwnProperty(p) ) {
            //result += p + " , " + obj[p] + "\n";
            console.log('foreach',p, headers[p]);
            PostHeaders['Forwarded-header-' + p] = headers[p];
        }
    }
    console.log('PostHeaders', PostHeaders);
    if (sender.type == 'POST') {
        //POST
        request.post({
          headers: PostHeaders,
          url:     sender.url,
          body:    body
        }, function(error, response, body){
          if (!error && response.statusCode == 200) {
                console.log('[POSTREQUEST] request returned OK');
                console.log(body)
            } else {
                console.log('[POSTREQUEST] request returned NOK: ' , error);
            }
        });
    }else{

        //GET
        var options = {
            url: sender.url,
            method: sender.type,
            headers: headers,
        }

        // Start the request
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('[GETREQUEST] request returned OK');
                // Print out the response body
                console.log(body)
            } else {
                console.log('[GETREQUEST] request returned NOK: ' , error);
                //console.log(body);
            }
        })
    }
}


/**
 * Do AMQP sending
 */
var executeSenderAMQP = function(req, sender, body, headers){
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
    console.log('[SOCKET] execute socket ', sender.url);
    if (typeof global.socket != 'undefined') {
        global.socket.emit(sender.url, body);
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
                        console.log('[SENDER] matched ', senderName);
                        module.exports.executeSender(req, sender, body, headers);
                        ret =  true;
                    }
                });
            });
        }
    });
    return ret;
}

var writeSettings = function(req, res, file, data, callback){
    var fs = require('fs');
    fs.writeFile(file, data, function(err) {
        if(err) {
            return console.log(err);
        }
        callback();
        console.log("The file was saved!");
    });


}

var requestIsStatic = function(req,res){
    if(req.url.indexOf('.jpg')> 0 || req.url.indexOf('.gif')> 0 || req.url.indexOf('.png')> 0 || req.url.indexOf('.js')> 0 || req.url.indexOf('.css')> 0) {
        return true;
    }
    return false;
}

var serveStatic = function(req,res){
    var path = require('path');
    if (req.url.indexOf('js')> 0){
        var file = './' + req.url;
    }else if (req.url.indexOf('css')> 0){
        var file = './' + req.url;
    }else{
        var file = './' + req.url;
        console.log(file);
    }
    if (path.existsSync(file)) {
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
