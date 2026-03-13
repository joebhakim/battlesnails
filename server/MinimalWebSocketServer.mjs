import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(opcode, payloadBuffer = Buffer.alloc(0)) {
  const payloadLength = payloadBuffer.length;

  if (payloadLength < 126) {
    return Buffer.concat([
      Buffer.from([0x80 | opcode, payloadLength]),
      payloadBuffer
    ]);
  }

  if (payloadLength < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(payloadLength, 2);
    return Buffer.concat([header, payloadBuffer]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(payloadLength), 2);
  return Buffer.concat([header, payloadBuffer]);
}

export class MinimalWebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;

    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.parseFrames();
    });

    this.socket.on('close', () => {
      this.closed = true;
      this.emit('close');
    });

    this.socket.on('error', (error) => {
      this.emit('error', error);
    });
  }

  sendJson(payload) {
    this.sendText(JSON.stringify(payload));
  }

  sendText(text) {
    if (this.closed) {
      return;
    }

    this.socket.write(encodeFrame(0x1, Buffer.from(text)));
  }

  sendPong(payload) {
    if (this.closed) {
      return;
    }

    this.socket.write(encodeFrame(0xA, payload));
  }

  close(code = 1000, reason = '') {
    if (this.closed) {
      return;
    }

    const reasonBuffer = Buffer.from(reason);
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    this.socket.write(encodeFrame(0x8, payload));
    this.socket.end();
    this.closed = true;
  }

  parseFrames() {
    while (this.buffer.length >= 2) {
      const firstByte = this.buffer[0];
      const secondByte = this.buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < offset + 2) {
          return;
        }
        payloadLength = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (this.buffer.length < offset + 8) {
          return;
        }
        payloadLength = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + payloadLength) {
        return;
      }

      const mask = masked ? this.buffer.subarray(offset, offset + 4) : null;
      offset += maskLength;

      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      this.buffer = this.buffer.subarray(offset + payloadLength);

      if (masked && mask) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        this.close();
        return;
      }

      if (opcode === 0x9) {
        this.sendPong(payload);
        continue;
      }

      if (opcode !== 0x1) {
        continue;
      }

      try {
        const message = JSON.parse(payload.toString('utf8'));
        this.emit('message', message);
      } catch (error) {
        this.emit('error', error);
      }
    }
  }
}

export function createMinimalWebSocketServer(requestHandler = null) {
  const server = http.createServer((request, response) => {
    if (requestHandler) {
      requestHandler(request, response);
      return;
    }

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });

  const eventBus = new EventEmitter();
  server.on('upgrade', (request, socket) => {
    const key = request.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = createHash('sha1')
      .update(`${key}${WEBSOCKET_GUID}`)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ].join('\r\n'));

    const connection = new MinimalWebSocketConnection(socket);
    eventBus.emit('connection', connection, request);
  });

  return {
    server,
    onConnection(listener) {
      eventBus.on('connection', listener);
    }
  };
}
