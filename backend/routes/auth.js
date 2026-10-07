'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const users = require('../models/user');
const createRateLimit = require('../middleware/rateLimit');

const RESERVED_USERNAMES = new Set(['admin', 'bot', 'player', 'guest', 'uno', 'ultra']);
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,15}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

function validateRegistration(body) {
  const errors = [];
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username.toLowerCase())) {
    errors.push('Il nome utente deve avere 3–15 caratteri alfanumerici o underscore e non essere riservato.');
  }
  if (!PASSWORD_PATTERN.test(password)) errors.push('La password deve avere almeno 8 caratteri, una lettera e un numero.');
  if (Buffer.byteLength(password, 'utf8') > 72) errors.push('La password non può superare 72 byte.');
  return { errors, username, password };
}

function issueToken(userId, secret, username) {
  return jwt.sign({ sub: String(userId), username, jti: randomUUID() }, secret, { algorithm: 'HS256', expiresIn: '7d' });
}

function authRoutes({ pool, redisClient, jwtSecret, authRequired }) {
  const router = require('express').Router();
  const authRateLimit = createRateLimit({
    limit: 10,
    windowMs: 15 * 60 * 1000,
    redisClient,
    keyPrefix: 'uno:rate-limit:auth:'
  });

  router.post('/register', authRateLimit, async (request, response) => {
    const validation = validateRegistration(request.body || {});
    if (validation.errors.length) {
      response.status(400).json({ error: validation.errors[0], details: validation.errors });
      return;
    }
    try {
      const passwordHash = await bcrypt.hash(validation.password, 12);
      const user = await users.createUser(pool, {
        username: validation.username,
        passwordHash
      });
      response.status(201).json({
        user: { id: user.id, username: user.username, email: user.email },
        token: issueToken(user.id, jwtSecret, user.username)
      });
    } catch (error) {
      if (error.code === '23505') {
        response.status(409).json({ error: 'Nome utente già in uso.' });
        return;
      }
      console.error('Registration failed:', error.message);
      response.status(503).json({ error: 'Registrazione temporaneamente non disponibile.' });
    }
  });

  router.post('/login', authRateLimit, async (request, response) => {
    const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (!username || !password) {
      response.status(400).json({ error: 'Inserisci nome utente e password.' });
      return;
    }
    try {
      const user = await users.findByUsername(pool, username);
      let matches = false;
      if (user) matches = await bcrypt.compare(password, user.password_hash);
      else await bcrypt.hash(password, 12);
      if (!matches) {
        response.status(401).json({ error: 'Nome utente o password non corretti.' });
        return;
      }
      response.json({
        user: { id: user.id, username: user.username, email: user.email },
        token: issueToken(user.id, jwtSecret, user.username)
      });
    } catch (error) {
      console.error('Login failed:', error.message);
      response.status(503).json({ error: 'Accesso temporaneamente non disponibile.' });
    }
  });

  router.post('/logout', authRequired, async (request, response) => {
    if (!redisClient?.isReady) {
      response.status(503).json({ error: 'Sessione non revocata: Redis non disponibile.' });
      return;
    }
    try {
      const remainingSeconds = Math.max(1, request.auth.exp - Math.floor(Date.now() / 1000));
      await redisClient.set(`revoked:${request.auth.jti}`, '1', { EX: remainingSeconds });
      response.json({ status: 'ok' });
    } catch (error) {
      console.error('Logout failed:', error.message);
      response.status(503).json({ error: 'Impossibile revocare la sessione in questo momento.' });
    }
  });

  router.get('/me', authRequired, async (request, response) => {
    try {
      const user = await users.findPublicProfile(pool, request.auth.sub);
      if (!user) {
        response.status(404).json({ error: 'Profilo non trovato.' });
        return;
      }
      response.json({ user });
    } catch (error) {
      console.error('Profile lookup failed:', error.message);
      response.status(503).json({ error: 'Profilo temporaneamente non disponibile.' });
    }
  });

  return router;
}

module.exports = { authRoutes, validateRegistration, issueToken };
