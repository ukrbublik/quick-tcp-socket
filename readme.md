Simple wrapper for net.Socket to send/receive JSON objects and Buffer streams.<br>
Made as much faster alternative to socket.io + socket.io-stream<br>
<a href='https://www.npmjs.com/package/quick-tcp-socket'><img src='https://img.shields.io/npm/v/quick-tcp-socket.svg' /> <img src='https://travis-ci.org/ukrbublik/quick-tcp-socket.svg?branch=master' /></a>

# Install
``` bash
$ npm install quick-tcp-socket
```

# API
todo...

Classes:
ReadBufferStream
WriteBufferStream
TcpSocket

WriteBufferStream.highWaterMark = 128*1024;
ReadBufferStream.highWaterMark = 128*1024;

TcpSocket options:
  // true - use pipe/unpipe, but there will be unshifts, 
  // false - manual read/write loop, no unshifts
  usePipe: true,


# todo...
Take a look at:
https://github.com/RIAEvangelist/node-ipc
https://github.com/alemures/fast-tcp
Same purpose?
