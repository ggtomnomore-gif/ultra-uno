'use strict';

const { EventEmitter } = require('node:events');
const { WSClient } = require('../../frontend/js/ws-client');

class FakeWebSocket extends EventEmitter {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  addEventListener(event, listener, options = {}) {
    if (options.once) this.once(event, listener);
    else this.on(event, listener);
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
    const message = this.sent.at(-1);
    if (message.type === 'auth') {
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({
        type: 'auth.ok', payload: { userId: '1', username: 'Ada' }
      }) }));
    }
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('WebSocket browser client', () => {
  beforeEach(() => { FakeWebSocket.instances = []; });

  test('authenticates before sending messages and validates room codes', async () => {
    const client = new WSClient({ url: 'ws://localhost/ws', token: 'jwt', WebSocketConstructor: FakeWebSocket });
    expect(() => client.createRoom()).toThrow('Connetti prima');
    const connected = client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.readyState = 1;
    socket.emit('open');
    expect(await connected).toEqual({ userId: '1', username: 'Ada' });
    expect(socket.sent[0]).toEqual({ type: 'auth', payload: { token: 'jwt' } });
    client.createRoom();
    client.joinRoom('a1b2c3d4');
    expect(socket.sent.at(-1).payload.roomId).toBe('A1B2C3D4');
    expect(() => client.joinRoom('not-a-code')).toThrow('Codice stanza');
    client.close();
    expect(client.authenticated).toBe(false);
  });

  test('requests a server-started game, sends player actions and leaves its room', async () => {
    const client = new WSClient({ url: 'ws://localhost/ws', token: 'jwt', WebSocketConstructor: FakeWebSocket });
    const connected = client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.readyState = 1;
    socket.emit('open');
    await connected;
    client.startGame('uno');
    client.sendGameAction({ type: 'draw' });
    client.leaveRoom();
    expect(socket.sent.slice(1).map((message) => [message.type, message.payload])).toEqual([
      ['game.start', { mode: 'uno' }],
      ['game.action', { action: { type: 'draw' } }],
      ['room.leave', {}]
    ]);
    client.close();
  });

  test('rejects a missing token and a failed server authentication', async () => {
    expect(() => new WSClient({ url: 'ws://localhost/ws', token: '', WebSocketConstructor: FakeWebSocket })).toThrow('Token');
    const client = new WSClient({ url: 'ws://localhost/ws', token: 'bad', WebSocketConstructor: FakeWebSocket });
    const connected = client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open');
    socket.emit('message', { data: JSON.stringify({
      type: 'error', payload: { message: 'Token non valido.' }
    }) });
    await expect(connected).rejects.toThrow('Token non valido');
    client.close();
  });
});
