'use strict';

const { calculateMultiplayerMatchResult } = require('./ranking');

async function recordMatchResult(pool, { userIds, winnerUserId }) {
  if (
    !Array.isArray(userIds)
    || userIds.length < 2
    || !userIds.includes(winnerUserId)
    || new Set(userIds).size !== userIds.length
  ) {
    throw new TypeError('Risultato partita non valido.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const stats = await client.query(
      `SELECT user_id, mmr FROM user_stats
       WHERE game_mode = 'uno' AND user_id = ANY($1::BIGINT[])
       ORDER BY user_id FOR UPDATE`,
      [userIds]
    );
    if (stats.rows.length !== userIds.length) {
      throw new Error('Statistiche UNO non trovate per tutti i partecipanti.');
    }
    const ratings = calculateMultiplayerMatchResult(
      stats.rows.map((row) => ({ userId: String(row.user_id), mmr: row.mmr })),
      winnerUserId
    );
    for (const result of ratings) {
      await client.query(
        `UPDATE user_stats SET mmr = $3, rank = $4,
           games_played = games_played + 1, wins = wins + $5, updated_at = NOW()
         WHERE user_id = $1 AND game_mode = $2`,
        [result.userId, 'uno', result.after, result.rank, result.won ? 1 : 0]
      );
    }
    const season = await client.query(
      'SELECT season_id FROM battle_card_seasons WHERE active = TRUE'
    );
    if (season.rows[0]) {
      for (const userId of [...userIds].sort()) {
        await client.query(
          `INSERT INTO battle_card_progress (user_id, season_id)
           VALUES ($1, $2) ON CONFLICT (user_id, season_id) DO NOTHING`,
          [userId, season.rows[0].season_id]
        );
        await client.query(
          `UPDATE battle_card_progress
           SET experience = experience + $3, updated_at = NOW()
           WHERE user_id = $1 AND season_id = $2`,
          [userId, season.rows[0].season_id, userId === winnerUserId ? 200 : 100]
        );
      }
    }
    for (const userId of [...userIds].sort()) {
      await client.query(
        `INSERT INTO user_daily_challenges
           (user_id, challenge_id, challenge_date, progress)
         SELECT $1, challenge.challenge_id, (NOW() AT TIME ZONE 'UTC')::date, 1
         FROM daily_challenges challenge
         WHERE challenge.enabled = TRUE
           AND (challenge.metric = 'uno_match'
             OR (challenge.metric = 'uno_win' AND $2::BOOLEAN))
         ON CONFLICT (user_id, challenge_id, challenge_date) DO UPDATE SET
           progress = LEAST(
             (SELECT target FROM daily_challenges
              WHERE challenge_id = EXCLUDED.challenge_id),
             user_daily_challenges.progress + EXCLUDED.progress
           ),
           updated_at = NOW()`,
        [userId, userId === winnerUserId]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Match result rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { recordMatchResult };
