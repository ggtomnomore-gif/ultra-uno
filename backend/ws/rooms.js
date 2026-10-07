'use strict';

const { randomBytes } = require('node:crypto');
const UnoEngine = require('../../frontend/js/game-engine');

const MAX_PLAYERS = 4;

function createRoomManager({
  idGenerator = () => randomBytes(4).toString('hex').toUpperCase(),
  gameEngine = UnoEngine,
  onGameFinished = () => {}
} = {}) {
  const rooms = new Map();
  const clients = new Set();

  function send(client, type, payload = {}) {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }

  function broadcast(room, type, payload = {}, excludedClient = null) {
    room.players.forEach((client) => {
      if (client !== excludedClient) send(client, type, payload);
    });
  }

  function describeRoom(room) {
    return {
      id: room.id,
      hostId: room.host.userId,
      players: Array.from(room.players, (client) => ({ userId: client.userId, username: client.username })),
      version: room.version
    };
  }

  function createRoom(client) {
    if (client.roomId) leaveRoom(client);
    let id;
    do {
      id = idGenerator();
    } while (rooms.has(id));
    const room = {
      id,
      host: client,
      players: new Set([client]),
      version: 0,
      state: null,
      started: false,
      resultRecorded: false
    };
    rooms.set(id, room);
    client.roomId = id;
    send(client, 'room.created', describeRoom(room));
    return room;
  }

  function joinRoom(client, roomId) {
    if (client.roomId) leaveRoom(client);
    const room = rooms.get(String(roomId || '').toUpperCase());
    if (!room) {
      send(client, 'error', { code: 'ROOM_NOT_FOUND', message: 'Stanza non trovata.' });
      return null;
    }
    if (room.started) {
      send(client, 'error', { code: 'ROOM_IN_PROGRESS', message: 'La partita è già iniziata.' });
      return null;
    }
    if (Array.from(room.players).some((player) => player.userId === client.userId)) {
      send(client, 'error', { code: 'ALREADY_IN_ROOM', message: 'Sei già in questa stanza.' });
      return null;
    }
    if (room.players.size >= MAX_PLAYERS) {
      send(client, 'error', { code: 'ROOM_FULL', message: 'La stanza è piena.' });
      return null;
    }
    room.players.add(client);
    client.roomId = room.id;
    broadcast(room, 'room.playerJoined', { userId: client.userId, username: client.username }, client);
    send(client, 'room.joined', describeRoom(room));
    if (room.state !== null) {
      send(client, 'game.state', {
        version: room.version,
        state: room.state.public,
        privateHand: Object.hasOwn(room.state.privateHands, client.userId) ? room.state.privateHands[client.userId] : null
      });
    }
    return room;
  }

  function publishState(client) {
    const room = rooms.get(client.roomId);
    send(client, 'error', {
      code: room ? 'SERVER_AUTHORITY' : 'ROOM_NOT_FOUND',
      message: 'Lo stato della partita è gestito dal server.'
    });
    return false;
  }

  function serializeGame(room) {
    const privateHands = {};
    const publicState = {
      ...room.game,
      players: room.game.players.map((player, index) => {
        privateHands[room.userIds[index]] = player.hand;
        return { ...player, hand: [], handCount: player.hand.length, isHuman: true };
      }),
      onlineUserIds: [...room.userIds],
      drawPile: Array(room.game.drawPile.length).fill(null)
    };
    return { public: publicState, privateHands };
  }

  function publishGame(room) {
    room.version += 1;
    room.state = serializeGame(room);
    room.players.forEach((player) => {
      send(player, 'game.state', {
        version: room.version,
        state: room.state.public,
        privateHand: Object.hasOwn(room.state.privateHands, player.userId)
          ? room.state.privateHands[player.userId]
          : null
      });
    });
  }

  function startGame(client, mode) {
    const room = rooms.get(client.roomId);
    if (!room || room.host !== client) {
      send(client, 'error', { code: 'HOST_ONLY', message: 'Solo l’host può avviare la partita.' });
      return false;
    }
    if (room.started) {
      send(client, 'error', { code: 'GAME_ALREADY_STARTED', message: 'La partita è già iniziata.' });
      return false;
    }
    if (mode !== 'uno' || room.players.size < 2) {
      send(client, 'error', {
        code: 'INVALID_GAME_START',
        message: mode !== 'uno'
          ? 'La partita online supporta al momento solo UNO Classic.'
          : 'Servono almeno due giocatori per iniziare.'
      });
      return false;
    }
    const players = Array.from(room.players);
    room.userIds = players.map((player) => player.userId);
    room.game = gameEngine.createGame(
      players.map((player) => player.username),
      { mmrs: players.map(() => 200) }
    );
    room.game.players.forEach((player) => { player.isHuman = true; });
    room.started = true;
    publishGame(room);
    return true;
  }

  function submitAction(client, action) {
    const room = rooms.get(client.roomId);
    if (!room || !room.started || !room.game) {
      send(client, 'error', { code: 'GAME_NOT_STARTED', message: 'La partita non è iniziata.' });
      return false;
    }
    if (!action || typeof action !== 'object' || Array.isArray(action) ||
      !['draw', 'pass', 'play'].includes(action.type) ||
      (action.type === 'play' && (typeof action.cardId !== 'string' || action.cardId.length > 80 ||
        (action.color !== undefined && !['red', 'blue', 'green', 'yellow'].includes(action.color))))) {
      send(client, 'error', { code: 'INVALID_ACTION', message: 'Azione di gioco non valida.' });
      return false;
    }
    const playerIndex = room.userIds.indexOf(client.userId);
    if (playerIndex < 0 || room.game.currentPlayer !== playerIndex || room.game.status !== 'playing') {
      send(client, 'error', { code: 'NOT_YOUR_TURN', message: 'Non è il tuo turno.' });
      return false;
    }
    try {
      if (action.type === 'draw') {
        const acceptedPenalty = room.game.pendingDraw > 0;
        if (!acceptedPenalty && room.game.justDrawnCardId) {
          throw new Error('Hai già pescato una carta in questo turno.');
        }
        gameEngine.drawCards(room.game, playerIndex);
        if (!acceptedPenalty && gameEngine.getPlayableCards(room.game, playerIndex).length === 0) {
          gameEngine.passTurn(room.game, playerIndex);
        }
      } else if (action.type === 'pass') {
        if (!room.game.justDrawnCardId || room.game.pendingDraw > 0) {
          throw new Error('Puoi passare solo dopo aver pescato una carta giocabile.');
        }
        gameEngine.passTurn(room.game, playerIndex);
      } else {
        gameEngine.playCard(room.game, playerIndex, action.cardId, action.color);
      }
    } catch (error) {
      send(client, 'error', { code: 'INVALID_GAME_ACTION', message: error.message });
      return false;
    }
    publishGame(room);
    if (room.game.status === 'finished' && !room.resultRecorded) {
      room.resultRecorded = true;
      const winnerUserId = room.userIds[room.game.winner];
      Promise.resolve().then(() => onGameFinished({
        roomId: room.id,
        userIds: [...room.userIds],
        winnerUserId
      })).catch((error) => {
        console.error('Match result persistence failed:', error.message);
      });
    }
    return true;
  }

  function leaveRoom(client) {
    const room = rooms.get(client.roomId);
    client.roomId = null;
    if (!room || !room.players.delete(client)) return;
    if (room.host === client) {
      broadcast(room, 'room.closed', { reason: 'HOST_DISCONNECTED' }, client);
      room.players.forEach((player) => { player.roomId = null; });
      room.players.clear();
      rooms.delete(room.id);
      return;
    }
    broadcast(room, 'room.playerLeft', { userId: client.userId, username: client.username });
    if (room.players.size === 0) rooms.delete(room.id);
  }

  function addClient(client) {
    clients.add(client);
  }

  function removeClient(client) {
    leaveRoom(client);
    clients.delete(client);
  }

  function closeAll() {
    clients.forEach((client) => {
      send(client, 'server.closing');
      client.close(1001, 'Server in chiusura');
    });
    rooms.clear();
    clients.clear();
  }

  return {
    addClient,
    removeClient,
    createRoom,
    joinRoom,
    leaveRoom,
    publishState,
    startGame,
    submitAction,
    closeAll,
    get roomCount() { return rooms.size; }
  };
}

module.exports = { createRoomManager, MAX_PLAYERS };
