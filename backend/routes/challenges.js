'use strict';

const express = require('express');

function challengesRoutes({ pool, authRequired }) {
  const router = express.Router();

  router.get('/', authRequired, async (request, response) => {
    try {
      const result = await pool.query(
        `SELECT challenge.challenge_id, challenge.title, challenge.description,
           challenge.target, challenge.reward,
           COALESCE(progress.progress, 0) AS progress,
           COALESCE(progress.claimed, FALSE) AS claimed,
           TO_CHAR((NOW() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS challenge_date
         FROM daily_challenges challenge
         LEFT JOIN user_daily_challenges progress
           ON progress.challenge_id = challenge.challenge_id
           AND progress.user_id = $1
           AND progress.challenge_date = (NOW() AT TIME ZONE 'UTC')::date
         WHERE challenge.enabled = TRUE
         ORDER BY challenge.challenge_id`,
        [request.auth.sub]
      );
      response.json({ challenges: result.rows });
    } catch (error) {
      console.error('Daily challenge lookup failed:', error.message);
      response.status(503).json({ error: 'Sfide giornaliere temporaneamente non disponibili.' });
    }
  });

  router.post('/claim', authRequired, async (request, response) => {
    const challengeId = request.body?.challengeId;
    if (typeof challengeId !== 'string' || challengeId.length > 40) {
      response.status(400).json({ error: 'Sfida non valida.' });
      return;
    }

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const challengeResult = await client.query(
        `SELECT challenge_id, target, reward FROM daily_challenges
         WHERE challenge_id = $1 AND enabled = TRUE FOR SHARE`,
        [challengeId]
      );
      const challenge = challengeResult.rows[0];
      if (!challenge) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Sfida non trovata.' });
        return;
      }
      const progressResult = await client.query(
        `SELECT progress, claimed FROM user_daily_challenges
         WHERE user_id = $1 AND challenge_id = $2
           AND challenge_date = (NOW() AT TIME ZONE 'UTC')::date
         FOR UPDATE`,
        [request.auth.sub, challengeId]
      );
      const progress = progressResult.rows[0];
      if (!progress || progress.progress < challenge.target) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Completa la sfida prima di riscattare la ricompensa.' });
        return;
      }
      if (progress.claimed) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'La ricompensa di questa sfida è già stata riscattata.' });
        return;
      }
      const wallet = await client.query(
        'SELECT credits FROM user_wallets WHERE user_id = $1 FOR UPDATE',
        [request.auth.sub]
      );
      if (!wallet.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Portafoglio non trovato. Applica le migrazioni del database.' });
        return;
      }
      const credited = await client.query(
        `UPDATE user_wallets SET credits = credits + $2, updated_at = NOW()
         WHERE user_id = $1 RETURNING credits`,
        [request.auth.sub, challenge.reward]
      );
      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, reason)
         VALUES ($1, $2, 'reward')`,
        [request.auth.sub, challenge.reward]
      );
      await client.query(
        `UPDATE user_daily_challenges SET claimed = TRUE, updated_at = NOW()
         WHERE user_id = $1 AND challenge_id = $2
           AND challenge_date = (NOW() AT TIME ZONE 'UTC')::date`,
        [request.auth.sub, challengeId]
      );
      await client.query('COMMIT');
      response.json({ challengeId, reward: challenge.reward, credits: credited.rows[0].credits });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Daily challenge claim rollback failed:', rollbackError.message);
        }
      }
      console.error('Daily challenge claim failed:', error.message);
      response.status(503).json({ error: 'Riscatto sfida non completato. Riprova più tardi.' });
    } finally {
      client?.release();
    }
  });

  return router;
}

module.exports = { challengesRoutes };
