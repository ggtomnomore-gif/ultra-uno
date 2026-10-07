(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UnoWSClient = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  class WSClient {
    constructor({ url, token, WebSocketConstructor = globalThis.WebSocket }) {
      if (typeof WebSocketConstructor !== 'function') throw new TypeError('WebSocket non disponibile.');
      if (!token) throw new TypeError('Token di sessione mancante.');
      this.url = url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
      this.token = token;
      this.WebSocketConstructor = WebSocketConstructor;
      this.socket = null;
      this.listeners = new Map();
      this.authenticated = false;
    }

    on(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
      return () => this.listeners.get(type)?.delete(listener);
    }

    emit(type, payload) {
      this.listeners.get(type)?.forEach((listener) => listener(payload));
    }

    connect() {
      if (this.socket && this.socket.readyState < 2) return Promise.reject(new Error('Connessione WebSocket già avviata.'));
      return new Promise((resolve, reject) => {
        const socket = new this.WebSocketConstructor(this.url);
        this.socket = socket;
        const onOpen = () => socket.send(JSON.stringify({ type: 'auth', payload: { token: this.token } }));
        const onMessage = (event) => {
          let message;
          try {
            message = JSON.parse(event.data);
          } catch (error) {
            this.emit('client.error', new Error(`Risposta WebSocket non valida: ${error.message}`));
            return;
          }
          if (message.type === 'auth.ok') {
            this.authenticated = true;
            resolve(message.payload);
          } else if (message.type === 'error' && !this.authenticated) {
            reject(new Error(message.payload?.message || 'Autenticazione WebSocket fallita.'));
          }
          this.emit(message.type, message.payload);
        };
        const onError = () => {
          const error = new Error('Connessione WebSocket non riuscita.');
          reject(error);
          this.emit('client.error', error);
        };
        const onClose = () => {
          this.authenticated = false;
          this.emit('client.close');
        };
        socket.addEventListener('open', onOpen, { once: true });
        socket.addEventListener('message', onMessage);
        socket.addEventListener('error', onError, { once: true });
        socket.addEventListener('close', onClose);
      });
    }

    send(type, payload = {}) {
      if (!this.authenticated || !this.socket || this.socket.readyState !== 1) {
        throw new Error('Connetti prima la sessione WebSocket.');
      }
      this.socket.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }

    createRoom() {
      this.send('room.create');
    }

    joinRoom(roomId) {
      if (typeof roomId !== 'string' || !/^[A-F0-9]{8}$/i.test(roomId)) throw new TypeError('Codice stanza non valido.');
      this.send('room.join', { roomId: roomId.toUpperCase() });
    }

    startGame(mode) {
      this.send('game.start', { mode });
    }

    sendGameAction(action) {
      this.send('game.action', { action });
    }

    leaveRoom() {
      this.send('room.leave');
    }

    close() {
      this.authenticated = false;
      this.socket?.close(1000, 'Client disconnesso');
      this.socket = null;
      this.listeners.clear();
    }
  }

  return { WSClient };
}));
