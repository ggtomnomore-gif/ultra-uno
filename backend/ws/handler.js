'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { createRoomManager } = require('./rooms');

function createWebSocketServer(httpServer, { jwtSecret, redisClient, rooms, onGameFinished }) {
  const roomManager = rooms || createRoomManager({ onGameFinished });
  const websocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const heartbeat = setInterval(() => {
    websocketServer.clients.forEach((client) => {
      if (client.readyState !== 1) return;
      if (client.isAlive === false) {
        client.terminate();
        return;
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);
  heartbeat.unref();

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (client) => {
      websocketServer.emit('connection', client, request);
    });
  });

  websocketServer.on('connection', (client) => {
    const peer = {
      socket: client,
      authenticated: false,
      userId: null,
      username: null,
      roomId: null,
      messageWindowStarted: Date.now(),
      messageCount: 0
    };
    roomManager.addClient(client);
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    client.userId = null;
    client.username = null;
    client.roomId = null;

    client.on('message', async (rawMessage) => {
      const now = Date.now();
      if (now - peer.messageWindowStarted >= 60000) {
        peer.messageWindowStarted = now;
        peer.messageCount = 0;
      }
      peer.messageCount += 1;
      if (peer.messageCount > 120) {
        client.close(1008, 'Limite messaggi superato');
        return;
      }
      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch (_error) {
        client.send(JSON.stringify({ type: 'error', payload: { code: 'INVALID_JSON', message: 'Messaggio JSON non valido.' }, timestamp: Date.now() }));
        return;
      }
      if (!message || typeof message.type !== 'string' || !message.payload || typeof message.payload !== 'object') {
        client.send(JSON.stringify({ type: 'error', payload: { code: 'INVALID_MESSAGE', message: 'Formato messaggio non valido.' }, timestamp: Date.now() }));
        return;
      }
      if (!peer.authenticated) {
        if (message.type !== 'auth' || typeof message.payload.token !== 'string') {
          client.close(1008, 'Autenticazione richiesta');
          return;
        }
        try {
          const identity = jwt.verify(message.payload.token, jwtSecret, { algorithms: ['HS256'] });
          if (redisClient && !redisClient.isReady) {
            client.close(1013, 'Session store non disponibile');
            return;
          }
          if (redisClient && identity.jti) {
            try {
              if (await redisClient.get(`revoked:${identity.jti}`)) {
                client.close(1008, 'Token revocato');
                return;
              }
            } catch (error) {
              console.error('WebSocket session revocation lookup failed:', error.message);
              client.close(1013, 'Verifica sessione non disponibile');
              return;
            }
          }
          peer.authenticated = true;
          peer.userId = String(identity.sub);
          client.userId = peer.userId;
          client.username = typeof identity.username === 'string' ? identity.username : `player-${peer.userId}`;
          client.send(JSON.stringify({
            type: 'auth.ok',
            payload: { userId: client.userId, username: client.username },
            timestamp: Date.now()
          }));
        } catch (_error) {
          client.close(1008, 'Token non valido');
        }
        return;
      }

      switch (message.type) {
        case 'room.create':
          roomManager.createRoom(client);
          break;
        case 'room.join':
          roomManager.joinRoom(client, message.payload.roomId);
          break;
        case 'room.leave':
          roomManager.leaveRoom(client);
          break;
        case 'game.start':
          roomManager.startGame(client, message.payload.mode);
          break;
        case 'game.state':
          roomManager.publishState(client);
          break;
        case 'game.action':
          roomManager.submitAction(client, message.payload.action);
          break;
        default:
          client.send(JSON.stringify({
            type: 'error',
            payload: { code: 'UNKNOWN_EVENT', message: 'Evento non riconosciuto.' },
            timestamp: Date.now()
          }));
      }
    });

    client.on('close', () => roomManager.removeClient(client));
    client.on('error', (error) => {
      console.error('WebSocket client error:', error.message);
      roomManager.removeClient(client);
    });
  });

  websocketServer.on('close', () => {
    clearInterval(heartbeat);
    roomManager.closeAll();
  });
  return websocketServer;
}

module.exports = { createWebSocketServer };
