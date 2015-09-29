# Requestador #
##### your next web hub/relay/mediator #####

## Installation ##
npm install

## Run ##
node index.js


## Intro ##
Sometimes you need POSTs to be GET's, GEt's to become POST's or
either one of the to become PUSH on socket.
This is what Requestador does for you.


## Listeners ##
Listeners are configured in listeners.inc
The formatting of this file is like this:

name | method | uri | senders_csv

* name: a unique identifier for a listener
* method:  POST/GET/SOCKET
* uri: The socket channel "testchannel" or a certain uri "/testuri" on the current domain.
* senders_csv: a comma separated list of SENDER ID's.

## Senders ##
Senders are configured in senders.inc
The formatting of this file is like this:

name | method | url | data
* name: A unique name for this sender
* method: POST/GET/SOCKET
* url: the full url to POST/GET to or the channel to SOCKET to
e.g. "tstchannel" or "http://mydomain/url/to_/post/to"
* data: Allowerd datatypes: forward (forward postbody or socket msg) empty or fixed
