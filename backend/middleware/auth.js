'use strict';

const jwt = require('jsonwebtoken');

function createAuthMiddleware(secret, redisClient = null) {
  return async function authRequired(request, response, next) {
    const header = request.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      response.status(401).json({ error: 'Autenticazione richiesta.' });
      return;
    }
    try {
      request.auth = jwt.verify(token, secret, { algorithms: ['HS256'] });
    } catch (_error) {
      response.status(401).json({ error: 'Sessione non valida o scaduta.' });
      return;
    }
    if (redisClient && !redisClient.isReady) {
      response.status(503).json({ error: 'Verifica sessione temporaneamente non disponibile.' });
      return;
    }
    if (redisClient && request.auth.jti) {
      try {
        if (await redisClient.get(`revoked:${request.auth.jti}`)) {
          response.status(401).json({ error: 'Sessione non valida o scaduta.' });
          return;
        }
      } catch (error) {
        console.error('Session revocation lookup failed:', error.message);
        response.status(503).json({ error: 'Verifica sessione temporaneamente non disponibile.' });
        return;
      }
    }
    next();
  };
}

module.exports = createAuthMiddleware;
