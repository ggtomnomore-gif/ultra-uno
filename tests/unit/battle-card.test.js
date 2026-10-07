'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../backend/server');
const { recordMatchResult } = require('../../backend/services/match-results');
const { currentLevel } = require('../../backend/routes/battle-card');

const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
const TOKEN = jwt.sign({ sub: '7' }, SECRET, { algorithm: 'HS256' });

function createPool(poolQuery = jest.fn(), clientQuery = jest.fn()) {
  const client = { query: clientQuery, release: jest.fn() };
  return { query: poolQuery, connect: jest.fn(async () => client), client };
}

describe('Battle Card progress and rewards', () => {
  test('calculates capped levels including a purchased level boost', () => {
    const season = { max_level: 100, xp_per_level: 1000 };
    expect(currentLevel({ experience: 0, bonus_levels: 0 }, season)).toBe(1);
    expect(currentLevel({ experience: 1999, bonus_levels: 20 }, season)).toBe(22);
    expect(currentLevel({ experience: 500000, bonus_levels: 20 }, season)).toBe(100);
  });

  test('returns seeded season progression, credits, rewards and claim state', async () => {
    const pool = createPool(jest.fn()
      .mockResolvedValueOnce({ rows: [{
        season_id: 'ultra-season-1',
        name: 'Stagione UNO ULTRA',
        max_level: 100,
        xp_per_level: 1000,
        standard_price: 1000,
        boosted_price: 1500
      }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ experience: 1200, bonus_levels: 0, premium_unlocked: false }] })
      .mockResolvedValueOnce({ rows: [
        { level: 1, track: 'free', credits: 5, claimed: false },
        { level: 1, track: 'premium', credits: 5, claimed: false }
      ] }));
    const app = createApp({ pool, jwtSecret: SECRET });

    const response = await request(app).get('/api/battle-card')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.body).toMatchObject({
      season: { id: 'ultra-season-1' },
      level: 2,
      experience: 1200,
      premiumUnlocked: false,
      credits: 1000
    });
    expect(response.body.rewards).toHaveLength(2);
  });

  test('unlocks boosted premium progress and debits the configured price once', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ season_id: 'ultra-season-1', standard_price: 1000, boosted_price: 1500 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ premium_unlocked: false }] })
      .mockResolvedValueOnce({ rows: [{ credits: 2000 }] })
      .mockResolvedValueOnce({ rows: [{ credits: 500 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const app = createApp({ pool: createPool(jest.fn(), clientQuery), jwtSecret: SECRET });

    await request(app).post('/api/battle-card/unlock')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ tier: 'boosted' })
      .expect(200, { tier: 'boosted', premiumUnlocked: true, bonusLevels: 20, credits: 500 });
    expect(clientQuery.mock.calls[5][1]).toEqual(['7', 1500]);
    expect(clientQuery.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  test('claims only unlocked rewards and credits each claim transactionally', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ season_id: 'ultra-season-1', max_level: 100, xp_per_level: 1000 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ experience: 1000, bonus_levels: 0, premium_unlocked: false }] })
      .mockResolvedValueOnce({ rows: [{ level: 1, track: 'free', credits: 5 }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1005 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const app = createApp({ pool: createPool(jest.fn(), clientQuery), jwtSecret: SECRET });

    await request(app).post('/api/battle-card/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ level: 1, track: 'free' })
      .expect(200, {
        rewards: [{ level: 1, track: 'free', credits: 5 }],
        credits: 1005,
        level: 2
      });
    expect(clientQuery.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(clientQuery.mock.calls.at(-3)[1]).toEqual(['7', 'ultra-season-1', 1, 'free']);
  });

  test('claim-all returns every newly available free and premium reward in order', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ season_id: 'ultra-season-1', max_level: 100, xp_per_level: 1000 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ experience: 2000, bonus_levels: 0, premium_unlocked: true }] })
      .mockResolvedValueOnce({ rows: [
        { level: 1, track: 'free', credits: 5 },
        { level: 1, track: 'premium', credits: 5 },
        { level: 2, track: 'free', credits: 5 },
        { level: 2, track: 'premium', credits: 5 }
      ] })
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ credits: 1020 }] })
      .mockResolvedValue({});
    const app = createApp({ pool: createPool(jest.fn(), clientQuery), jwtSecret: SECRET });

    const response = await request(app).post('/api/battle-card/claim-all')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({})
      .expect(200);

    expect(response.body.rewards).toHaveLength(4);
    expect(response.body.credits).toBe(1020);
    expect(response.body.level).toBe(3);
    expect(clientQuery.mock.calls.at(-1)[0]).toBe('COMMIT');
  });

  test('rejects invalid or locked premium reward claims', async () => {
    const invalidApp = createApp({ pool: createPool(), jwtSecret: SECRET });
    await request(invalidApp).post('/api/battle-card/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ level: 0, track: 'free' })
      .expect(400);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ season_id: 'ultra-season-1', max_level: 100, xp_per_level: 1000 }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ experience: 1000, bonus_levels: 0, premium_unlocked: false }] })
      .mockResolvedValueOnce({});
    const lockedApp = createApp({ pool: createPool(jest.fn(), clientQuery), jwtSecret: SECRET });
    await request(lockedApp).post('/api/battle-card/claim')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ level: 1, track: 'premium' })
      .expect(403, { error: 'Sblocca il pass premium per riscattare questa ricompensa.' });
    expect(clientQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  test('awards server-side experience to match participants and a win bonus', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [
        { user_id: '1', mmr: 200 },
        { user_id: '2', mmr: 200 }
      ] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ season_id: 'ultra-season-1' }] })
      .mockResolvedValue({});
    const pool = createPool(null, query);

    await recordMatchResult(pool, { userIds: ['2', '1'], winnerUserId: '2' });

    expect(query).toHaveBeenCalledTimes(12);
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[2][1]).toEqual(['1', 'uno', 180, 'Bronze I', 0]);
    expect(query.mock.calls[3][1]).toEqual(['2', 'uno', 220, 'Bronze I', 1]);
    expect(query.mock.calls[6][1]).toEqual(['1', 'ultra-season-1', 100]);
    expect(query.mock.calls[8][1]).toEqual(['2', 'ultra-season-1', 200]);
    expect(query.mock.calls[9][1]).toEqual(['1', false]);
    expect(query.mock.calls[10][1]).toEqual(['2', true]);
    expect(query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(pool.client.release).toHaveBeenCalledTimes(1);
  });
});
