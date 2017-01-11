Simple wrapper for net.Socket to send/receive JSON objects and Buffer streams.<br>
Made as much faster alternative to socket.io + socket.io-stream<br>
<a href='https://www.npmjs.com/package/quick-tcp-socket'><img src='https://img.shields.io/npm/v/quick-tcp-socket.svg' /> <img src='https://travis-ci.org/ukrbublik/quick-tcp-socket.svg?branch=master' /></a>

# Install
``` bash
$ npm install quick-tcp-socket
```

# Use example
``` js

const {
  TcpSocket, ReadBufferStream, WriteBufferStream
} = require('quick-tcp-socket');

//
// Client
//
let clientSocket = net.connect(port, host, () => {
  client = new TcpSocket(false, clientSocket);

  client.sendPacket("getData1", {
    param1: 1,
  });
  client.once("setData1", (data) => {
    // data == {a: 1, b: 2}
  });

  client.on('close', () => { //disconnected });
  client.on('error', (err) => { console.error(err); });

  let readStream = fs.createReadStream("file.txt");
  client.sendPacketAndStreams("setStream1", {size: 100}, readStream);
});


//
// Server
//
net.createServer({}, (clientSocket) => {
  let client = new TcpSocket(true, clientSocket);

  client.on('getData1', (params) => {
    // params.param1 == 1
    client.sendPacket('setData1', {
      a: 1, b: 2
    });
  });

  client.on("setStream1", (data) => {
    // data.size == 100
    let writeStream = fs.createWriteStream("file.txt");
    client.receiveStreams([writeStream], () => {
      //stream received
    });
  });

  client.on('close', () => { //client disconnected });
  client.on('error', (err) => { console.error(err); });
});
```

# API
todo...
