var forever = require('forever-monitor');
var winston = require('winston');
var fs = require('fs');
var clc = require("cli-color");
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var os = require("os");
var ini = require('ini');

var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'));
var log_file = fs.createWriteStream(__dirname + config.log.logFile, {flags : 'a'});
global.config = config;
var appname = config.global.name;
var sendMails = true;
var transport = nodemailer.createTransport(smtpTransport({
    host: config.autostart.smtphost,
    port: config.autostart.smtpport,
    ignoreTLS: config.autostart.ignore_tls
}));

var extraArguments = process.argv[2];
if ( !extraArguments ) {
    extraArguments = [];
}
console.log('[AUTOSTART] Running with arguments: ' + extraArguments);

var monitorProcess = new (forever.Monitor)('server.js', {
    minUptime: global.config.autostart.min_uptime,
    spinSleepTime: config.autostart.spin_sleeptime,
    args: [extraArguments]
});

monitorProcess.on('watch:restart', function(info) {
        writeRestart(appname + ': Restaring script because ' + info.file + ' changed', 'watch:restart');
});

monitorProcess.on('restart', function() {
    writeRestart(appname + ': Forever restarting script for ' + monitorProcess.times + ' time', 'restart');
});

monitorProcess.on('exit:code', function(code) {
    writeRestart(appname + ': Forever detected script exited with code ' + code, 'exit: code');
});

var logger = new (winston.Logger)({
    exitOnError : false,
    transports : [new winston.transports.File({
        filename : global.config.log.logFile,
        'timestamp' : function() {
            return new Date(new Date().setHours(new Date().getHours() + 2)).toUTCString() + '';
        },
        maxFiles : 10,
        json : false
    })]
});

function writeRestart(message, reason) {
    logger.info(message);
    var d = new Date();
    console.log(clc.red(d.getDate() + "-" + d.getMonth() + "-" + d.getFullYear() + " " + d.toLocaleTimeString() + ": " + message));
    sendMail(appname + ': ' + reason, message);
}

function sendMail(subject, text){
    if (sendMails) {
        transport.sendMail({
                from: global.config.monitor.monitorMailFrom,
                to: global.config.monitor.monitorMailTo,
                subject: subject,
                text: text
            }, function(error, info){
            if(error){
                logger.error('Error mail not sent!: ' + error);
            }else{
                logger.info('Mail sent: ' + info.response);
            }
        });
    }
}


process.on('SIGTERM', function(code) {
    sendMails = false;
    monitorProcess.stop();
});



monitorProcess.start();
