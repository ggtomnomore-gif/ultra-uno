'use strict';

const { seed } = require('../../database/seed');

/** Creates a minimal PostgreSQL pool double. */
function createDatabase(query) {
  const client = { query, release: jest.fn() };
  return { client, connect: jest.fn(async () => client) };
}

describe('database catalog seed', () => {
  test('seeds the catalog and 100-level Battle Card idempotently in one transaction', async () => {
    const query = jest.fn().mockResolvedValue({});
    const database = createDatabase(query);

    await seed(database);

    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT (item_id) DO UPDATE');
    expect(query.mock.calls[1][1]).toEqual([
      'theme-lava',
      'Lava Rossa',
      'Un tema ardente per l’arena.',
      'theme',
      'lava-red',
      350
    ]);
    expect(query.mock.calls[5][0]).toContain('INSERT INTO battle_card_rewards');
    expect(query.mock.calls[5][1]).toHaveLength(800);
    expect(query.mock.calls[5][1].filter((value) => value === 'free')).toHaveLength(100);
    expect(query.mock.calls[5][1].filter((value) => value === 'premium')).toHaveLength(100);
    expect(query.mock.calls.at(-1)[0]).toBe('COMMIT');
    expect(database.client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back and releases the connection when a seed query fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce({});
    const database = createDatabase(query);

    await expect(seed(database)).rejects.toThrow('Seed database fallito: database unavailable');
    expect(query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(database.client.release).toHaveBeenCalledTimes(1);
  });
});
