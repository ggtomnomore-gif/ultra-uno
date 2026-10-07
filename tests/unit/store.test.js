'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../backend/server');

const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
const TOKEN = jwt.sign({ sub: '7' }, SECRET, { algorithm: 'HS256' });

function createPool(clientQuery = jest.fn()) {
  const client = { query: clientQuery, release: jest.fn() };
  return {
    client,
    connect: jest.fn(async () => client),
    query: jest.fn()
  };
}

describe('authenticated cosmetic store', () => {
  test('returns wallet balance, catalog ownership and active theme', async () => {
    const pool = createPool();
    pool.query
      .mockResolvedValueOnce({ rows: [{ credits: 650 }] })
      .mockResolvedValueOnce({ rows: [
        { item_id: 'theme-lava', name: 'Lava Rossa', description: 'Tema rosso', category: 'theme', theme_key: 'lava-red', price: 350 },
        { item_id: 'theme-matrix', name: 'Matrix', description: 'Tema verde', category: 'theme', theme_key: 'matrix-green', price: 350 }
      ] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-lava', equipped: true }] })
      .mockResolvedValueOnce({ rows: [{ amount: -350, reason: 'purchase', item_id: 'theme-lava' }] });
    const app = createApp({ pool, jwtSecret: SECRET });

    const result = await request(app).get('/api/store')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(result.body.credits).toBe(650);
    expect(result.body.activeTheme).toBe('lava-red');
    expect(result.body.transactions).toEqual([{ amount: -350, reason: 'purchase', item_id: 'theme-lava' }]);
    expect(result.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'theme-lava', owned: true, equipped: true }),
      expect.objectContaining({ id: 'theme-matrix', owned: false, equipped: false })
    ]));
  });

  test('purchases the database catalog price transactionally and rejects duplicate ownership', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-lava', price: 275 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 725 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const pool = createPool(clientQuery);
    const app = createApp({ pool, jwtSecret: SECRET });

    await request(app).post('/api/store/purchase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'theme-lava' })
      .expect(201, { itemId: 'theme-lava', credits: 725 });
    expect(clientQuery.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(clientQuery.mock.calls.at(-2)[1]).toEqual(['7', -275, 'purchase', 'theme-lava']);
    expect(clientQuery.mock.calls[2][0]).toContain('enabled = TRUE FOR SHARE');
    expect(clientQuery.mock.calls[2][1]).toEqual(['theme-lava']);
    expect(pool.client.release).toHaveBeenCalled();

    const duplicateQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 650 }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-lava', price: 350 }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rows: [] });
    const duplicateApp = createApp({ pool: createPool(duplicateQuery), jwtSecret: SECRET });
    await request(duplicateApp).post('/api/store/purchase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'theme-lava' })
      .expect(409, { error: 'Possiedi già questo articolo.' });
    expect(duplicateQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  test('rejects invalid items, insufficient credits, and unauthorized requests', async () => {
    const app = createApp({ pool: createPool(), jwtSecret: SECRET });
    await request(app).get('/api/store').expect(401);
    await request(app).post('/api/store/purchase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: { injected: true } })
      .expect(400, { error: 'Articolo non valido.' });

    const missingItemQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ credits: 1000 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    const missingItemApp = createApp({ pool: createPool(missingItemQuery), jwtSecret: SECRET });
    await request(missingItemApp).post('/api/store/purchase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'not-a-theme' })
      .expect(400, { error: 'Articolo non valido.' });
    expect(missingItemQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');

    const insufficientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 100 }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-lava', price: 350 }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const insufficientApp = createApp({ pool: createPool(insufficientQuery), jwtSecret: SECRET });
    await request(insufficientApp).post('/api/store/purchase')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'theme-lava' })
      .expect(409, { error: 'Crediti insufficienti.' });
    expect(insufficientQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });

  test('only equips owned catalog themes', async () => {
    const ownershipQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 650 }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-custom', theme_key: 'royal-purple' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const app = createApp({ pool: createPool(ownershipQuery), jwtSecret: SECRET });
    await request(app).post('/api/store/equip')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'theme-custom' })
      .expect(200, { itemId: 'theme-custom', theme: 'royal-purple' });
    expect(ownershipQuery.mock.calls.at(-1)[0]).toBe('COMMIT');

    const notOwnedQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ credits: 650 }] })
      .mockResolvedValueOnce({ rows: [{ item_id: 'theme-lava', theme_key: 'lava-red' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const notOwnedApp = createApp({ pool: createPool(notOwnedQuery), jwtSecret: SECRET });
    await request(notOwnedApp).post('/api/store/equip')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ itemId: 'theme-lava' })
      .expect(403, { error: 'Acquista il tema prima di equipaggiarlo.' });
    expect(notOwnedQuery.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });
});
