'use strict';

const { createClient } = require('redis');

function createRedisClient(url = process.env.REDIS_URL) {
  if (!url) throw new Error('REDIS_URL è obbligatorio per verificare e revocare le sessioni.');
  const client = createClient({ url });
  client.on('error', (error) => {
    console.error('Redis client error:', error.message);
  });
  return client;
}

module.exports = { createRedisClient };
