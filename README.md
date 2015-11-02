# Requestador #

## Intro ##
Sometimes you need POSTs to be GET's, POST to become socket messages or
just listen on an amqp queue an put that stuff out there (POST/GET/socket)

This is what Requestador does for you.

You could call it a relay, or a hub or whatever.

HTTP / SOCKET / (rabbitMQ) amqp mediator

## Installation ##
* npm install
* configure settings in data/config.ini

## Requirements ##
* are in package.json.
* I run it on node v0.10.33, so anything more recent should work.

## Configuration ##
rename your config.ini.example to config.ini and set your settings.

Section of AMQP settings

```ini
[amqp]
useamq=true
ip=127.0.0.1
port=5672
user=guest
password=guest
heartbeat=25
vhost=/
```

Section of socket settings
```ini
[server]
usesocketio=true
ip=127.0.0.1
port=3000
```

Section of Webserver settings
```ini
[web]
useweb=true
ip=127.0.0.1
port=3000
```

Section of Proxy settings
Enable routing all outgoing requests through a proxy server.
```ini
[proxy]
proxy_enabled=true
proxy_server=127.0.0.1
proxy_port=3000
```

Section of Logging settings
```ini
[log]
logFile=/var/log/requestador.log
logToFile=true
logToConsole=true
failedRequests=/var/log/failedRequests.log
```

Section of Monitoring settings
```ini
[monitor]
logFile=/var/log/requestador.log
active=true
sendmail=true
polltimeout=3000 (milliseconds)
monitorMailFrom=monitor@requestador.com
monitorMailTo=woutersf@gmail.com
monitorMailSubject=Er was een probleem
sendmailPath=/usr/sbin/sendmail
sendmailArgs= -t -f woutersf@gmail.com
```

## Run ##
* `node server.js`
Or if you want it running continuously (forever), and restart after craches
* `node autostart.js`
This is better than but uses the same logic as
* `forever -c node server.js`


connects to amqp , creates webserver, and socket server

## Listeners ##
Listeners are configured in listeners.inc
The formatting of this file is like this:

name | method | uri | senders_csv

* name: a unique identifier for a listener
* method:  POST/GET/SOCKET/AMQP
* uri: The socket channel "testchannel" or a certain uri "/testuri" on the current domain.
  * foramqp this is in the format "QUEUE:key:exchange"
  * e.g. /queue/someQueueName:#.be.test.key:requestador.topic
* senders: a comma separated list of SENDER NAMES eg(DOPOST,DOSOCKET,DOAMQP).

## Senders ##
Senders are configured in senders.inc
The formatting of this file is like this:

name | method | url | data
* name: A unique name for this sender
* method: POST/GET/SOCKET/AMQP
* url: the full url to POST/GET to or the channel to SOCKET/AMQ to
e.g. "tstchannel" or "http://mydomain/url/to_/post/to"
* data: Allowerd datatypes: forward (forward postbody or socket msg) empty or fixed

## Monitoring ##
It's best to connect Nagios to the polling path of the server: "/requestadorPoll"
If you dont have that, you can run "node monitor.js" This script will alert you via email if the servers stops running.
It's best to configure (and test) your monitoring in config.ini before you use it in production.
