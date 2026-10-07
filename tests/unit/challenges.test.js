'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../backend/server');
const { recordMatchResult } = require('../../backend/services/match-results');

const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
const TOKEN = jwt.sign({ sub: '7' }, SECRET, { algorithm: 'HS256' });

function createPool(poolQuery = jest.fn(), clientQuery = jest.fn()) {
  const client = { query: clientQuery, release: jest.fn() };
  return { query: poolQuery, connect: jest.fn(async () => client), client };
}

describe('daily challenge API', () => {
  test('returns progress and UTC challenge date for the authenticated user', async () => {
    const pool = createPool(jest.fn().mockResolvedValue({ rows: [{
      challenge_id: 'uno-first-match',
      title: 'Prima partita',
      description: 'Completa una partita UNO online.',
      target: 1,
      reward: 50,
      progress: 1,
      claimed: false,
      challenge_date: '2026-10-09'
    }] }));
    const app = createApp({ pool, jwtSecret: SECRET });

    const response = await request(app).get('/api/challenges')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.body.challenges).toEqual([expect.objectContaining({
      challenge_id: 'uno-first-match',
      progress: 1,
      target: 1,
      reward: 50,
      claimed: false
    })]);
    expect(pool.query.mock.calls[0][1]).toEqual(['7']);
  });

  test('claims a completed challenge and credits the wallet atomically', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ challenge_id: 'uno-first-match', target: 1, reward: 50 }] })
      .mockResolvedValueOnce({ rows: [{ progress: 1, claimed: false }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1050 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const pool = createPool(null, query);
    const app = createApp({ pool, jwtSecret: SECRET });

    await request(app).post('/api/challenges/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ challengeId: 'uno-first-match' })
      .expect(200, { challengeId: 'uno-first-match', reward: 50, credits: 1050 });

    expect(query.mock.calls[4][1]).toEqual(['7', 50]);
    expect(query.mock.calls[5][1]).toEqual(['7', 50]);
    expect(query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });

  test('rejects incomplete and already claimed challenges without crediting', async () => {
    const incompleteQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ challenge_id: 'uno-first-match', target: 1, reward: 50 }] })
      .mockResolvedValueOnce({ rows: [{ progress: 0, claimed: false }] })
      .mockResolvedValueOnce({});
    const incompleteApp = createApp({ pool: createPool(null, incompleteQuery), jwtSecret: SECRET });
    await request(incompleteApp).post('/api/challenges/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ challengeId: 'uno-first-match' })
      .expect(409, { error: 'Completa la sfida prima di riscattare la ricompensa.' });
    expect(incompleteQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');

    const claimedQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ challenge_id: 'uno-first-match', target: 1, reward: 50 }] })
      .mockResolvedValueOnce({ rows: [{ progress: 1, claimed: true }] })
      .mockResolvedValueOnce({});
    const claimedApp = createApp({ pool: createPool(null, claimedQuery), jwtSecret: SECRET });
    await request(claimedApp).post('/api/challenges/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ challengeId: 'uno-first-match' })
      .expect(409, { error: 'La ricompensa di questa sfida è già stata riscattata.' });
    expect(claimedQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  test('rejects malformed challenge ids before opening a transaction', async () => {
    const pool = createPool();
    const app = createApp({ pool, jwtSecret: SECRET });
    await request(app).post('/api/challenges/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ challengeId: 42 })
      .expect(400, { error: 'Sfida non valida.' });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('tracks match progress even when no Battle Card season is active', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [
        { user_id: '1', mmr: 200 },
        { user_id: '2', mmr: 200 }
      ] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await recordMatchResult(createPool(null, query), {
      userIds: ['1', '2'],
      winnerUserId: '1'
    });

    expect(query).toHaveBeenCalledTimes(8);
    expect(query.mock.calls[5][0]).toContain('INSERT INTO user_daily_challenges');
    expect(query.mock.calls[5][1]).toEqual(['1', true]);
    expect(query.mock.calls[6][1]).toEqual(['2', false]);
    expect(query.mock.calls.at(-1)[0]).toBe('COMMIT');
  });
});
