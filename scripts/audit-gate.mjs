// Fails the build on any high or critical dependency advisory in what ships, except the ones listed below, each with a reason
// and a way out. Keep this list short. `npm audit` alone cannot say "known and handled", so a single accepted item would otherwise
// keep the check red forever and teach everyone to ignore it.
import { execSync } from 'node:child_process';

const ACCEPTED = {
  // zod 3: memory exhaustion when validating huge arrays. Fixed only in zod 4 (a breaking upgrade of every contract).
  // Handled: the API refuses request bodies over 256 KB, which keeps any array small. Remove this line when zod 4 lands.
  'GHSA-mrhx-c7xc-m3w5': 'zod < 4.6.6: capped by the 256 KB request body limit; plan the zod 4 upgrade',
};

let raw = '';
try { raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
catch (e) { raw = e.stdout?.toString() ?? ''; } // npm audit exits non-zero when it finds something
const report = JSON.parse(raw || '{}');
const bad = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (!['high', 'critical'].includes(v.severity)) continue;
  const advisories = v.via.filter(x => typeof x === 'object');
  const ids = advisories.map(x => (x.url ?? '').split('/').pop());
  const unhandled = advisories.filter((x, i) => !ACCEPTED[ids[i]]);
  // A package flagged only because a dependency of it is flagged (via is a name): judged by that dependency instead.
  if (advisories.length === 0 || unhandled.length) bad.push(`${name} (${v.severity}): ${unhandled.map(x => x.title).join('; ') || v.via.join(', ')}`);
}
if (bad.length) { console.error('High or critical dependency advisories:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`Dependency audit passed. Accepted advisories: ${Object.keys(ACCEPTED).join(', ') || 'none'}`);
