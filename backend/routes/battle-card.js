'use strict';

const express = require('express');

function currentLevel(progress, season) {
  return Math.min(
    season.max_level,
    Math.floor(progress.experience / season.xp_per_level) + progress.bonus_levels + 1
  );
}

function battleCardRoutes({ pool, authRequired }) {
  const router = express.Router();

  router.get('/', authRequired, async (request, response) => {
    try {
      const seasonResult = await pool.query(
        `SELECT season_id, name, max_level, xp_per_level, standard_price, boosted_price
         FROM battle_card_seasons WHERE active = TRUE`
      );
      const season = seasonResult.rows[0];
      if (!season) {
        response.status(503).json({ error: 'Nessuna stagione Battle Card è attiva.' });
        return;
      }
      const walletResult = await pool.query(
        'SELECT credits FROM user_wallets WHERE user_id = $1',
        [request.auth.sub]
      );
      if (!walletResult.rows[0]) {
        response.status(404).json({ error: 'Portafoglio non trovato. Applica le migrazioni del database.' });
        return;
      }
      await pool.query(
        `INSERT INTO battle_card_progress (user_id, season_id)
         VALUES ($1, $2) ON CONFLICT (user_id, season_id) DO NOTHING`,
        [request.auth.sub, season.season_id]
      );
      const [progressResult, rewardsResult] = await Promise.all([
        pool.query(
          `SELECT experience, bonus_levels, premium_unlocked
           FROM battle_card_progress WHERE user_id = $1 AND season_id = $2`,
          [request.auth.sub, season.season_id]
        ),
        pool.query(
          `SELECT reward.level, reward.track, reward.credits,
             (claim.level IS NOT NULL) AS claimed
           FROM battle_card_rewards reward
           LEFT JOIN battle_card_claims claim
             ON claim.user_id = $1 AND claim.season_id = reward.season_id
             AND claim.level = reward.level AND claim.track = reward.track
           WHERE reward.season_id = $2
           ORDER BY reward.level, reward.track`,
          [request.auth.sub, season.season_id]
        )
      ]);
      const progress = progressResult.rows[0];
      if (!progress) {
        response.status(503).json({ error: 'Progressi Battle Card non disponibili.' });
        return;
      }
      response.json({
        season: { id: season.season_id, name: season.name },
        level: currentLevel(progress, season),
        maxLevel: season.max_level,
        experience: progress.experience,
        experiencePerLevel: season.xp_per_level,
        premiumUnlocked: progress.premium_unlocked,
        prices: { standard: season.standard_price, boosted: season.boosted_price },
        credits: walletResult.rows[0].credits,
        rewards: rewardsResult.rows
      });
    } catch (error) {
      console.error('Battle Card lookup failed:', error.message);
      response.status(503).json({ error: 'Battle Card temporaneamente non disponibile.' });
    }
  });

  router.post('/unlock', authRequired, async (request, response) => {
    const tier = request.body?.tier;
    if (tier !== 'standard' && tier !== 'boosted') {
      response.status(400).json({ error: 'Scegli il pass standard o quello con progressi bonus.' });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const seasonResult = await client.query(
        `SELECT season_id, standard_price, boosted_price
         FROM battle_card_seasons WHERE active = TRUE FOR SHARE`
      );
      const season = seasonResult.rows[0];
      if (!season) {
        await client.query('ROLLBACK');
        response.status(503).json({ error: 'Nessuna stagione Battle Card è attiva.' });
        return;
      }
      await client.query(
        `INSERT INTO battle_card_progress (user_id, season_id)
         VALUES ($1, $2) ON CONFLICT (user_id, season_id) DO NOTHING`,
        [request.auth.sub, season.season_id]
      );
      const progress = await client.query(
        `SELECT premium_unlocked FROM battle_card_progress
         WHERE user_id = $1 AND season_id = $2 FOR UPDATE`,
        [request.auth.sub, season.season_id]
      );
      if (!progress.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Progressi Battle Card non trovati.' });
        return;
      }
      if (progress.rows[0].premium_unlocked) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Il pass premium è già attivo.' });
        return;
      }
      const price = tier === 'standard' ? season.standard_price : season.boosted_price;
      const wallet = await client.query(
        'SELECT credits FROM user_wallets WHERE user_id = $1 FOR UPDATE',
        [request.auth.sub]
      );
      if (!wallet.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Portafoglio non trovato.' });
        return;
      }
      const debit = await client.query(
        `UPDATE user_wallets SET credits = credits - $2, updated_at = NOW()
         WHERE user_id = $1 AND credits >= $2 RETURNING credits`,
        [request.auth.sub, price]
      );
      if (!debit.rows[0]) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Crediti insufficienti per sbloccare il pass.' });
        return;
      }
      const bonusLevels = tier === 'boosted' ? 20 : 0;
      await client.query(
        `UPDATE battle_card_progress
         SET premium_unlocked = TRUE, bonus_levels = bonus_levels + $3, updated_at = NOW()
         WHERE user_id = $1 AND season_id = $2`,
        [request.auth.sub, season.season_id, bonusLevels]
      );
      await client.query(
        `INSERT INTO credit_transactions (user_id, amount, reason)
         VALUES ($1, $2, 'purchase')`,
        [request.auth.sub, -price]
      );
      await client.query('COMMIT');
      response.json({ tier, premiumUnlocked: true, bonusLevels, credits: debit.rows[0].credits });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Battle Card unlock rollback failed:', rollbackError.message);
        }
      }
      console.error('Battle Card unlock failed:', error.message);
      response.status(503).json({ error: 'Impossibile sbloccare il pass Battle Card.' });
    } finally {
      client?.release();
    }
  });

  async function claimRewards(request, response, { level, track, all }) {
    if (!all && (!Number.isInteger(level) || level < 1 || !['free', 'premium'].includes(track))) {
      response.status(400).json({ error: 'Ricompensa Battle Card non valida.' });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const seasonResult = await client.query(
        `SELECT season_id, max_level, xp_per_level
         FROM battle_card_seasons WHERE active = TRUE FOR SHARE`
      );
      const season = seasonResult.rows[0];
      if (!season) {
        await client.query('ROLLBACK');
        response.status(503).json({ error: 'Nessuna stagione Battle Card è attiva.' });
        return;
      }
      await client.query(
        `INSERT INTO battle_card_progress (user_id, season_id)
         VALUES ($1, $2) ON CONFLICT (user_id, season_id) DO NOTHING`,
        [request.auth.sub, season.season_id]
      );
      const progressResult = await client.query(
        `SELECT experience, bonus_levels, premium_unlocked
         FROM battle_card_progress WHERE user_id = $1 AND season_id = $2 FOR UPDATE`,
        [request.auth.sub, season.season_id]
      );
      const progress = progressResult.rows[0];
      if (!progress) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Progressi Battle Card non trovati.' });
        return;
      }
      const unlockedLevel = currentLevel(progress, season);
      if (!all && level > unlockedLevel) {
        await client.query('ROLLBACK');
        response.status(403).json({ error: 'Raggiungi questo livello prima di riscattare la ricompensa.' });
        return;
      }
      if (!all && track === 'premium' && !progress.premium_unlocked) {
        await client.query('ROLLBACK');
        response.status(403).json({ error: 'Sblocca il pass premium per riscattare questa ricompensa.' });
        return;
      }
      const rewardsResult = await client.query(
        `SELECT reward.level, reward.track, reward.credits
         FROM battle_card_rewards reward
         LEFT JOIN battle_card_claims claim
           ON claim.user_id = $1 AND claim.season_id = reward.season_id
           AND claim.level = reward.level AND claim.track = reward.track
         WHERE reward.season_id = $2 AND reward.level <= $3
           AND claim.level IS NULL
           AND ($4::BOOLEAN OR (reward.level = $5 AND reward.track = $6))
           AND (reward.track = 'free' OR $7::BOOLEAN)
         ORDER BY reward.level, reward.track`,
        [request.auth.sub, season.season_id, unlockedLevel, all, level || null, track || null, progress.premium_unlocked]
      );
      const rewards = rewardsResult.rows;
      if (!rewards.length) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Nessuna ricompensa riscattabile.' });
        return;
      }
      const wallet = await client.query(
        'SELECT credits FROM user_wallets WHERE user_id = $1 FOR UPDATE',
        [request.auth.sub]
      );
      if (!wallet.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Portafoglio non trovato.' });
        return;
      }
      const rewardTotal = rewards.reduce((sum, reward) => sum + reward.credits, 0);
      const creditUpdate = await client.query(
        `UPDATE user_wallets SET credits = credits + $2, updated_at = NOW()
         WHERE user_id = $1 RETURNING credits`,
        [request.auth.sub, rewardTotal]
      );
      for (const reward of rewards) {
        await client.query(
          `INSERT INTO battle_card_claims (user_id, season_id, level, track)
           VALUES ($1, $2, $3, $4)`,
          [request.auth.sub, season.season_id, reward.level, reward.track]
        );
        await client.query(
          `INSERT INTO credit_transactions (user_id, amount, reason)
           VALUES ($1, $2, 'reward')`,
          [request.auth.sub, reward.credits]
        );
      }
      await client.query('COMMIT');
      response.json({
        rewards,
        credits: creditUpdate.rows[0].credits,
        level: unlockedLevel
      });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Battle Card claim rollback failed:', rollbackError.message);
        }
      }
      console.error('Battle Card claim failed:', error.message);
      response.status(503).json({ error: 'Impossibile riscattare le ricompense Battle Card.' });
    } finally {
      client?.release();
    }
  }

  router.post('/claim', authRequired, (request, response) => claimRewards(request, response, {
    level: request.body?.level,
    track: request.body?.track,
    all: false
  }));
  router.post('/claim-all', authRequired, (request, response) => claimRewards(request, response, {
    all: true
  }));

  return router;
}

module.exports = { battleCardRoutes, currentLevel };
