/**
 * WebSocketTransport — connects to bridge.py, sends/receives JSON messages.
 *
 * Events emitted:
 *   'connected', 'disconnected', 'reading', 'info', 'configured',
 *   'started', 'stopped', 'log', 'error'
 */
export class WebSocketTransport extends EventTarget {
  #ws = null;
  #url = '';
  #shouldReconnect = false;
  #reconnectTimer = null;
  static DEFAULT_URL = 'ws://localhost:8765';

  async connect(url) {
    this.#url = url || WebSocketTransport.DEFAULT_URL;
    this.#shouldReconnect = true;
    return this.#open();
  }

  #open() {
    return new Promise((resolve, reject) => {
      this.#emit('log', { message: 'Connecting to ' + this.#url + '...' });
      this.#ws = new WebSocket(this.#url);

      this.#ws.onopen = () => {
        this.#emit('connected');
        this.#emit('log', { message: 'WebSocket connected to ' + this.#url });
        resolve();
      };

      this.#ws.onerror = () => {
        const msg = 'Connection failed \u2014 run `uv run bridge.py` in a terminal first';
        this.#emit('error', { message: msg });
        this.#shouldReconnect = false;
        reject(new Error(msg));
      };

      this.#ws.onclose = () => {
        this.#emit('disconnected');
        this.#emit('log', { message: 'WebSocket closed' });
        if (this.#shouldReconnect) {
          this.#emit('log', { message: 'Reconnecting in 3s...' });
          this.#reconnectTimer = setTimeout(() => this.#open().catch(() => {}), 3000);
        }
      };

      this.#ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (_) {
          this.#emit('log', { message: 'Non-JSON message: ' + event.data });
          return;
        }
        this.#handleMessage(msg);
      };
    });
  }

  async disconnect() {
    this.#shouldReconnect = false;
    clearTimeout(this.#reconnectTimer);
    if (this.#ws) {
      this.#ws.close();
      this.#ws = null;
    }
  }

  /**
   * Send a JSON command object to the bridge.
   * @param {object} obj — e.g. {cmd: "read"} or {cmd: "configure", ...}
   */
  async send(obj) {
    if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) {
      this.#emit('error', { message: 'WebSocket not connected' });
      return;
    }
    this.#ws.send(JSON.stringify(obj));
  }

  #handleMessage(msg) {
    switch (msg.type) {
      case 'reading':
        this.#emit('reading', { channels: msg.channels });
        break;
      case 'info':
        this.#emit('info', { device: msg.device, product: msg.product, channels: msg.channels });
        break;
      case 'configured':
        this.#emit('configured', { channels: msg.channels, rate: msg.rate, range: msg.range });
        break;
      case 'started':
        this.#emit('started');
        break;
      case 'stopped':
        this.#emit('stopped');
        break;
      case 'error':
        this.#emit('error', { message: msg.message });
        break;
      default:
        this.#emit('log', { message: 'Unknown message type: ' + msg.type });
    }
  }

  #emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
