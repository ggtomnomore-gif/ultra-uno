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
