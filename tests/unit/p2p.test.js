'use strict';

const { EventEmitter } = require('node:events');
const { P2PManager } = require('../../frontend/js/p2p');

class FakeConnection extends EventEmitter {
  constructor(peer) {
    super();
    this.peer = peer;
    this.open = false;
    this.sent = [];
  }
  send(message) { this.sent.push(message); }
  close() { this.emit('close'); }
}

class FakePeer extends EventEmitter {
  static instances = [];
  constructor() {
    super();
    FakePeer.instances.push(this);
    queueMicrotask(() => this.emit('open', `peer-${FakePeer.instances.length}`));
  }
  connect(id) {
    this.connection = new FakeConnection(id);
    queueMicrotask(() => {
      this.connection.open = true;
      this.connection.emit('open');
    });
    return this.connection;
  }
  destroy() { this.destroyed = true; }
}

describe('PeerJS transport wrapper', () => {
  beforeEach(() => { FakePeer.instances = []; });

  test('host accepts connections and sends its authoritative initial state', async () => {
    const manager = new P2PManager(FakePeer, { getState: () => ({ turn: 0 }) });
    expect(await manager.createRoom()).toBe('peer-1');
    const guest = new FakeConnection('guest-peer');
    guest.open = true;
    manager.peer.emit('connection', guest);
    guest.emit('open');
    expect(guest.sent).toEqual([{ type: 'game.state', payload: { turn: 0 } }]);
    expect(manager.broadcastState()).toBe(1);
    manager.close();
  });

  test('guest sends actions and receives host state but cannot publish state', async () => {
    const received = jest.fn();
    const manager = new P2PManager(FakePeer, { onState: received });
    await manager.joinRoom('host-peer');
    manager.hostConnection.open = true;
    manager.sendAction({ cardId: 'c1' });
    expect(manager.hostConnection.sent[0]).toEqual({ type: 'game.action', payload: { cardId: 'c1' } });
    manager.hostConnection.emit('data', { type: 'game.state', payload: { turn: 1 } });
    expect(received).toHaveBeenCalledWith({ turn: 1 });
    expect(() => manager.broadcastState()).toThrow('Solo l’host');
    manager.close();
  });

  test('rejects missing peer IDs and reports unknown card messages safely', async () => {
    const manager = new P2PManager(FakePeer);
    await expect(manager.joinRoom(' ')).rejects.toThrow('Peer ID valido');
    await manager.createRoom();
    const connection = new FakeConnection('guest-peer');
    manager.peer.emit('connection', connection);
    connection.emit('data', 'invalid');
    expect(manager.broadcastState()).toBe(0);
    manager.close();
  });
});
