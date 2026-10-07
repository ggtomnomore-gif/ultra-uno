'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../backend/config/db');

/**
 * Inserts or updates the checked-in shop catalog in a single transaction.
 * @param {{ connect: () => Promise<import('pg').PoolClient> }} database PostgreSQL pool.
 * @returns {Promise<void>}
 */
async function seed(database = pool) {
  const seedPath = path.join(__dirname, 'seeds', 'shop_items.json');
  const items = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  const battleCardPath = path.join(__dirname, 'seeds', 'battle_card_rewards.json');
  const battleCard = JSON.parse(await fs.readFile(battleCardPath, 'utf8'));
  if (!Array.isArray(items) || items.some((item) => (
    !item
    || typeof item.itemId !== 'string'
    || typeof item.name !== 'string'
    || typeof item.description !== 'string'
    || typeof item.category !== 'string'
    || typeof item.themeKey !== 'string'
    || !Number.isInteger(item.price)
    || item.price <= 0
  ))) {
    throw new Error('Seed catalogo shop_items.json non valido.');
  }
  if (
    typeof battleCard.seasonId !== 'string'
    || typeof battleCard.name !== 'string'
    || !Number.isInteger(battleCard.maxLevel)
    || battleCard.maxLevel < 1
    || !Number.isInteger(battleCard.xpPerLevel)
    || battleCard.xpPerLevel < 1
    || !Number.isInteger(battleCard.standardPrice)
    || battleCard.standardPrice < 1
    || !Number.isInteger(battleCard.boostedPrice)
    || battleCard.boostedPrice < battleCard.standardPrice
    || !Number.isInteger(battleCard.freeCreditsPerLevel)
    || battleCard.freeCreditsPerLevel < 1
    || !Number.isInteger(battleCard.premiumCreditsPerLevel)
    || battleCard.premiumCreditsPerLevel < 1
  ) {
    throw new Error('Seed battle_card_rewards.json non valido.');
  }

  const client = await database.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `INSERT INTO store_items (item_id, name, description, category, theme_key, price)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (item_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           theme_key = EXCLUDED.theme_key,
           price = EXCLUDED.price`,
        [item.itemId, item.name, item.description, item.category, item.themeKey, item.price]
      );
    }
    await client.query(
      `INSERT INTO battle_card_seasons
       (season_id, name, max_level, xp_per_level, standard_price, boosted_price, active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (season_id) DO UPDATE SET
         name = EXCLUDED.name,
         max_level = EXCLUDED.max_level,
         xp_per_level = EXCLUDED.xp_per_level,
         standard_price = EXCLUDED.standard_price,
         boosted_price = EXCLUDED.boosted_price,
         active = TRUE`,
      [
        battleCard.seasonId,
        battleCard.name,
        battleCard.maxLevel,
        battleCard.xpPerLevel,
        battleCard.standardPrice,
        battleCard.boostedPrice
      ]
    );
    const rewardValues = [];
    const rewardPlaceholders = [];
    for (let level = 1; level <= battleCard.maxLevel; level += 1) {
      for (const [track, credits] of [
        ['free', battleCard.freeCreditsPerLevel],
        ['premium', battleCard.premiumCreditsPerLevel]
      ]) {
        const base = rewardValues.length;
        rewardValues.push(battleCard.seasonId, level, track, credits);
        rewardPlaceholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
      }
    }
    await client.query(
      `INSERT INTO battle_card_rewards (season_id, level, track, credits)
       VALUES ${rewardPlaceholders.join(', ')}
       ON CONFLICT (season_id, level, track) DO UPDATE SET credits = EXCLUDED.credits`,
      rewardValues
    );
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Seed rollback failed:', rollbackError.message);
    }
    throw new Error(`Seed database fallito: ${error.message}`, { cause: error });
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seed().then(() => {
    console.log('Seed catalogo Negozio completato.');
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => {
    await pool.end();
  });
}

module.exports = { seed };
