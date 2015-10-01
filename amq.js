var ini = require('ini')
var functions = require('./functions');
var data = require('./data');
var http = require('http');
var request = require('request');
fs = require('fs');
var mime = require('mime');
var qs = require('querystring');
var amqp = require('amqp');
var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'));


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

        //events
        //connect/data/error/ready/end

        amqpConnection.on('error', function(err) {
            console.log('[AMQP] error ',err);
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
                                    durable: true,
                                };
                                amqpConnection.queue(listener.url, options, function(q) {
                                    console.log('[AMQP] queue created ', listener.url);
                                    queue = q;
                                    queue.bind(config.amqp.exchange);
                                    subscribed.push(listener);
                                    q.subscribe(function(message, headers, deliveryInfo) {

                                        console.log('=============AMQ MESG================');
                                        console.log('[AMQ] [' + listener.url + ']received on Queue: ' );

                                        console.log('[AMQ] [headers]', headers );
                                        console.log('[AMQ] [deliveryInfo]', deliveryInfo );
                                        console.log('[AMQ] [message]', message.data.toString('utf-8') );
                                        functions.loopListeners(listeners, senders, null, 'AMQP', listener.url, message.data.toString('utf-8'));
                                    });
                                    console.log('[AMQP] listeners subscribed: ');
                                    console.log(subscribed);
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
