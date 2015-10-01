# Requestador #
This is under development and in no way ready for production yet.


You could call it a relay, or a hub or whatever.
##### HTTP / SOCKET / (rabbitMQ) amqp mediator #####

More info about
* SOCKET https://github.com/socketio/socket.io
* HTTP (POSt + GET)


## Installation ##
* npm install
* configure settings in data/config.ini

## Run ##
* node index.js (for socket + web)
* node amq.js (for amqp listening)

## Intro ##
Sometimes you need POSTs to be GET's, GEt's to become POST's or
either one of the to become PUSH on socket.
Listen to An rabbitMQ queue and on event push data to POST?
This is what Requestador does for you.

## Listeners ##
Listeners are configured in listeners.inc
The formatting of this file is like this:

name | method | uri | senders_csv

* name: a unique identifier for a listener
* method:  POST/GET/SOCKET/AMQ
* uri: The socket channel "testchannel" or a certain uri "/testuri" on the current domain.
* senders_csv: a comma separated list of SENDER ID's.

## Senders ##
Senders are configured in senders.inc
The formatting of this file is like this:

name | method | url | data
* name: A unique name for this sender
* method: POST/GET/SOCKET/AMQ
* url: the full url to POST/GET to or the channel to SOCKET/AMQ to
e.g. "tstchannel" or "http://mydomain/url/to_/post/to"
* data: Allowerd datatypes: forward (forward postbody or socket msg) empty or fixed
