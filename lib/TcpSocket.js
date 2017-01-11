/**
 * Works much faster than socket.io + socket.io-stream
 *
 * @author ukrbublik
 */

const net = require('net');
const fs = require('fs');
const EventEmitter = require('events');
const ReadBufferStream = require('./BufferStream').ReadBufferStream;
const WriteBufferStream = require('./BufferStream').WriteBufferStream;
const attachStreamToSocket = require('./BufferStream').attachStreamToSocket;
const attachSocketToStream = require('./BufferStream').attachSocketToStream;
const Readable = require('stream').Readable;
const Writable = require('stream').Writable;

class TcpSocket extends EventEmitter {
  /**
   * @param bool isServer
   * @param Socket socket
   * @param object options
   *  Options keys:
   *   bool usePipe - true to use pipe/unpipe (but there will be unshifts), false - manual read/write loop, no unshifts
   */
  constructor(isServer, socket, options) {
    super();

    let defaultOptions = {
      log: false,
      // true - validate data (ensure that there are no json in raw data streams)
      debug: false,
      dumpToFiles: false,
      // true - use pipe/unpipe, but there will be unshifts, 
      // false - manual read/write loop, no unshifts
      usePipe: true,
    };
    this.options = Object.assign(defaultOptions, options);
    this.socket = socket;
    this.socket.on('data', this.onData.bind(this));
    this.socket.on('close', this.onClose.bind(this));
    this.socket.on('error', this.onError.bind(this));

    this.packetBegin = '---BEGIN---';
    this.packetBeginBuffer = Buffer.from(this.packetBegin);
    this.packetEnd = '---END---';
    this.packetEndBuffer = Buffer.from(this.packetEnd);
    this.lenDelim = '#';
    this.lenDelimBuffer = Buffer.from(this.lenDelim);

    this.buffer = null;
    this.readSources = [];
    this.currentReadSource = null;
    this.writeTargets = [];
    this.currentWriteTarget = null;
    this.data = {}; //optional data to save info about socket
    this.data._port = (isServer ? socket.localPort : socket.remotePort);

    this.logOffset = 0;

    if (this.options.dumpToFiles) {
      this._dumpR = fs.openSync(""+(isServer?'s_':'c_')+this.data._port+'.socket', 'w');
      this._dumpW = fs.openSync(""+(isServer?'c_':'s_')+this.data._port+'_w.socket', 'w');
    }
  }

  disconnect() {
    if (!this.socket) return;
    this.socket.end();
  }

  onError(err) {
    this._emitError(err);
  }

  onClose() {
    this.socket.removeAllListeners();
    this.socket = null;
    this._emit('close');
  }

  onData(data, isRestData = false) {
    if (!this.socket) return;

    if (this.options.dumpToFiles && !isRestData && !this.socket.unshifting) {
      fs.appendFileSync(this._dumpR, data);
    }

    if (this._processingReadLoop) {
      //do nothing
    } else {
      this._parseJsonPacket(data);
    }
  }

  _parseJsonPacket(data) {
    this._parsingJsonPackets = true;
    this._logStart("ondata");
          
    if (this.buffer === null) {
      this.buffer = data;
    } else {
      this.buffer = Buffer.concat([this.buffer, data], this.buffer.length + data.length);
    }

    let startPos = -1,
      delimPos = -1,
      endPos = -1,
      parsedAnyPacket = false,
      notFullPacket = false,
      parsedPacket = false,
      parsedOffset = 0;
    while((startPos = this.buffer.indexOf(this.packetBeginBuffer, 0)) != -1) {
      parsedPacket = false;
      notFullPacket = false;
      delimPos = this.buffer.indexOf(this.lenDelimBuffer, startPos + this.packetBeginBuffer.length);
      if (delimPos != -1) {
        let lenString = null,
          endBuffer = null,
          dataString = null,
          packet = null,
          len = NaN;
        lenString = this.buffer.slice(startPos + this.packetBeginBuffer.length, delimPos).toString();
        if (lenString.length <= 10) {
          len = parseInt(lenString);
          if (!isNaN(len)) {
            endPos = delimPos + this.lenDelimBuffer.length + len;
            if (this.buffer.length >= (endPos + this.packetEndBuffer.length)) {
              endBuffer = this.buffer.slice(endPos, endPos + this.packetEndBuffer.length);
              if (endBuffer.equals(this.packetEndBuffer)) {
                dataString = this.buffer.slice(delimPos + this.lenDelimBuffer.length, endPos).toString();
                try {
                  packet = JSON.parse(dataString);
                } catch(e) {
                  this._emitError("Can't parse data as JSON: " + dataString);
                }
                if (packet) {
                  parsedOffset = endPos + this.packetEnd.length;
                  parsedPacket = true;
                  parsedAnyPacket = true;
                  if(startPos != 0) {
                    if(this.options.debug)
                      console.error("Skipped data: ", 
                        this.buffer.slice(0, Math.min(startPos, 20)), 
                        this.buffer.slice(Math.max(startPos-20, 0), startPos));
                    this._emitError("Skipped " + startPos + " bytes while parsing JSON packet " + packet.msg);
                  }
                  if (parsedOffset == this.buffer.length)
                    this.buffer = null;
                  else
                    this.buffer = this.buffer.slice( parsedOffset, this.buffer.length );
                  this._log('got packet ' + packet.msg);
                  this._emit(packet.msg, packet.data);
                  if (this._processingReadLoop)
                    break; //now reading to specific stream
                  if (this.buffer === null)
                    break; //no more data
                }
              } else 
                this._emitError("Malformed packet: no end");
            } else
              notFullPacket = true;
          } else 
            this._emitError("Malformed packet: length = " + lenString);
        } else 
          this._emitWarning("Hmm, probably not JSON packet: too long length = " + lenString);
      } else if(this.buffer.length >= (startPos + this.packetBeginBuffer.length + 10 + 1))
        this._emitWarning("Hmm, probably not JSON packet: can find len delimeter in 10+1 bytes after start");
        else
          notFullPacket = true;

      if (!parsedPacket)
        break;
    }

    if (!this._processingReadLoop && this.buffer && this.buffer.length
      && !parsedAnyPacket && !notFullPacket) {
      if (this.options.debug)
        console.error("Not parsed data: ", this.buffer.slice(0, 20), this.buffer.slice(-20));
      this._emitWarning("Data ("+this.buffer.length+" bytes) not parsed as JSON packet");
    }

    this._parsingJsonPackets = false;
    this._logEnd("ondata");
  }

  emit(eventName, ...args) {
    throw new Error('Unsupported');
  }
  _emit(eventName, ...args) {
    super.emit(eventName, ...args);
  }
  _emitError(str) {
    this._logError(str);
    this._emit("error", str);
    if(this.options.debug)
      throw new Error(str);
  }
  _emitWarning(str) {
    this._logWarn(str);
    this._emit("warning", str);
    if(this.options.debug)
      throw new Error(str);
  }

  _formatLog(s) {
    let str = '[' + this.data._port + '] ';
    str += ' '.repeat(this.logOffset);
    str += s;
    return str;
  }
  _log(s) {
    if (!this.options.log) return;
    console.log(this._formatLog(s));
  }
  _logError(s) {
    if (!this.options.log) return;
    console.error(this._formatLog('!!! Error: ' + s));
  }
  _logWarn(s) {
    if (!this.options.log) return;
    console.warn(this._formatLog('!!! Warning: ' + s));
  }
  _logStart(groupName) {
    if (!this.options.log) return;
    this._log(groupName + ' {');
    this.logOffset++;
  }
  _logEnd(groupName) {
    if (!this.options.log) return;
    this.logOffset--;
    this._log('} ' + groupName);
  }

  sendPacket(msg, data, callback, andProcessWriteLoop = true) {
    let packet = this.formatPacket(msg, data);
    let stream = new ReadBufferStream(packet);
    this.sendStream(stream, callback, andProcessWriteLoop);
  }

  formatPacket(msg, data = null) {
    let packet = {
      msg: msg,
      data: data
    };
    let packetJson = JSON.stringify(packet);
    let packetFull = this.packetBegin + packetJson.length + this.lenDelim + packetJson + this.packetEnd;
    return packetFull;
  }

  sendStream(stream, callback, andProcessWriteLoop = true) {
    let src = {
      stream: stream,
      callback: callback,
    };
    this.readSources.push(src);
    if (this.options.dumpToFiles && src.stream instanceof ReadBufferStream)
      fs.appendFileSync(this._dumpW, src.stream.getBuf());
    if (andProcessWriteLoop)
      this.processWriteLoop();
  }

  sendStreams(streams, callback, andProcessWriteLoop = true) {
    for (let i = 0 ; i < streams.length ; i++) {
      let stream = streams[i];
      let _callback = (i == (streams.length - 1) ? callback : null);
      this.sendStream(stream, _callback, false);
    }
    if (andProcessWriteLoop)
      this.processWriteLoop();
  }

  sendPacketAndStreams(msg, data, streams, callback) {
    this.sendPacket(msg, data, null, false);
    this.sendStreams(streams, callback, null, false);
    this.processWriteLoop();
  }

  receiveStream(stream, callback, andProcessReadLoop = true) {
    let _callback = callback;
    if (this.options.debug && stream instanceof WriteBufferStream) {
      _callback = () => {
        if(callback)
          callback();
        if(stream.getBuf().indexOf(this.packetBegin) != -1) {
          console.error("Found packet start in data stream: ", stream, 
            stream.getBuf().slice(0, 50), stream.getBuf().slice(-50));
          throw new Error("Found packet in data stream");
        }
      };
    }
    let trg = {
      stream: stream,
      callback: _callback,
    };
    this.writeTargets.push(trg);
    if (andProcessReadLoop)
      this.processReadLoop();
  }

  receiveStreams(streams, callback, andProcessReadLoop = true) {
    for (let i = 0 ; i < streams.length ; i++) {
      let stream = streams[i];
      let _callback = (i == (streams.length - 1) ? callback : null);
      this.receiveStream(stream, _callback, andProcessReadLoop);
    }
    if (andProcessReadLoop)
      this.processReadLoop();
  }

  processWriteLoop() {
    if (!this._processingWriteLoop)
      this._processWriteLoop();
  }

  _processWriteLoop() {
    if (!this.socket) return;

    if (this.readSources.length) {
      if (!this._processingWriteLoop) {
        this._logStart('write loop');
        this._processingWriteLoop = true;
      }
      let el = this.readSources.shift();
      let callback = el.callback;
      this.currentReadSource = el.stream;
      this._log('write from ' + this.currentReadSource);
      attachStreamToSocket(this.currentReadSource, this.socket, () => {
        this.currentReadSource = null;
        if (callback)
          callback();
        if (this.readSources.length)
          process.nextTick(this._processWriteLoop.bind(this));
        else
          this._closeWriteLoop();
      }, this.options.usePipe);
    } else 
      this._closeWriteLoop();
  }

  _closeWriteLoop() {
    if (this._processingWriteLoop) {
      this._logEnd('write loop');
      this._processingWriteLoop = false;
    }
  }

  processReadLoop() {
    if (!this._processingReadLoop)
      this._processReadLoop();
  }

  _processReadLoop() {
    if (!this.socket) return;

    if (this.writeTargets.length) {
      if (!this._processingReadLoop) {
        this._logStart('read loop');
        this._processingReadLoop = true;
      }
      let el = this.writeTargets.shift();
      let callback = el.callback;
      this.currentWriteTarget = el.stream;
      this._log('read to ' + this.currentWriteTarget);
      attachSocketToStream(this.socket, this.currentWriteTarget, this.buffer, (restBuffer) => {
        this.currentWriteTarget = null;
        this.buffer = restBuffer;
        if (callback)
          callback();
        if (this.writeTargets.length)
          process.nextTick(this._processReadLoop.bind(this));
        else
          this._closeReadLoop();
        }, this.options.usePipe);
    } else
      this._closeReadLoop();
  }

  _closeReadLoop() {
    if (!this.socket) return;
    
    if (this._processingReadLoop) {
      this._logEnd('read loop');
      this._processingReadLoop = false;
      
      if (this.socket.isPaused()) {
        this.socket.resume();
      }

      if (this.buffer) {
        let restBuffer = this.buffer;
        this.buffer = null;
        this.onData(restBuffer, true);
      }
    }
  }

}


module.exports = TcpSocket;
