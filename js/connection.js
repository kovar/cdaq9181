/**
 * ConnectionManager — WebSocket-only connection manager.
 *
 * Events: 'connected', 'disconnected', 'reading', 'info', 'configured',
 *         'started', 'stopped', 'log', 'error'
 */
import { WebSocketTransport } from './websocket.js';

export class ConnectionManager extends EventTarget {
  #transport = null;
  #connected = false;

  get isConnected() {
    return this.#connected;
  }

  async connectWebSocket(url) {
    if (this.#connected) await this.disconnect();
    this.#transport = new WebSocketTransport();
    this.#wire();
    await this.#transport.connect(url);
  }

  async disconnect() {
    if (this.#transport) {
      await this.#transport.disconnect();
      this.#transport = null;
    }
  }

  /**
   * Send a JSON command object.
   * @param {object} obj — e.g. {cmd: "read"}
   */
  async send(obj) {
    if (this.#transport) {
      await this.#transport.send(obj);
    }
  }

  #wire() {
    const events = ['connected', 'disconnected', 'reading', 'info', 'configured', 'started', 'stopped', 'log', 'error'];
    for (const name of events) {
      this.#transport.addEventListener(name, (e) => {
        if (name === 'connected') this.#connected = true;
        if (name === 'disconnected') this.#connected = false;
        this.dispatchEvent(new CustomEvent(name, { detail: e.detail }));
      });
    }
  }
}
