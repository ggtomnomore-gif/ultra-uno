'use strict';

function createRateLimit({ limit, windowMs, now = Date.now }) {
  const clients = new Map();
  return function rateLimit(request, response, next) {
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const timestamp = now();
    const previous = clients.get(key);
    const current = !previous || timestamp - previous.startedAt >= windowMs
      ? { startedAt: timestamp, count: 0 }
      : previous;
    current.count += 1;
    clients.set(key, current);
    if (current.count > limit) {
      const retryAfterSeconds = Math.ceil((current.startedAt + windowMs - timestamp) / 1000);
      response.set('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      response.status(429).json({ error: 'Troppe richieste. Riprova più tardi.' });
      return;
    }
    if (clients.size > 10000) {
      for (const [clientKey, entry] of clients) {
        if (timestamp - entry.startedAt >= windowMs) clients.delete(clientKey);
      }
    }
    next();
  };
}

module.exports = createRateLimit;
