'use strict';

const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = ARGV[1]
end
return { count, ttl }
`;

function createRateLimit({ limit, windowMs, now = Date.now, redisClient, keyPrefix = 'rate-limit:' }) {
  const clients = new Map();
  return async function rateLimit(request, response, next) {
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    if (redisClient) {
      if (!redisClient.isReady) {
        response.status(503).json({ error: 'Limitazione delle richieste temporaneamente non disponibile.' });
        return;
      }
      try {
        const [count, remainingMilliseconds] = await redisClient.eval(RATE_LIMIT_SCRIPT, {
          keys: [`${keyPrefix}${key}`],
          arguments: [String(windowMs)]
        });
        if (count > limit) {
          response.set('Retry-After', String(Math.max(Math.ceil(remainingMilliseconds / 1000), 1)));
          response.status(429).json({ error: 'Troppe richieste. Riprova più tardi.' });
          return;
        }
      } catch (error) {
        console.error('Rate-limit Redis operation failed:', error.message);
        response.status(503).json({ error: 'Limitazione delle richieste temporaneamente non disponibile.' });
        return;
      }
      next();
      return;
    }

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
