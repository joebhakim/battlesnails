function normalizeHostname(hostname: any) {
  const normalized = typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';

  if (!normalized || normalized === '0.0.0.0' || normalized === '::' || normalized === '[::]') {
    return 'localhost';
  }

  return hostname;
}

export function resolveDefaultUrl(locationLike: any = globalThis?.window?.location ?? globalThis.location ?? {}) {
  const protocol = locationLike.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = normalizeHostname(locationLike.hostname);
  return `${protocol}://${hostname}:2567`;
}

export class LocalMultiplayerClient {
  declare onClose: any;
  declare isConnected: any;
  declare onError: any;
  declare onMessage: any;
  declare socket: any;
  declare url: any;
  constructor(url = import.meta.env.VITE_MULTIPLAYER_WS_URL || resolveDefaultUrl()) {
    this.url = url;
    this.socket = null;
    this.isConnected = false;
    this.onMessage = () => {};
    this.onClose = () => {};
    this.onError = () => {};
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('open', () => {
      this.isConnected = true;
      this.send({ type: 'join' });
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.onMessage(payload);
      } catch (error) {
        this.onError(error);
      }
    });

    this.socket.addEventListener('close', () => {
      this.isConnected = false;
      this.onClose();
    });

    this.socket.addEventListener('error', (error) => {
      this.onError(error);
    });
  }

  send(payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(payload));
  }

  close() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send({ type: 'leave' });
    }

    this.socket?.close();
    this.socket = null;
    this.isConnected = false;
  }
}
