import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { migrate } from './db/migrate.js';
import { startWorker } from './jobs/worker.js';

const cfg = loadConfig();
const { app, ctx } = await buildApp(cfg);

if (cfg.NODE_ENV !== 'production' || process.env.AUTO_MIGRATE === '1') {
  const applied = await migrate(ctx.db, m => app.log.info(m));
  if (applied.length) app.log.info({ applied }, 'migrations applied');
}

const stopWorker = cfg.RUN_WORKER ? startWorker(ctx) : () => undefined;
await app.listen({ port: cfg.PORT, host: cfg.HOST });
app.log.info({ llm: ctx.llm.name, otp: ctx.otp.name, push: ctx.push.enabled, stt: !!ctx.stt, tts: !!ctx.tts, calls: !!ctx.telephony }, 'Saathi API ready');

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopWorker();
    await app.close();
    process.exit(0);
  });
}
