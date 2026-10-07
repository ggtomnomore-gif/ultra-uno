'use strict';

const express = require('express');
const { createServer } = require('node:http');
const path = require('node:path');

const { authRoutes } = require('./routes/auth');
const { storeRoutes } = require('./routes/store');
const { battleCardRoutes } = require('./routes/battle-card');
const { challengesRoutes } = require('./routes/challenges');
const createAuthMiddleware = require('./middleware/auth');
const { pool } = require('./config/db');
const { loadConfig } = require('./config/env');
const { createWebSocketServer } = require('./ws/handler');
const { recordMatchResult } = require('./services/match-results');

function createApp(options = {}) {
  const app = express();
  const frontendPath = path.join(__dirname, '..', 'frontend');
  const database = options.pool || pool;
  const redisClient = options.redisClient || null;
  const secret = options.jwtSecret || process.env.JWT_SECRET;

  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/ready', async (_request, response) => {
    try {
      await database.query('SELECT 1');
    } catch (error) {
      console.error('Database readiness check failed:', error.message);
      response.status(503).json({ status: 'not_ready', dependency: 'database' });
      return;
    }
    try {
      if (redisClient) {
        if (!redisClient.isReady) throw new Error('Redis client is not ready.');
        await redisClient.ping();
      }
      response.json({ status: 'ready' });
    } catch (error) {
      console.error('Redis readiness check failed:', error.message);
      response.status(503).json({ status: 'not_ready', dependency: 'redis' });
    }
  });

  app.use('/vendor/peerjs', express.static(path.join(__dirname, '..', 'node_modules', 'peerjs', 'dist'), {
    dotfiles: 'deny',
    fallthrough: false,
    index: false,
    maxAge: '1d'
  }));
  app.use('/api/auth', authRoutes({
    pool: database,
    redisClient,
    jwtSecret: secret,
    authRequired: createAuthMiddleware(secret, redisClient)
  }));
  app.use('/api/store', storeRoutes({
    pool: database,
    authRequired: createAuthMiddleware(secret, redisClient)
  }));
  app.use('/api/battle-card', battleCardRoutes({
    pool: database,
    authRequired: createAuthMiddleware(secret, redisClient)
  }));
  app.use('/api/challenges', challengesRoutes({
    pool: database,
    authRequired: createAuthMiddleware(secret, redisClient)
  }));
  app.use(express.static(frontendPath, {
    index: 'index.html',
    extensions: ['html']
  }));

  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Il corpo della richiesta non è JSON valido.' });
      return;
    }
    console.error('Request failed:', error.message);
    response.status(500).json({ error: 'Errore interno del server.' });
  });
  return app;
}

function createHttpServer(options = {}) {
  const app = createApp(options);
  const server = createServer(app);
  const database = options.pool || pool;
  const websocketServer = createWebSocketServer(server, {
    jwtSecret: options.jwtSecret || process.env.JWT_SECRET,
    redisClient: options.redisClient,
    pool: database,
    rooms: options.rooms,
    onGameFinished: options.onGameFinished || ((result) => recordMatchResult(database, result))
  });
  return { app, server, websocketServer };
}

if (require.main === module) {
  const config = loadConfig();
  const { createRedisClient } = require('./config/redis');
  const redisClient = createRedisClient(config.redisUrl);
  const { server, websocketServer } = createHttpServer({ jwtSecret: config.jwtSecret, redisClient });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    websocketServer.clients.forEach((client) => client.close(1001, 'Server in chiusura'));
    await new Promise((resolve) => websocketServer.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    if (redisClient?.isOpen) await redisClient.quit();
    await pool.end();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  (async () => {
    if (redisClient) await redisClient.connect();
    server.listen(config.port, () => {
      console.log(`UNO ULTRA in ascolto su http://localhost:${config.port}`);
    });
  })().catch(async (error) => {
    console.error('Startup failed:', error.message);
    if (redisClient?.isOpen) await redisClient.quit();
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = { createApp, createHttpServer };
