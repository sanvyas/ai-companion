import { loadConfig } from '../config.js';
import { createPool } from './pool.js';
import { migrate } from './migrate.js';
import { seedReference, seedDemoEvents } from './seed.js';

const cfg = loadConfig();
const db = createPool(cfg);
try {
  const applied = await migrate(db, m => console.log(m));
  console.log(applied.length ? `${applied.length} migration(s) applied` : 'database is up to date');
  await seedReference(db);
  console.log('reference data (helplines, calm catalogue) up to date');
  if (process.argv.includes('--demo-events')) {
    await seedDemoEvents(db);
    console.log('demo events added (development only)');
  }
} finally {
  await db.end();
}
