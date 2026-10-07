'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../backend/config/db');

async function migrate(database = pool) {
  const directory = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(directory)).filter((file) => /^\d+_[\w-]+\.sql$/.test(file)).sort();
  for (const filename of files) {
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [filename]);
      if (exists.rowCount === 0) {
        const sql = await fs.readFile(path.join(directory, filename), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${filename} fallita: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
}

if (require.main === module) {
  migrate().then(() => {
    console.log('Migrazioni database completate.');
    return pool.end();
  }).catch(async (error) => {
    console.error(error.message);
    await pool.end();
    process.exitCode = 1;
  });
}

module.exports = { migrate };
