(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.UnoP2P = factory();
  }
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  class P2PManager {
    constructor(PeerConstructor, handlers = {}) {
      if (typeof PeerConstructor !== 'function') throw new TypeError('PeerJS non disponibile.');
      this.Peer = PeerConstructor;
      this.handlers = handlers;
      this.peer = null;
      this.hostConnection = null;
      this.connections = new Map();
      this.isHost = false;
    }

    openPeer() {
      return new Promise((resolve, reject) => {
        const peer = new this.Peer();
        this.peer = peer;
        const onOpen = (id) => {
          peer.off('error', onError);
          resolve(id);
        };
        const onError = (error) => {
          peer.off('open', onOpen);
          reject(new Error(`Connessione P2P fallita: ${error.message}`));
        };
        peer.once('open', onOpen);
        peer.once('error', onError);
      });
    }

    async createRoom() {
      this.isHost = true;
      const peerId = await this.openPeer();
      this.peer.on('connection', (connection) => {
        this.connections.set(connection.peer, connection);
        this.attachConnection(connection, true);
      });
      return peerId;
    }

    async joinRoom(hostPeerId) {
      if (typeof hostPeerId !== 'string' || !hostPeerId.trim()) throw new TypeError('Inserisci un Peer ID valido.');
      this.isHost = false;
      await this.openPeer();
      const connection = this.peer.connect(hostPeerId.trim(), { reliable: true });
      this.hostConnection = connection;
      this.attachConnection(connection, false);
      return new Promise((resolve, reject) => {
        connection.once('open', () => resolve(this.peer.id));
        connection.once('error', (error) => reject(new Error(`Impossibile unirsi alla partita: ${error.message}`)));
      });
    }

    attachConnection(connection, isHostSide) {
      connection.on('data', (message) => {
        if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;
        if (message.type === 'game.action' && isHostSide && this.isHost) {
          this.handlers.onAction?.(message.payload, connection.peer);
        } else if (message.type === 'game.state' && !isHostSide) {
          this.handlers.onState?.(message.payload);
        }
      });
      connection.on('close', () => {
        this.connections.delete(connection.peer);
        if (connection === this.hostConnection) {
          this.hostConnection = null;
          this.handlers.onHostDisconnected?.();
        }
        this.handlers.onConnectionChange?.(this.connections.size);
      });
      connection.on('open', () => {
        this.handlers.onConnectionChange?.(this.isHost ? this.connections.size : 1);
        if (this.isHost) this.sendState(connection);
      });
      connection.on('error', (error) => {
        this.handlers.onError?.(new Error(`Errore connessione P2P: ${error.message}`));
      });
    }

    sendState(connection) {
      if (!this.isHost || !connection.open || typeof this.handlers.getState !== 'function') return false;
      connection.send({ type: 'game.state', payload: this.handlers.getState() });
      return true;
    }

    broadcastState() {
      if (!this.isHost) throw new Error('Solo l’host può sincronizzare lo stato della partita.');
      let sent = 0;
      this.connections.forEach((connection) => {
        if (this.sendState(connection)) sent += 1;
      });
      return sent;
    }

    sendAction(action) {
      if (this.isHost || !this.hostConnection?.open) throw new Error('Nessun host P2P connesso.');
      this.hostConnection.send({ type: 'game.action', payload: action });
    }

    close() {
      this.connections.forEach((connection) => connection.close());
      this.connections.clear();
      this.hostConnection?.close();
      this.peer?.destroy();
      this.hostConnection = null;
      this.peer = null;
    }
  }

  return { P2PManager };
}));
