import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../../context.js';
import { badRequest } from '../../errors.js';
import { GitHub, GitHubError, parseRepo } from '../github.js';
import { buildInfo } from './overview.js';
import { body, guard, params, payload, record } from './util.js';

// The Developer page: what is in the repository, what CI is doing, which version each environment runs, and the
// deploy buttons. The portal starts the deploy workflow; the workflow (in .github/workflows) does the work.

export function devRoutes(app: FastifyInstance, ctx: Ctx) {
  const f = () => ctx.fetchImpl ?? fetch;

  const github = (): { gh: GitHub } | { missing: string[] } => {
    const repo = parseRepo(ctx.rt.settings.str('dev.github_repo'));
    const token = ctx.rt.secrets.get('github', 'token');
    const missing = [...(repo ? [] : ['the repository (Settings → Developer)']), ...(token ? [] : ['a GitHub token (Integrations)'])];
    return missing.length ? { missing } : { gh: new GitHub(token!, repo!, f()) };
  };

  const ping = async (e: { name: string; url: string }) => {
    const t0 = Date.now();
    const base = e.url.replace(/\/$/, '');
    try {
      const v = await f()(`${base}/version`, { signal: AbortSignal.timeout(4000) });
      const r = await f()(`${base}/readyz`, { signal: AbortSignal.timeout(4000) });
      const info = v.ok ? ((await v.json()) as { version?: string; commit?: string | null; environment?: string; builtAt?: string | null }) : {};
      return { ...e, ok: r.ok, latencyMs: Date.now() - t0, version: info.version ?? null, commit: info.commit ?? null, builtAt: info.builtAt ?? null, environment: info.environment ?? null, error: r.ok ? null : `Not ready (${r.status})` };
    } catch (err) {
      return { ...e, ok: false, latencyMs: null, version: null, commit: null, builtAt: null, environment: null, error: (err as Error).message.slice(0, 100) };
    }
  };

  app.get('/dev', guard(ctx, 'dev.read'), async () => {
    const envs = await Promise.all(ctx.rt.settings.get<{ name: string; url: string }[]>('dev.environments').map(ping));
    const gh = github();
    const base = { build: buildInfo(), environments: envs, canDeploy: ['staging', 'production'] };
    if ('missing' in gh) return { ...base, configured: false, missing: gh.missing };
    try { return { ...base, configured: true, ...(await gh.gh.overview()) }; }
    catch (e) { return { ...base, configured: true, error: (e as Error).message }; }
  });

  app.post('/dev/deploy', guard(ctx, 'dev.deploy', req => `Deploy “${payload(req).ref ?? 'main'}” to ${payload(req).environment}`), async req => {
    const b = body(z.object({ environment: z.enum(['staging', 'production']), ref: z.string().trim().regex(/^[\w./-]{1,80}$/).default('main'), confirm: z.string().optional() }), req.body);
    if (b.environment === 'production') {
      const { can } = await import('../rbac.js');
      if (!can(req.admin!.role, 'dev.deploy_prod')) throw badRequest('forbidden', 'Only an owner can deploy to production.');
      if (b.confirm !== 'production') throw badRequest('confirm_required', 'Type “production” to confirm.');
    }
    const gh = github();
    if ('missing' in gh) throw badRequest('not_configured', `Add ${gh.missing.join(' and ')} first.`);
    try { await gh.gh.dispatchDeploy(b.environment, b.ref); } catch (e) { if (e instanceof GitHubError) throw badRequest('github_error', e.message); throw e; }
    await record(ctx, req, 'deploy.started', b.environment, undefined, { ref: b.ref });
    return { ok: true, note: 'The deploy workflow was started. Watch it under Recent runs.' };
  });

  app.post('/dev/runs/:id/rerun', guard(ctx, 'dev.deploy', req => `Re-run workflow run ${params(req).id}`), async req => {
    const id = Number((req.params as { id: string }).id);
    const gh = github();
    if ('missing' in gh) throw badRequest('not_configured', `Add ${gh.missing.join(' and ')} first.`);
    try { await gh.gh.rerun(id); } catch (e) { if (e instanceof GitHubError) throw badRequest('github_error', e.message); throw e; }
    await record(ctx, req, 'ci.rerun', String(id));
    return { ok: true };
  });
}
