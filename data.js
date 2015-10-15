

var getListeners = function(callback){
  var listeners = [];
  var file = './data/listeners.inc';
  fs = require('fs');
  fs.readFile(file, 'utf8', function (err,data) {
    var items = data.split('\n');
    items.forEach(function(line){
      var parts = line.split('|');
      if (parts.length > 1 && line[0] != ';') {
        if (typeof parts[3] != 'undefined' && parts[3].indexOf(",")!=-1 ) {
          senderList = parts[3].split(',');
        }else{
          senderList = [parts[3]];
        }
        var listener = {
          name: parts[0],
          type: parts[1],
          url: parts[2],
          senders: senderList,
        };
        listeners.push(listener);
      }
    });
    if (err) {
      return console.log(err);
    }
    callback(listeners);
  });
  //return listeners;
}


var getSenders = function(callback){
  var senders = [];
  var file = './data/senders.inc';
  //console.log('parse FIle');
  fs = require('fs');
  //console.log(fs);
  fs.readFile(file, 'utf8', function (err,data) {
    var items = data.split('\n');
    items.forEach(function(line){
      var parts = line.split('|');
      if (parts.length > 0 && line[0] != ';') {
        var sender = {
          name: parts[0],
          type: parts[1],
          url: parts[2],
          dataType: parts[3],
        };
        senders.push(sender);
      }
    });
    callback(senders);
    if (err) {
      return console.log(err);
    }
  });
  //console.log(senders);
  //return senders;

}

module.exports = {
  getListeners: getListeners,
  getSenders: getSenders
}
