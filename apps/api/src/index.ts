import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { seedReference } from './db/seed.js';
import { startWorker } from './jobs/worker.js';
import { bootstrapAdmin } from './admin/bootstrap.js';

const cfg = loadConfig();
const db = createPool(cfg);

// The app reads settings, prompts and credentials from the database as it starts, so the tables must exist first.
// In production run `db:migrate` as a release step (or set AUTO_MIGRATE=1).
if (cfg.NODE_ENV !== 'production' || process.env.AUTO_MIGRATE === '1') {
  const applied = await migrate(db, m => console.log(m));
  if (applied.length) console.log(`${applied.length} migration(s) applied`);
  // Helplines and the calm catalogue are safety content: they must exist before the first person signs in.
  await seedReference(db);
}
await bootstrapAdmin(db, console.log);

const { app, ctx } = await buildApp(cfg, { db });
const stopWorker = cfg.RUN_WORKER ? startWorker(ctx) : () => undefined;
await app.listen({ port: cfg.PORT, host: cfg.HOST });
app.log.info({ llm: ctx.llm.name, otp: ctx.otp.name, push: ctx.push.enabled, stt: !!ctx.stt, tts: !!ctx.tts, calls: !!ctx.telephony }, 'Saathi API ready');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopWorker();
    await app.close();
    await db.end();
    process.exit(0);
  });
}
