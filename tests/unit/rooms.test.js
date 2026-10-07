'use strict';

const { createRoomManager } = require('../../backend/ws/rooms');

function fakeClient(userId) {
  return {
    userId,
    username: `user-${userId}`,
    roomId: null,
    readyState: 1,
    messages: [],
    send(raw) { this.messages.push(JSON.parse(raw)); },
    close() { this.readyState = 3; }
  };
}

function latestGameState(client) {
  return client.messages.filter((message) => message.type === 'game.state').at(-1);
}

describe('server-authoritative UNO rooms', () => {
  test('starts an UNO game on the server and sends each player only their private hand', () => {
    const rooms = createRoomManager({ idGenerator: () => 'ABC123' });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    rooms.createRoom(host);
    rooms.joinRoom(guest, 'ABC123');

    expect(rooms.startGame(host, 'uno')).toBe(true);

    const hostState = latestGameState(host);
    const guestState = latestGameState(guest);
    expect(hostState.payload.version).toBe(1);
    expect(hostState.payload.state.onlineUserIds).toEqual(['1', '2']);
    expect(hostState.payload.state.players.map((player) => player.hand)).toEqual([[], []]);
    expect(hostState.payload.state.drawPile.every((card) => card === null)).toBe(true);
    expect(hostState.payload.privateHand).toHaveLength(hostState.payload.state.players[0].handCount);
    expect(guestState.payload.privateHand).toHaveLength(guestState.payload.state.players[1].handCount);
    const visibleHostCardIds = [
      ...hostState.payload.privateHand,
      ...hostState.payload.state.discardPile
    ].map((card) => card.id);
    expect(visibleHostCardIds).not.toContain(guestState.payload.privateHand[0].id);
    expect(hostState.payload.state).not.toHaveProperty('privateHands');
    expect(rooms.startGame(host, 'uno')).toBe(false);
    expect(host.messages.at(-1).payload.code).toBe('GAME_ALREADY_STARTED');
  });

  test('rejects invalid starts, unsupported state publication, and late joins', () => {
    const rooms = createRoomManager({ idGenerator: () => 'ROOM0001' });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    const lateJoiner = fakeClient('3');
    rooms.createRoom(host);

    expect(rooms.startGame(host, 'uno')).toBe(false);
    expect(host.messages.at(-1).payload.code).toBe('INVALID_GAME_START');
    expect(rooms.startGame(host, 'poker')).toBe(false);
    expect(host.messages.at(-1).payload.code).toBe('INVALID_GAME_START');
    expect(rooms.joinRoom(guest, 'missing')).toBeNull();
    rooms.joinRoom(guest, 'ROOM0001');
    expect(rooms.publishState(host, { turn: 1 })).toBe(false);
    expect(host.messages.at(-1).payload.code).toBe('SERVER_AUTHORITY');

    expect(rooms.startGame(host, 'uno')).toBe(true);
    expect(rooms.joinRoom(lateJoiner, 'ROOM0001')).toBeNull();
    expect(lateJoiner.messages.at(-1).payload.code).toBe('ROOM_IN_PROGRESS');
  });

  test('validates active turns and legal draw, pass, and play actions on the server', () => {
    const rooms = createRoomManager({ idGenerator: () => 'ROOM0003' });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    rooms.createRoom(host);
    rooms.joinRoom(guest, 'ROOM0003');
    rooms.startGame(host, 'uno');

    const initial = latestGameState(host).payload;
    const currentClient = initial.state.onlineUserIds[initial.state.currentPlayer] === host.userId ? host : guest;
    const waitingClient = currentClient === host ? guest : host;
    const expectedDrawCount = initial.state.pendingDraw || 1;
    expect(rooms.submitAction(waitingClient, { type: 'draw' })).toBe(false);
    expect(waitingClient.messages.at(-1).payload.code).toBe('NOT_YOUR_TURN');

    expect(rooms.submitAction(currentClient, { type: 'play', cardId: 'not-in-hand' })).toBe(false);
    expect(currentClient.messages.at(-1).payload.code).toBe('INVALID_GAME_ACTION');
    expect(latestGameState(host).payload.version).toBe(initial.version);

    expect(rooms.submitAction(currentClient, { type: 'pass' })).toBe(false);
    expect(currentClient.messages.at(-1).payload.code).toBe('INVALID_GAME_ACTION');
    expect(rooms.submitAction(currentClient, { type: 'draw' })).toBe(true);
    const afterDraw = latestGameState(currentClient).payload;
    expect(afterDraw.version).toBe(initial.version + 1);
    expect(afterDraw.state.players[initial.state.currentPlayer].handCount)
      .toBe(initial.state.players[initial.state.currentPlayer].handCount + expectedDrawCount);

    if (afterDraw.state.justDrawnCardId) {
      expect(afterDraw.state.onlineUserIds[afterDraw.state.currentPlayer]).toBe(currentClient.userId);
      expect(rooms.submitAction(currentClient, { type: 'draw' })).toBe(false);
      expect(currentClient.messages.at(-1).payload.code).toBe('INVALID_GAME_ACTION');
      expect(rooms.submitAction(currentClient, { type: 'pass' })).toBe(true);
      expect(latestGameState(currentClient).payload.state.currentPlayer).not.toBe(afterDraw.state.currentPlayer);
    } else {
      expect(afterDraw.state.onlineUserIds[afterDraw.state.currentPlayer]).not.toBe(currentClient.userId);
    }
  });

  test('rejects invalid actions before applying them', () => {
    const rooms = createRoomManager({ idGenerator: () => 'ROOM0004' });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    rooms.createRoom(host);
    rooms.joinRoom(guest, 'ROOM0004');
    rooms.startGame(host, 'uno');

    expect(rooms.submitAction(host, { type: 'explode' })).toBe(false);
    expect(host.messages.at(-1).payload.code).toBe('INVALID_ACTION');
    expect(rooms.submitAction(guest, { type: 'play', cardId: 'card-1', color: 'violet' })).toBe(false);
    expect(guest.messages.at(-1).payload.code).toBe('INVALID_ACTION');
  });

  test('records one match result only after the server confirms the winner', async () => {
    const onGameFinished = jest.fn().mockResolvedValue(undefined);
    const gameEngine = {
      createGame: () => ({
        players: [
          { name: 'user-1', hand: [{ id: 'winning-card' }] },
          { name: 'user-2', hand: [{ id: 'other-card' }] }
        ],
        drawPile: [],
        discardPile: [],
        currentPlayer: 0,
        status: 'playing'
      }),
      playCard: (game, playerIndex) => {
        game.status = 'finished';
        game.winner = playerIndex;
      }
    };
    const rooms = createRoomManager({
      idGenerator: () => 'RESULT01',
      gameEngine,
      onGameFinished
    });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    rooms.createRoom(host);
    rooms.joinRoom(guest, 'RESULT01');
    rooms.startGame(host, 'uno');

    expect(rooms.submitAction(host, { type: 'play', cardId: 'winning-card' })).toBe(true);
    await Promise.resolve();

    expect(onGameFinished).toHaveBeenCalledTimes(1);
    expect(onGameFinished).toHaveBeenCalledWith({
      roomId: 'RESULT01',
      userIds: ['1', '2'],
      winnerUserId: '1'
    });
  });

  test('closes the room when its host disconnects and removes departing guests', () => {
    const rooms = createRoomManager({ idGenerator: () => 'ROOM0002' });
    const host = fakeClient('1');
    const guest = fakeClient('2');
    const remainingGuest = fakeClient('3');
    rooms.createRoom(host);
    rooms.joinRoom(guest, 'ROOM0002');
    rooms.joinRoom(remainingGuest, 'ROOM0002');
    rooms.removeClient(guest);
    expect(host.messages.at(-1).type).toBe('room.playerLeft');
    rooms.removeClient(host);
    expect(remainingGuest.messages.at(-1).type).toBe('room.closed');
    expect(rooms.roomCount).toBe(0);
  });
});
