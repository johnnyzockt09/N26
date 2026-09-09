import 'dotenv/config';
import { initDatabase } from '../src/db.js';
import { runMigrations } from '../src/db/postgres.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    const { db } = initDatabase(url);
    await runMigrations(db as never);
    console.log('PostgreSQL migration applied successfully');
    await db.close();
  } else {
    // SQLite schema is created automatically on init
    const app = initDatabase(url);
    await app.db.ping();
    console.log('SQLite database ready (schema auto-applied)');
    await app.close();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});