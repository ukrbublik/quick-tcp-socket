/**
 * Stream (as readable or writeable) buffers, typead arrays, strings
 *
 * @author ukrbublik
 */

const Readable = require('stream').Readable;
const Writable = require('stream').Writable;
const assert = require('assert');


function _toBuffer (buf) {
  if(buf instanceof Buffer) {
    buf = buf;
  } else if (typeof buf == 'string') {
    buf = Buffer.from(buf);
  } else if(buf.buffer && buf.buffer instanceof ArrayBuffer) {
    //it's typed array
    buf = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  } else {
    throw new Error("Unknown type of buf: " + 
      (typeof buf == 'object' ? buf.constructor.name : typeof buf));
  }
  return buf;  
}


class ReadBufferStream extends Readable {

  /**
   * To stream from 1 buffer use constructor(buf), callback - use event 'end'
   * To stream from N buffers user constructor(null) + N times addBuffer(buf, callback)
   */
  constructor (buf = null, info = null, options = {}) {
    let opts = {};
    opts.encoding = null;
    opts.highWaterMark = ReadBufferStream.highWaterMark;
    opts.objectMode = false;
    options.isMultiBuffers = (buf === null);
    Object.assign(opts, options);
    super(opts);
    this.options = opts;

    this.id = ++ReadBufferStream.lastId;
    if (info)
      this.info = info;
    this.bufOffset = 0;
    this.totalOffset = 0;
    this.buf = null;
    this.totalLength = 0;

    if (this.options.isMultiBuffers) {
      this.nextBuffers = [];
      this.nextCallbacks = [];
    } else {
      this.buf = _toBuffer(buf);
      this.totalLength += this.buf.length;
    }
  }

  addBuffer (buf, onBufProcessed = null) {
    if (this.isDone())
      return false;
    if (!this.options.isMultiBuffers)
      throw new Error("It's not multi-buffer stream");
    buf = _toBuffer(buf);
    this.nextBuffers.push(buf);
    this.nextCallbacks.push(onBufProcessed);
    this.totalLength += buf.length;
    return true;
  }

  isStarted() {
    return this.buf !== null && this.bufOffset != 0;
  }
  isDone() {
    return this.availableBytesLength() <= 0;
  }
  availableBytesLength () {
    return (this.totalLength - this.totalOffset);
  }
  toString() {
    return "ReadBufferStream #" + this.id + " ("+this.totalLength+" bytes)" 
      + (this.info ? ' '+JSON.stringify(this.info) : '');
  }
  getBuf() {
    return this.buf;
  }

  _read (size) {
    if (1)
      this.__readInLoop (size);
    else
      this.__readByTicks (size);
  }

  __readByTicks (size) {
    let bytesToRead = 0, 
      readMore = true,
      bufferToPush = null,
      onBufProcessed;
    size = size || this.options.highWaterMark;

    if (this.options.isMultiBuffers && this.buf === null && this.nextBuffers.length)
      this.buf = this.nextBuffers.shift();

    if (this.isDone()) {
      this.push(null);
    } else {
      bytesToRead = Math.min(this.buf.length - this.bufOffset, size);
      bufferToPush = this.buf.slice(this.bufOffset, this.bufOffset + bytesToRead);
      readMore = this.push(bufferToPush);
      this.totalOffset += bytesToRead;
      this.bufOffset += bytesToRead;
      if (this.bufOffset == this.buf.length) {
        if (this.nextCallbacks) {
          onBufProcessed = this.nextCallbacks.shift();
          if (onBufProcessed)
            onBufProcessed(this.buf);
        }
        if (this.options.isMultiBuffers && this.nextBuffers.length) {
          this.buf = this.nextBuffers.shift();
          this.bufOffset = 0;
        }
      }
      if (this.isDone()) {
        this.push(null);
      } else if (readMore) {
        process.nextTick(() => { this.__readByTicks(size) });
      }
    }
  }

  __readInLoop (size) {
    let bytesToRead = 0, 
      readMore = true,
      bufferToPush = null,
      onBufProcessed;
    size = size || this.options.highWaterMark;

    if (this.options.isMultiBuffers && this.buf === null && this.nextBuffers.length)
      this.buf = this.nextBuffers.shift();

    while (!this.isDone()) {
      bytesToRead = Math.min(this.buf.length - this.bufOffset, size);
      bufferToPush = this.buf.slice(this.bufOffset, this.bufOffset + bytesToRead);
      readMore = this.push(bufferToPush);
      this.totalOffset += bytesToRead;
      this.bufOffset += bytesToRead;
      if (this.bufOffset == this.buf.length) {
        if (this.nextCallbacks) {
          onBufProcessed = this.nextCallbacks.shift();
          if (onBufProcessed)
            onBufProcessed(this.buf);
        }
        if (this.options.isMultiBuffers && this.nextBuffers.length) {
          this.buf = this.nextBuffers.shift();
          this.bufOffset = 0;
        }
      }
      if (!readMore)
        break;
    }
    if (this.isDone()) {
      this.push(null);
    }
  }
}

ReadBufferStream.lastId = -1;

//--------------

class WriteBufferStream extends Writable {

  /**
   * To stream to 1 buffer use constructor(buf), callback - use event 'finish'
   * To stream to N buffers user constructor(null) + N times addBuffer(buf, callback)
   */
  constructor (buf = null, info = null, options = {}) {
    let opts = {};
    opts.decodeStrings = true;
    opts.highWaterMark = WriteBufferStream.highWaterMark;
    opts.objectMode = false;
    options.isMultiBuffers = (buf === null);
    Object.assign(opts, options);
    super(opts);
    this.options = opts;

    this.id = ++WriteBufferStream.lastId;
    if (info)
      this.info = info;
    this.bufOffset = 0;
    this.totalOffset = 0;
    this.restBuffer = null;
    this.buf = null;
    this.totalLength = 0;

    if (this.options.isMultiBuffers) {
      this.nextBuffers = [];
      this.nextCallbacks = [];
    } else {
      this.buf = _toBuffer(buf);
      this.totalLength += this.buf.length;
    }
  }

  addBuffer (buf, onBufProcessed = null) {
    if (this.isDone())
      return false;
    if (!this.options.isMultiBuffers)
      throw new Error("It's not multi-buffer stream");
    buf = _toBuffer(buf);
    this.nextBuffers.push(buf);
    this.nextCallbacks.push(onBufProcessed);
    this.totalLength += buf.length;
    return true;
  }

  isStarted() {
    return this.buf !== null && this.bufOffset != 0;
  }
  isDone() {
    return this.availableBytesLength() <= 0;
  }
  availableBytesLength() {
    return (this.totalLength - this.totalOffset);
  }
  toString() {
    return "WriteBufferStream #" + this.id + " ("+this.totalLength+" bytes)"
      + (this.info ? ' '+JSON.stringify(this.info) : '');
  }
  getBuf() {
    return this.buf;
  }
  hasRestBuffer() {
    return (this.restBuffer !== null);
  }
  getRestBuffer() {
    return this.restBuffer;
  }
  clearRestBuffer() {
    this.restBuffer = null;
  }

  _write (chunk, encoding, callback) {
    let bytedCopied = 0,
      bytesToCopy = 0,
      bufferToCopy = null,
      bytesLeft = 0,
      onBufProcessed;

    if (this.options.isMultiBuffers && this.buf === null && this.nextBuffers.length)
      this.buf = this.nextBuffers.shift();

    do {
      bytesToCopy = Math.min(this.buf.length - this.bufOffset, chunk.length);
      bytesLeft = chunk.length - bytesToCopy;
      if (bytesToCopy > 0) {
        bufferToCopy = this.buf.slice(this.bufOffset, this.bufOffset + bytesToCopy);
        bytedCopied = chunk.copy(bufferToCopy, 0, 0, bytesToCopy);
         this.totalOffset += bytedCopied;
        this.bufOffset += bytedCopied;
      }
      if (this.bufOffset == this.buf.length) {
        if (this.nextCallbacks) {
          onBufProcessed = this.nextCallbacks.shift();
          if (onBufProcessed)
            onBufProcessed(this.buf);
        }
        if (this.options.isMultiBuffers && this.nextBuffers.length) {
          this.buf = this.nextBuffers.shift();
          this.bufOffset = 0;
        }
      }
    } while (bytesLeft && this.bufOffset < this.buf.length);

    if (bytesLeft) {
      assert(this.isDone());
      let restBuf = chunk.slice(bytesToCopy, bytesToCopy + bytesLeft);
      this.restBuffer = restBuf; //no copy
      //this.restBuffer = Buffer.from(restBuf); //copy
    }

    if (callback)
      callback(null);
    if (this.isDone()) {
      this.end();
    }
  };

}

WriteBufferStream.lastId = -1;

//--------------

function attachStreamToSocket(readStream, socketWriteStream, callback, usePipe = false) {
  if (!usePipe) {
    _attachStreamToSocket(readStream, socketWriteStream, callback);
  } else {
    readStream.pipe(socketWriteStream, { end: false });
    readStream.once('end', () => {
      readStream.unpipe();
      callback();
    });
  }
}

function _attachStreamToSocket(readStream, socketWriteStream, callback, callbackOnFlush = false) {
  let canWrite = true,
    canRead = false,
    chunksToWrite = 0,
    chunksFlushed = 0,
    readEnd = false;

  let callbackWhenDone = () => {
    if (readEnd && (callbackOnFlush ? chunksToWrite == chunksFlushed : true)) {
      callback();
    }
  };

  let readAndWrite = () => {
    if (!canWrite)
      return; //wait for drain
    let chunk;
    while (canRead && canWrite) {
      chunk = readStream.read();
      if(chunk === null) {
        canRead = false;
      } else {
        chunksToWrite++;
        canWrite = socketWriteStream.write(chunk, null, () => {
          chunksFlushed++;
          if (callbackOnFlush)
            callbackWhenDone();
        });
        if (!canWrite) {
          socketWriteStream.once('drain', () => {
            canWrite = true;
            if (canRead)
              readAndWrite();
          });
        }
      }
    }
    if (!callbackOnFlush)
      callbackWhenDone();
  };

  readStream.on('readable', () => {
    canRead = true;
    readAndWrite();
  });

  readStream.once('end', () => {
    readEnd = true;
    callbackWhenDone();
  });
}


function attachSocketToStream(socketReadStream, writeStream, firstChunk = null, callback, usePipe = false) {
  if (!usePipe) {
    _attachSocketToStream(socketReadStream, writeStream, firstChunk, callback);
  } else {
    socketReadStream.pipe(writeStream, { end: true });
    if (firstChunk) {
      socketReadStream.unshifting = true;
      socketReadStream.unshift(firstChunk);
      socketReadStream.unshifting = false;
    }
    writeStream.once('finish', () => {
      socketReadStream.unpipe();
      let restBuffer = null;
      if (writeStream instanceof WriteBufferStream) {
        if (writeStream.hasRestBuffer()) {
          restBuffer = writeStream.getRestBuffer();
          writeStream.clearRestBuffer();
        }
      }
      callback(restBuffer);
    });
  }
}

function _attachSocketToStream(socketReadStream, writeStream, firstChunk = null, callback) {
  let writeEnd = false,
    canWrite = true,
    canRead = false,
    restBuffer = null;

  let readAndWrite = (_firstChunk = null) => {
    if (!canWrite)
      return; //wait for drain
    if (writeEnd)
      return;
    let isLastChunk = false, 
      chunk = null,
      bytesToRead = null,
      availBytesToWrite = null;
    while (canRead && canWrite && !isLastChunk) {
      if (writeStream instanceof WriteBufferStream) {
        availBytesToWrite = writeStream.availableBytesLength();
        if (_firstChunk) {
          bytesToRead = Math.min(availBytesToWrite, _firstChunk.length);
        } else {
          bytesToRead = Math.min(availBytesToWrite, 
            (socketReadStream.bufferSize ? socketReadStream.bufferSize : 64*1024));
        }
        isLastChunk = (bytesToRead == availBytesToWrite);
      }
      if (_firstChunk) {
        if (availBytesToWrite && availBytesToWrite < _firstChunk.length) {
          //get part of first chunk and set rest
          chunk = _firstChunk.slice(0, bytesToRead);
          restBuffer = _firstChunk.slice(bytesToRead, _firstChunk.length);
        } else {
          //just get full first chunk
          chunk = _firstChunk;
          restBuffer = null;
        }
      } else {
        //read chunk
        chunk = socketReadStream.read(bytesToRead);
        if (!chunk)
          canRead = false;
      }
      if (chunk) {
        //write
        if (isLastChunk) {
          writeStream.end(chunk);
          writeEnd = true;
        } else {
          canWrite = writeStream.write(chunk);
          if (!canWrite) {
            writeStream.once('drain', () => {
              canWrite = true;
              if (canRead)
                readAndWrite();
            });
          }
        }
      }
      if (_firstChunk) {
        _firstChunk = null;
        break;
      }
    }
  };

  writeStream.once('finish', () => {
    writeEnd = true;
    callback(restBuffer);
  });

  socketReadStream.pause();

  if (firstChunk) {
    canRead = true;
    readAndWrite(firstChunk);
    //if we are already done, now writeEnd = true
  }

  if (!writeEnd) {
    socketReadStream.on('readable', () => {
      canRead = true;
      readAndWrite();
    });

    //manual start w/o waiting for 'readable'
    canRead = true;
    readAndWrite();
  }
}

//--------------

WriteBufferStream.highWaterMark = 128*1024;
ReadBufferStream.highWaterMark = 128*1024;

module.exports.ReadBufferStream = ReadBufferStream;
module.exports.WriteBufferStream = WriteBufferStream;
module.exports.attachStreamToSocket = attachStreamToSocket;
module.exports.attachSocketToStream = attachSocketToStream;
