var ini = require('ini')
var fs = require('fs');
var http = require('http');
var request = require('request');
var util = require('util');
//var data = require('./data');
var config = ini.parse(fs.readFileSync('./data/config.ini', 'utf-8'));
global.config = config;

var log_file = fs.createWriteStream(__dirname + config.monitor.logFile, {flags : 'w'});
var log_stdout = process.stdout;

console.log = function(d) { //
    if (config.log.logToFile) {
        log_file.write(util.format(d) + '\n');
    }
    if (config.log.logToConsole) {
        log_stdout.write(util.format(d) + '\n');
    }
};

/**
 *
 */
function sendMail(pollUrl){
  var nodemailer = require('nodemailer');
  // create reusable transporter object using SMTP transport
  var transporter = nodemailer.createTransport('sendmail',
      {
          path: global.config.monitor.sendmailPath,
          args: global.config.monitor.sendmailArgs
      });
  // NB! No need to recreate the transporter object. You can use
  // the same transporter object for all e-mails
  // setup e-mail data with unicode symbols
  var mailOptions = {
      from: global.config.monitor.monitorMailFrom, // sender address
      to: global.config.monitor.monitorMailTo, // list of receivers
      subject: global.config.monitor.monitorMailSubject, // Subject line
      text: 'There was a problem polling ' + pollUrl + '/nPlease check installation.', // plaintext body
      html: 'There was a problem polling ' + pollUrl + '/nPlease check installation.' // html body
  };
  // send mail with defined transport object
  transporter.sendMail(mailOptions, function(error, info){
      if(error){
          return console.log(error);
      }
      console.log('Message sent: ' + info.response);
  });//

}

/**
 * Do the request.
 */
function doRequest(){
  //GET
  var pollUrl = 'http://' + global.config.web.ip + ':' + global.config.web.port + '/requestadorPoll';
  var options = {
      url: pollUrl,
      method: 'GET',
      headers: {},
  }

  // Start the request
  request(options, function (error, response, body) {
      if (!error && response.statusCode == 200) {
      } else {
          console.log('[GETREQUEST] SERVER DOWN!' , error);
          sendMail(pollUrl);
      }
  })
}

/**
 * infinite Loop
 */
function doLoop(){
  setTimeout(function() {
      doRequest();
      doLoop();
  }, 3000);
}

/**
 *
 */
if (global.config.monitor.active) {
  console.log('[monitor] monitoring enabled in config');
  doLoop();
}else{
  console.log('[monitor] monitoring disabled in config');
}

