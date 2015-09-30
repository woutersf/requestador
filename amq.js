var ini = require('ini')
var functions = require('./functions');
var data = require('./data');
var http = require('http');
var request = require('request');
fs = require('fs');
var mime = require('mime');
var qs = require('querystring');
var Stomp = require('stomp-client');
var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'));




//////////////////    AMQ   //////////////////////
if (config.amq.useamq) {
    console.log('[AMQ] AMQ is enabled');
    try{
        var client = new Stomp(config.amq.ip, config.amq.port, config.amq.user, config.amq.password);
        client.connect(function(sessionId) {
            data.getSenders(function(senders){
                data.getListeners(function(listeners){
                    listeners.forEach(function(listener){
                        if (listener.type.toUpperCase() == 'AMQ') {
                            client.subscribe(listener.url, function(body, headers) {
                                console.log('=============AMQ MESG================');
                                console.log('[AMQ] [' + listener.url + ']received on Queue: ' , body);
                                functions.loopListeners(listeners, senders, null, 'AMQ', listener.url, body);
                            });
                        }
                    });
                });
            });
        },function(err){
          console.log('[AMQ] could not connect to AMQ');
        });
    }
    catch(e) {
        console.log('[AMQ] could not connect to AMQ');
        console.log(e);
    }
}else{
    console.log('[AMQ] AMQ is disabled in config');
}
