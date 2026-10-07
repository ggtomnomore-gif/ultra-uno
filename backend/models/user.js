'use strict';

const MODES = ['uno', 'scala40', 'ruba-mazzetto', 'blackjack', 'scopa', 'poker-texas', 'burraco', 'mille'];

async function createUser(pool, { username, passwordHash }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, email, created_at',
      [username, passwordHash]
    );
    const user = userResult.rows[0];
    const statsValues = [];
    const placeholders = MODES.map((mode, index) => {
      const base = index * 4;
      statsValues.push(user.id, mode, 200, 'Bronze I');
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    });
    await client.query(
      `INSERT INTO user_stats (user_id, game_mode, mmr, rank) VALUES ${placeholders.join(', ')}`,
      statsValues
    );
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findByUsername(pool, username) {
  const result = await pool.query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0] || null;
}

async function findPublicProfile(pool, userId) {
  const result = await pool.query(
    `SELECT u.id, u.username, u.created_at,
      COALESCE(json_agg(json_build_object(
        'mode', s.game_mode, 'mmr', s.mmr, 'rank', s.rank,
        'gamesPlayed', s.games_played, 'wins', s.wins
      ))
        FILTER (WHERE s.game_mode IS NOT NULL), '[]'::json) AS stats
     FROM users u LEFT JOIN user_stats s ON s.user_id = u.id
     WHERE u.id = $1 GROUP BY u.id`,
    [userId]
  );
  return result.rows[0] || null;
}

module.exports = { MODES, createUser, findByUsername, findPublicProfile };
