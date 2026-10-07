'use strict';

const express = require('express');
const request = require('supertest');
const createRateLimit = require('../../backend/middleware/rateLimit');

test('limits requests per client and reports when to retry', async () => {
  let timestamp = 1000;
  const app = express();
  app.get('/limited', createRateLimit({ limit: 2, windowMs: 60000, now: () => timestamp }), (_req, res) => res.sendStatus(204));

  await request(app).get('/limited').expect(204);
  await request(app).get('/limited').expect(204);
  await request(app).get('/limited').expect(429).expect('Retry-After', '60');
  timestamp += 60000;
  await request(app).get('/limited').expect(204);
});

test('uses an atomic Redis window shared by app instances', async () => {
  const redisClient = {
    isReady: true,
    eval: jest.fn()
      .mockResolvedValueOnce([1, 60000])
      .mockResolvedValueOnce([2, 30000])
      .mockResolvedValueOnce([3, 5000])
  };
  const app = express();
  app.get('/limited', createRateLimit({
    limit: 2,
    windowMs: 60000,
    redisClient,
    keyPrefix: 'uno:test:'
  }), (_req, res) => res.sendStatus(204));

  await request(app).get('/limited').expect(204);
  await request(app).get('/limited').expect(204);
  await request(app).get('/limited').expect(429).expect('Retry-After', '5');
  expect(redisClient.eval).toHaveBeenCalledTimes(3);
  expect(redisClient.eval.mock.calls[0][1]).toMatchObject({
    keys: ['uno:test:127.0.0.1'],
    arguments: ['60000']
  });
});

test('fails closed when the Redis rate-limit store is unavailable', async () => {
  const app = express();
  app.get('/limited', createRateLimit({
    limit: 2,
    windowMs: 60000,
    redisClient: { isReady: false }
  }), (_req, res) => res.sendStatus(204));

  await request(app).get('/limited')
    .expect(503, { error: 'Limitazione delle richieste temporaneamente non disponibile.' });
});
