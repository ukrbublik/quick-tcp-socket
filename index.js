/**
 * Simple wrapper for net.Socket to send/receive JSON objects and Buffer streams
 *
 * @author ukrbublik
 */

const ReadBufferStream = require('./lib/BufferStream').ReadBufferStream;
const WriteBufferStream = require('./lib/BufferStream').WriteBufferStream;
const attachStreamToSocket = require('./lib/BufferStream').attachStreamToSocket;
const attachSocketToStream = require('./lib/BufferStream').attachSocketToStream;
const TcpSocket = require('./lib/TcpSocket');

module.exports = {
  ReadBufferStream: ReadBufferStream,
  WriteBufferStream: WriteBufferStream,
  TcpSocket: TcpSocket,
};

