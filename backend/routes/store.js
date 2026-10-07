'use strict';

const DEFAULT_THEME = { id: 'theme-cyber', name: 'Cyber Blue', theme: 'cyber-blue', price: 0 };

function storeRoutes({ pool, authRequired }) {
  const router = require('express').Router();

  router.get('/', authRequired, async (request, response) => {
    try {
      const [wallet, catalog, inventory, transactions] = await Promise.all([
        pool.query('SELECT credits FROM user_wallets WHERE user_id = $1', [request.auth.sub]),
        pool.query(
          `SELECT item_id, name, description, category, theme_key, price
           FROM store_items WHERE enabled = TRUE ORDER BY item_id`
        ),
        pool.query('SELECT item_id, equipped FROM user_inventory WHERE user_id = $1', [request.auth.sub]),
        pool.query(
          `SELECT amount, reason, item_id, created_at
           FROM credit_transactions WHERE user_id = $1
           ORDER BY created_at DESC, transaction_id DESC LIMIT 20`,
          [request.auth.sub]
        )
      ]);
      if (!wallet.rows[0]) {
        response.status(404).json({ error: 'Portafoglio non trovato. Applica le migrazioni del database.' });
        return;
      }
      const owned = new Map(inventory.rows.map((item) => [item.item_id, item]));
      const items = catalog.rows.map((item) => ({
        id: item.item_id,
        name: item.name,
        description: item.description,
        category: item.category,
        theme: item.theme_key,
        price: item.price,
        owned: owned.has(item.item_id),
        equipped: owned.get(item.item_id)?.equipped === true
      }));
      const activeItemId = inventory.rows.find((item) => item.equipped)?.item_id;
      response.json({
        credits: wallet.rows[0].credits,
        activeTheme: items.find((item) => item.id === activeItemId)?.theme || DEFAULT_THEME.theme,
        items,
        transactions: transactions.rows
      });
    } catch (error) {
      console.error('Store catalog lookup failed:', error.message);
      response.status(503).json({ error: 'Negozio temporaneamente non disponibile.' });
    }
  });

  router.post('/purchase', authRequired, async (request, response) => {
    const itemId = request.body?.itemId;
    if (typeof itemId !== 'string' || itemId.length > 40) {
      response.status(400).json({ error: 'Articolo non valido.' });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const wallet = await client.query('SELECT credits FROM user_wallets WHERE user_id = $1 FOR UPDATE', [request.auth.sub]);
      if (!wallet.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Portafoglio non trovato. Applica le migrazioni del database.' });
        return;
      }
      const itemResult = await client.query(
        'SELECT item_id, price FROM store_items WHERE item_id = $1 AND enabled = TRUE FOR SHARE',
        [itemId]
      );
      const item = itemResult.rows[0];
      if (!item) {
        await client.query('ROLLBACK');
        response.status(400).json({ error: 'Articolo non valido.' });
        return;
      }
      const existing = await client.query(
        'SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2',
        [request.auth.sub, item.item_id]
      );
      if (existing.rowCount > 0) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Possiedi già questo articolo.' });
        return;
      }
      const debit = await client.query(
        'UPDATE user_wallets SET credits = credits - $2, updated_at = NOW() WHERE user_id = $1 AND credits >= $2 RETURNING credits',
        [request.auth.sub, item.price]
      );
      if (!debit.rows[0]) {
        await client.query('ROLLBACK');
        response.status(409).json({ error: 'Crediti insufficienti.' });
        return;
      }
      await client.query(
        'INSERT INTO user_inventory (user_id, item_id) VALUES ($1, $2)',
        [request.auth.sub, item.item_id]
      );
      await client.query(
        'INSERT INTO credit_transactions (user_id, amount, reason, item_id) VALUES ($1, $2, $3, $4)',
        [request.auth.sub, -item.price, 'purchase', item.item_id]
      );
      await client.query('COMMIT');
      response.status(201).json({ itemId: item.item_id, credits: debit.rows[0].credits });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Store purchase rollback failed:', rollbackError.message);
        }
      }
      console.error('Store purchase failed:', error.message);
      response.status(503).json({ error: 'Acquisto non completato. Riprova più tardi.' });
    } finally {
      client?.release();
    }
  });

  router.post('/equip', authRequired, async (request, response) => {
    const itemId = request.body?.itemId;
    if (typeof itemId !== 'string' || itemId.length > 40) {
      response.status(400).json({ error: 'Tema non valido.' });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const wallet = await client.query('SELECT credits FROM user_wallets WHERE user_id = $1 FOR UPDATE', [request.auth.sub]);
      if (!wallet.rows[0]) {
        await client.query('ROLLBACK');
        response.status(404).json({ error: 'Portafoglio non trovato. Applica le migrazioni del database.' });
        return;
      }
      let theme = DEFAULT_THEME.theme;
      if (itemId !== DEFAULT_THEME.id) {
        const itemResult = await client.query(
          'SELECT item_id, theme_key FROM store_items WHERE item_id = $1 AND enabled = TRUE FOR SHARE',
          [itemId]
        );
        const item = itemResult.rows[0];
        if (!item) {
          await client.query('ROLLBACK');
          response.status(400).json({ error: 'Tema non valido.' });
          return;
        }
        const owned = await client.query(
          'SELECT 1 FROM user_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE',
          [request.auth.sub, item.item_id]
        );
        if (owned.rowCount === 0) {
          await client.query('ROLLBACK');
          response.status(403).json({ error: 'Acquista il tema prima di equipaggiarlo.' });
          return;
        }
        theme = item.theme_key;
      }
      await client.query('UPDATE user_inventory SET equipped = FALSE WHERE user_id = $1 AND equipped', [request.auth.sub]);
      if (itemId !== DEFAULT_THEME.id) {
        await client.query('UPDATE user_inventory SET equipped = TRUE WHERE user_id = $1 AND item_id = $2', [request.auth.sub, itemId]);
      }
      await client.query('COMMIT');
      response.json({ itemId, theme });
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Store equip rollback failed:', rollbackError.message);
        }
      }
      console.error('Store equip failed:', error.message);
      response.status(503).json({ error: 'Impossibile equipaggiare il tema.' });
    } finally {
      client?.release();
    }
  });

  return router;
}

module.exports = { DEFAULT_THEME, storeRoutes };
