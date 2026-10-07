'use strict';

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../backend/server');
const { validateRegistration, issueToken } = require('../../backend/routes/auth');
const createAuthMiddleware = require('../../backend/middleware/auth');
const { createUser, MODES } = require('../../backend/models/user');
const { loadConfig } = require('../../backend/config/env');

const SECRET = 'test-only-secret-with-at-least-thirty-two-characters';

function createPool() {
  const client = { query: jest.fn(), release: jest.fn() };
  return {
    connect: jest.fn(async () => client),
    query: jest.fn(),
    client
  };
}

describe('authentication and account persistence', () => {
  test('validates usernames and password requirements without requiring an email', () => {
    expect(validateRegistration({ username: 'alice_01', password: 'secure123' }).errors).toEqual([]);
    expect(validateRegistration({ username: 'admin', password: 'secure123' }).errors).toHaveLength(1);
    expect(validateRegistration({ username: 'ab', password: 'short' }).errors).toHaveLength(2);
    expect(validateRegistration({ username: 'guest', password: 'secure123' }).errors[0]).toMatch(/riservato/);
  });

  test('validates runtime secrets and ports', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/almeno 32 caratteri/);
    expect(() => loadConfig({ JWT_SECRET: SECRET, REDIS_URL: 'redis://localhost', PORT: '65536' })).toThrow(/PORT/);
    expect(() => loadConfig({ JWT_SECRET: SECRET })).toThrow(/REDIS_URL/);
    expect(loadConfig({ JWT_SECRET: SECRET, REDIS_URL: 'redis://localhost', PORT: '3100' }))
      .toEqual({ jwtSecret: SECRET, redisUrl: 'redis://localhost', port: 3100 });
  });

  test('reports PostgreSQL and Redis readiness separately from HTTP liveness', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) };
    const redisClient = { isReady: true, ping: jest.fn().mockResolvedValue('PONG') };
    const app = createApp({ pool, redisClient, jwtSecret: SECRET });
    await request(app).get('/health').expect(200, { status: 'ok' });
    await request(app).get('/ready').expect(200, { status: 'ready' });
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
    expect(redisClient.ping).toHaveBeenCalled();

    const unavailableRedisApp = createApp({
      pool,
      redisClient: { ping: jest.fn().mockRejectedValue(new Error('connection refused')) },
      jwtSecret: SECRET
    });
    const redisErrorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(unavailableRedisApp).get('/ready')
        .expect(503, { status: 'not_ready', dependency: 'redis' });
    } finally {
      redisErrorLog.mockRestore();
    }

    const unavailablePool = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const unavailableApp = createApp({ pool: unavailablePool, jwtSecret: SECRET });
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(unavailableApp).get('/ready')
        .expect(503, { status: 'not_ready', dependency: 'database' });
    } finally {
      errorLog.mockRestore();
    }
  });

  test('does not issue login or registration success when PostgreSQL is unavailable', async () => {
    const pool = {
      connect: jest.fn().mockRejectedValue(new Error('connection refused')),
      query: jest.fn().mockRejectedValue(new Error('connection refused'))
    };
    const app = createApp({ pool, jwtSecret: SECRET });
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(app).post('/api/auth/login')
        .send({ username: 'alice', password: 'secure123' })
        .expect(503, { error: 'Accesso temporaneamente non disponibile.' });
      await request(app).post('/api/auth/register')
        .send({ username: 'alice', password: 'secure123' })
        .expect(503, { error: 'Registrazione temporaneamente non disponibile.' });
    } finally {
      errorLog.mockRestore();
    }
  });

  test('issues seven-day JWT tokens and rejects invalid bearer tokens', async () => {
    const token = issueToken(42, SECRET);
    const decoded = jwt.verify(token, SECRET);
    expect(decoded.sub).toBe('42');
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);

    const app = require('express')();
    app.get('/private', createAuthMiddleware(SECRET), (req, res) => res.json({ userId: req.auth.sub }));
    await request(app).get('/private').expect(401);
    await request(app).get('/private').set('Authorization', 'Bearer broken').expect(401);
    await request(app).get('/private').set('Authorization', `Bearer ${token}`).expect(200, { userId: '42' });
  });

  test('stores a new user and all mode stats in one parameterized transaction', async () => {
    const pool = createPool();
    pool.client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '10', username: 'alice', email: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const user = await createUser(pool, {
      username: 'alice',
      passwordHash: 'hashed-password'
    });
    expect(user.id).toBe('10');
    expect(pool.client.query.mock.calls[0][0]).toBe('BEGIN');
    expect(pool.client.query.mock.calls[1][1]).toEqual(['alice', 'hashed-password']);
    const statsCall = pool.client.query.mock.calls[2];
    expect(statsCall[0]).toContain('INSERT INTO user_stats');
    expect(statsCall[1]).toHaveLength(MODES.length * 4);
    expect(statsCall[1].filter((value) => value === 'Bronze I')).toHaveLength(MODES.length);
    expect(pool.client.query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(pool.client.release).toHaveBeenCalled();
  });

  test('rolls back account creation if initializing stats fails', async () => {
    const pool = createPool();
    pool.client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '10', username: 'alice', email: null }] })
      .mockRejectedValueOnce(new Error('stats insert failed'))
      .mockResolvedValueOnce({ rows: [] });
    await expect(createUser(pool, {
      username: 'alice',
      passwordHash: 'hashed-password'
    })).rejects.toThrow('stats insert failed');
    expect(pool.client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(pool.client.release).toHaveBeenCalled();
  });

  test('registers, hashes passwords, logs in, and serves authenticated profiles', async () => {
    const pool = createPool();
    const storedUser = { id: '23', username: 'alice', email: null, created_at: new Date() };
    pool.connect.mockImplementation(async () => ({
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [storedUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn()
    }));
    pool.query
      .mockResolvedValueOnce({ rows: [{ ...storedUser, password_hash: await bcrypt.hash('secure123', 4) }] })
      .mockResolvedValueOnce({ rows: [{
        id: '23',
        username: 'alice',
        stats: [{ mode: 'uno', mmr: 240, rank: 'Bronze I', gamesPlayed: 3, wins: 2 }]
      }] });
    const revokedTokens = new Map();
    const redisClient = {
      isReady: true,
      eval: jest.fn().mockResolvedValue([1, 900000]),
      set: jest.fn(async (key, value, options) => {
        revokedTokens.set(key, { value, options });
      }),
      get: jest.fn(async (key) => revokedTokens.get(key)?.value || null)
    };
    const app = createApp({ pool, redisClient, jwtSecret: SECRET });
    const registered = await request(app).post('/api/auth/register')
      .send({ username: 'alice', password: 'secure123' })
      .expect(201);
    expect(registered.body.user).toMatchObject({ username: 'alice', email: null });
    expect(jwt.verify(registered.body.token, SECRET).sub).toBe('23');

    const login = await request(app).post('/api/auth/login')
      .send({ username: 'alice', password: 'secure123' })
      .expect(200);
    const profile = await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(profile.body.user).toMatchObject({
      id: '23',
      username: 'alice',
      stats: [{ mode: 'uno', mmr: 240, rank: 'Bronze I', gamesPlayed: 3, wins: 2 }]
    });
    const logout = await request(app).post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(logout.body.status).toBe('ok');
    expect(redisClient.set.mock.calls[0][0]).toMatch(/^revoked:/);
    expect(redisClient.set.mock.calls[0][2].EX).toBeGreaterThan(0);
    await request(app).get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(401, { error: 'Sessione non valida o scaduta.' });
  });

  test('does not disclose whether a login username exists', async () => {
    const pool = createPool();
    pool.query.mockResolvedValueOnce({ rows: [] });
    const app = createApp({ pool, jwtSecret: SECRET });
    await request(app).post('/api/auth/login')
      .send({ username: 'missing', password: 'secure123' })
      .expect(401, { error: 'Nome utente o password non corretti.' });
    await request(app).post('/api/auth/register')
      .send({ username: 'admin', password: 'secure123' })
      .expect(400);
  });
});
