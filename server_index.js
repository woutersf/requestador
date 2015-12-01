var forever = require('forever-monitor');
var winston = require('winston');
var fs = require('fs');
var clc = require("cli-color");
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var os = require("os");
var ini = require('ini');
var config = ini.parse(fs.readFileSync('./config/config.ini', 'utf-8'));
if (config.log.logToFile) {
    var log_file = fs.createWriteStream(config.log.logFile, {flags : 'a'});
}

/**
 *  Should we send mails, and where to?
 *
 * @type {number|*|{}}
 */
global.config = config;
var appname = config.global.name;
var sendMails = config.monitor.sendmail;
var transport = nodemailer.createTransport(smtpTransport({
    host: config.autostart.smtphost,
    port: config.autostart.smtpport,
    ignoreTLS: config.autostart.ignore_tls
}));


// Parse arguments.
var extraArguments = process.argv[2];
if ( !extraArguments ) {
    extraArguments = [];
}
var pid = process.pid.toString();

//Autostart parameters
console.log('['+pid+'][AUTOSTART] Running with arguments: ' + extraArguments);
if (typeof global.config.autostart.min_uptime == 'undefined') {
    global.config.autostart.min_uptime = 1000;
}
if (typeof global.config.autostart.spin_sleeptime == 'undefined') {
    global.config.autostart.spin_sleeptime = 1000;
}
extraArguments.push(pid);

//Start child process.
var monitorProcess = new (forever.Monitor)('server_child.js', {
    silent: true,
    uid: 'requestador',
    watch: false,
    killTree: true,
    logFile: global.config.monitor.logfile,
    logFile: global.config.monitor.logfile,
    errFile: global.config.monitor.logfile,
    minUptime: parseInt(global.config.autostart.min_uptime,10),
    spinSleepTime: parseInt(config.autostart.spin_sleeptime,10),
    args: [extraArguments]
});


monitorProcess.on('watch:restart', function(info) {
    writeRestart(appname + ': Restaring script because ' + info.file + ' changed', 'watch:restart');
});

monitorProcess.on('restart', function() {
    writeRestart(appname + ': Forever restarting script for ' + monitorProcess.times + ' time', 'restart');

});

monitorProcess.on('exit:code', function(code) {
    if(code == 143) {
        writeRestart(appname + ': Forever detected script exited with code ' + code, 'exit: code');
    }else{
        writeRestart(appname + ': Forever detected script restart (reload config).');
    }
});


/**
 * Logging
 * @type {*|string|exports.argvOptions.logFile|{alias}}
 */
var logFileName = global.config.log.logFile;
var logger = new (winston.Logger)({
    exitOnError : false,
    transports : [new winston.transports.File({
        filename : logFileName,
        'timestamp' : function() {
            return new Date(new Date().setHours(new Date().getHours() + 2)).toUTCString() + '';
        },
        maxFiles : 10,
        json : false
    })]
});

/**
 *  On restart log + mail.
 * @param message
 * @param reason
 */
function writeRestart(message, reason) {
    logger.info(message);
    var d = new Date();
    console.log(clc.red(d.getDate() + "-" + d.getMonth() + "-" + d.getFullYear() + " " + d.toLocaleTimeString() + ": " + message));
    sendMail(appname + ': ' + reason, message);
}

/**
 * Send mail
 *
 * @param subject
 * @param text
 */
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

/**
 *  Listen to SIGTERM
 *
 */
process.on('SIGTERM', function(code) {
    monitorProcess.stop();
});

/**
 *  Reboot Process, reloads config et all.
 */
process.on('SIGHUP', function() {
    gracefullRestart();
});
/**
 *  Reboot Process, reloads config et all.
 */
process.on('SIGUSR2',function(){
    gracefullRestart();
});


/**
 *  Gracefull restart
 */
var gracefullRestart = function(code){
    console.log(code);
    console.log('['+pid+'][AUTOSTART] SIGHUP signal received.');
    console.log('['+pid+'][AUTOSTART] kill child');
    monitorProcess.stop();

    setTimeout(function() {
        console.log('['+pid+'][AUTOSTART] starting child');
        monitorProcess.start();
    }, 3000);
}

/**
 * Start the works.
 */
monitorProcess.start();
