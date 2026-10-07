'use strict';

const { createServer: createHttp } = require('node:http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { issueToken } = require('../../backend/routes/auth');
const { createWebSocketServer } = require('../../backend/ws/handler');

const SECRET = 'websocket-test-secret-that-is-long-enough';

function readMessage(socket, expected = 'WebSocket message') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}`)), 2000);
    socket.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readMessages(socket, types) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${types.join(', ')}`));
    }, 2000);
    const onMessage = (raw) => {
      const message = JSON.parse(raw.toString());
      if (!types.includes(message.type)) return;
      messages.push(message);
      if (messages.length === types.length) {
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(messages);
      }
    };
    socket.on('message', onMessage);
  });
}

async function authenticatedClient(port, userId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const response = readMessage(socket);
  socket.send(JSON.stringify({ type: 'auth', payload: { token: issueToken(userId, SECRET) } }));
  expect((await response).type).toBe('auth.ok');
  return socket;
}

describe('authenticated room WebSocket', () => {
  let httpServer;
  let websocketServer;
  let port;
  let redisClient;
  let pool;

  beforeAll(async () => {
    httpServer = createHttp();
    redisClient = { isReady: true, get: jest.fn().mockResolvedValue(null) };
    pool = {
      query: jest.fn(async (_sql, [userId]) => ({
        rows: [{ mmr: userId === '21' ? 200 : 210 }]
      }))
    };
    websocketServer = createWebSocketServer(httpServer, { jwtSecret: SECRET, redisClient, pool });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;
  });

  afterAll(async () => {
    websocketServer.clients.forEach((client) => client.terminate());
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => httpServer.close(resolve));
  });

  test('authenticates clients, starts an authoritative game and synchronizes private hands', async () => {
    const host = await authenticatedClient(port, 11);
    const created = readMessage(host, 'room.created');
    host.send(JSON.stringify({ type: 'room.create', payload: {} }));
    const room = (await created).payload;

    const guest = await authenticatedClient(port, 12);
    const hostJoined = readMessage(host, 'room.playerJoined');
    const joined = readMessage(guest, 'room.joined');
    guest.send(JSON.stringify({ type: 'room.join', payload: { roomId: room.id } }));
    expect((await joined).type).toBe('room.joined');

    expect((await hostJoined).type).toBe('room.playerJoined');
    const rejectedPublication = readMessage(host, 'server-authority error');
    host.send(JSON.stringify({ type: 'game.state', payload: { state: { turn: 1 } } }));
    expect((await rejectedPublication).payload.code).toBe('SERVER_AUTHORITY');

    const hostInitialState = readMessage(host, 'host initial game state');
    const guestInitialState = readMessage(guest, 'guest initial game state');
    host.send(JSON.stringify({ type: 'game.start', payload: { mode: 'uno' } }));
    const hostState = (await hostInitialState).payload;
    const guestState = (await guestInitialState).payload;
    expect(hostState).toMatchObject({
      version: 1,
      state: {
        onlineUserIds: ['11', '12'],
        players: [
          { hand: [], handCount: expect.any(Number) },
          { hand: [], handCount: expect.any(Number) }
        ]
      }
    });
    expect(hostState.state.players.every((player) => player.handCount >= 7)).toBe(true);
    expect(hostState.privateHand).toHaveLength(hostState.state.players[0].handCount);
    expect(guestState.privateHand).toHaveLength(guestState.state.players[1].handCount);
    expect(hostState.state).not.toHaveProperty('privateHands');
    expect(hostState.state.drawPile.every((card) => card === null)).toBe(true);

    const activeSocket = hostState.state.onlineUserIds[hostState.state.currentPlayer] === '11' ? host : guest;
    const activeState = hostState.state.onlineUserIds[hostState.state.currentPlayer] === '11' ? hostState : guestState;
    const inactiveSocket = activeSocket === host ? guest : host;
    const turnError = readMessage(inactiveSocket, 'out-of-turn error');
    inactiveSocket.send(JSON.stringify({ type: 'game.action', payload: { action: { type: 'draw' } } }));
    expect((await turnError).payload.code).toBe('NOT_YOUR_TURN');

    const activeUpdate = readMessage(activeSocket, 'active player game update');
    const otherUpdate = readMessage(inactiveSocket, 'opponent game update');
    activeSocket.send(JSON.stringify({ type: 'game.action', payload: { action: { type: 'draw' } } }));
    const activeNextState = (await activeUpdate).payload;
    const otherNextState = (await otherUpdate).payload;
    expect(activeNextState.version).toBe(hostState.version + 1);
    expect(activeNextState.state.players[activeState.state.currentPlayer].handCount)
      .toBe(activeState.state.players[activeState.state.currentPlayer].handCount + 1);
    expect(otherNextState.state.currentPlayer).toBe(activeNextState.state.currentPlayer);
    const activePlayerIndex = activeNextState.state.onlineUserIds.indexOf(activeSocket === host ? '11' : '12');
    expect(activeNextState.privateHand).toHaveLength(activeNextState.state.players[activePlayerIndex].handCount);
    expect(otherNextState.privateHand).toHaveLength(
      otherNextState.state.players[otherNextState.state.onlineUserIds.indexOf(inactiveSocket === host ? '11' : '12')].handCount
    );
    host.close();
    guest.close();
  });

  test('rejects revoked session tokens on the WebSocket authentication path', async () => {
    redisClient.get.mockResolvedValueOnce('1');
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    const closed = new Promise((resolve) => socket.once('close', (code) => resolve(code)));
    socket.send(JSON.stringify({
      type: 'auth',
      payload: {
        token: jwt.sign({ sub: '13', username: 'user-13', jti: 'revoked-jti' }, SECRET, {
          algorithm: 'HS256',
          expiresIn: '1h'
        })
      }
    }));
    await expect(closed).resolves.toBe(1008);
    expect(redisClient.get).toHaveBeenCalledWith('revoked:revoked-jti');
  });

  test('matches authenticated players by their persisted MMR and starts a ranked game', async () => {
    const first = await authenticatedClient(port, 21);
    const queued = readMessage(first, 'ranked queue confirmation');
    first.send(JSON.stringify({ type: 'matchmaking.queue', payload: {} }));
    expect((await queued).payload.mmr).toBe(200);

    const firstMessages = readMessages(first, [
      'room.created',
      'room.playerJoined',
      'matchmaking.found',
      'game.state'
    ]);
    const second = await authenticatedClient(port, 22);
    const secondMessages = readMessages(second, ['room.joined', 'matchmaking.found', 'game.state']);
    second.send(JSON.stringify({ type: 'matchmaking.queue', payload: {} }));

    const [roomCreated, playerJoined, firstFound, firstState] = await firstMessages;
    const [roomJoined, secondFound, secondState] = await secondMessages;
    expect(roomCreated.payload.competitive).toBe(true);
    expect(playerJoined.payload.username).toBe('player-22');
    expect(roomJoined.type).toBe('room.joined');
    expect(firstFound.payload.opponent).toBe('player-22');
    expect(secondFound.payload.opponent).toBe('player-21');
    expect(firstState.payload.state.onlineUserIds).toEqual(['21', '22']);
    expect(secondState.payload.state.status).toBe('playing');
    expect(pool.query).toHaveBeenCalledTimes(2);
    first.close();
    second.close();
  });
});
