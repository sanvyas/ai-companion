import { Companion } from '../components/figures';
import { go } from '../state/actions';
import { set, useStore } from '../state/store';
import { BRAND, PITCH, TAGLINE } from './brand';
import { s } from './css';
import { paletteById } from './palette';
import { useV3 } from './ui';

// The first screen. A garden at the edge of morning, Flint standing in it, a real exchange floating above (so it is plain that this is
// a conversation and not a list of tools), and the four things the app does drawn as little pictures. It fits one phone screen.

const glass = 'background:color-mix(in srgb,var(--card) 84%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 12px 28px rgba(30,36,48,.12),0 0 0 1px color-mix(in srgb,var(--card) 60%,transparent)';

function Bubble({ me, children, style, delay = 0 }: { me?: boolean; children: React.ReactNode; style: string; delay?: number }) {
  return (
    <div style={{ ...s(`position:absolute;max-width:206px;border-radius:${me ? '20px 20px 6px 20px' : '20px 20px 20px 6px'};padding:11px 15px;font-size:15px;line-height:1.35;font-weight:600;animation:kBob 5s ease-in-out ${delay}s infinite;${me ? 'background:var(--accent);color:#FFFFFF;box-shadow:0 12px 26px rgba(30,36,48,.2)' : `color:var(--ink);${glass}`};${style}`) }}>{children}</div>
  );
}

/** Four things, four small drawings. */
function Pic({ kind }: { kind: 'talk' | 'relax' | 'write' | 'grow' }) {
  const bg = { talk: ['#C9C4F4', '#F3D3E6'], relax: ['#BFE6DB', '#D5E3F7'], write: ['#FBE3B4', '#F9C9C0'], grow: ['#CFE9B8', '#F6E3A8'] }[kind];
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <defs><linearGradient id={`wp-${kind}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bg[0]} /><stop offset="1" stopColor={bg[1]} /></linearGradient></defs>
      <clipPath id={`wc-${kind}`}><rect width="68" height="68" rx="22" /></clipPath><rect width="68" height="68" rx="22" fill={`url(#wp-${kind})`} /><g clipPath={`url(#wc-${kind})`}>
      {kind === 'talk' && <><path d="M13 20 h28 a6 6 0 0 1 6 6 v11 a6 6 0 0 1 -6 6 h-14 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-11 a6 6 0 0 1 6 -6z" fill="#FFFFFF" /><circle cx="22" cy="31" r="2.4" fill="var(--accent2)" /><circle cx="30" cy="31" r="2.4" fill="var(--accent2)" opacity=".7" /><circle cx="38" cy="31" r="2.4" fill="var(--accent2)" opacity=".45" /><path d="M36 41 h17 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-3 v6 l-7 -6 h-7 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5z" fill="var(--accent)" transform="translate(-3 -9) scale(.92)" /><path d="M50 36 c-6 -5 -2 -10 1 -7 c3 -3 7 2 -1 7z" fill="#FF8FB1" transform="translate(-4 4)" /></>}
      {kind === 'relax' && <><circle cx="34" cy="36" r="22" fill="#FFFFFF" opacity=".35" /><circle cx="34" cy="36" r="15" fill="#FFFFFF" opacity=".5" /><path d="M34 22 c5 5 5 11 0 17 c-5 -6 -5 -12 0 -17z M20 30 c6 0 10 4 14 10 c-7 1 -12 -3 -14 -10z M48 30 c-6 0 -10 4 -14 10 c7 1 12 -3 14 -10z" fill="#FFFFFF" /><path d="M18 46 c9 4 23 4 32 0" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".9" /></>}
      {kind === 'write' && <><rect x="17" y="16" width="30" height="38" rx="5" fill="#FFFFFF" transform="rotate(-6 32 35)" /><path d="M23 27 h16 M23 33 h16 M23 39 h10" stroke="#E2B58A" strokeWidth="2.2" strokeLinecap="round" transform="rotate(-6 32 35)" /><g transform="rotate(34 48 30)"><rect x="44" y="14" width="7" height="30" rx="3.5" fill="#F2A33D" /><path d="M44 44 l3.5 8 l3.5 -8z" fill="#FBE3C0" /><path d="M46 49 l1.5 3 l1.5 -3z" fill="#2A2E45" /></g></>}
      {kind === 'grow' && <><circle cx="48" cy="20" r="7" fill="#FFE08A" /><path d="M8 52 c10 -9 22 -3 30 -6 c8 -3 14 0 22 -4 v26 h-52z" fill="#8FCB8A" opacity=".75" /><path d="M34 54 v-14" stroke="#4F9A5C" strokeWidth="3" strokeLinecap="round" /><path d="M34 42 c-9 0 -12 -8 -11 -13 c8 0 12 5 11 13z" fill="#6FBF73" /><path d="M34 38 c9 0 12 -8 11 -13 c-8 0 -12 5 -11 13z" fill="#8BD28D" /></>}
      </g>
    </svg>
  );
}

const FOUR: { kind: 'talk' | 'relax' | 'write' | 'grow'; label: string }[] = [
  { kind: 'talk', label: 'Talk' }, { kind: 'relax', label: 'Relax' }, { kind: 'write', label: 'Write' }, { kind: 'grow', label: 'Grow' },
];

export function WelcomeV3() {
  const look = useStore(x => x.look);
  const dark = !!paletteById(useV3(x => x.palette)).dark;
  return (
    <main aria-label="Welcome" data-scroll="1" style={{ ...s('position:absolute;inset:0;display:flex;flex-direction:column;overflow:auto;background:var(--page)') }}>
      <section aria-hidden="true" className="wel-hero" style={s('position:relative;flex:none;height:380px;overflow:hidden')}>
        <span style={s(`position:absolute;right:-30px;top:-20px;width:230px;height:230px;border-radius:50%;opacity:${dark ? 0.35 : 1};background:radial-gradient(circle,#FFF6D8 0%,rgba(255,246,216,.55) 38%,rgba(255,246,216,0) 70%)`)} />
        <svg viewBox="0 0 390 372" preserveAspectRatio="xMidYMax slice" width="100%" height="100%" focusable="false" style={{ position: 'absolute', inset: 0 }}>
          <path d="M0 250 C70 214 130 232 200 226 C270 220 330 196 390 214 V372 H0z" fill="#CFE8CF" />
          <path d="M0 286 C80 254 150 276 230 268 C300 260 350 250 390 258 V372 H0z" fill="#AEDAB1" />
          <path d="M0 322 C90 300 170 322 250 314 C320 308 360 304 390 308 V372 H0z" fill="#8CC594" />
          {[[34, 304, '#F2B33D'], [70, 326, '#E8789B'], [326, 312, '#B7A6F0'], [356, 332, '#FFFFFF'], [120, 336, '#F28C6B'], [292, 338, '#F2B33D']].map(([x, y, c], i) => (
            <g key={i} transform={`translate(${x} ${y})`}><path d="M0 0 v-18" stroke="#5E9A66" strokeWidth="2.2" strokeLinecap="round" />{[0, 72, 144, 216, 288].map(a => <ellipse key={a} cx="0" cy="-24" rx="4" ry="6.4" fill={c as string} transform={`rotate(${a} 0 -18)`} />)}<circle cx="0" cy="-18" r="3.2" fill="#FFF3C4" /></g>
          ))}
        </svg>
        <Bubble style="left:20px;top:26px" delay={0}>How was your day?</Bubble>
        <Bubble me style="right:20px;top:72px" delay={-1.6}>Honestly, a bit heavy.</Bubble>
        <span className="wel-b3"><Bubble style="left:20px;top:118px;max-width:250px;white-space:nowrap" delay={-3.2}>I’m here. Tell me more.</Bubble></span>
        <div className="wel-av" style={s('position:absolute;left:50%;bottom:44px;margin-left:-74px;width:148px;height:148px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 50% 36%,#FFFFFF,var(--t1));box-shadow:0 16px 34px rgba(30,36,48,.18);display:flex;justify-content:center;align-items:flex-end')}><Companion look={look} size={148} /></div>
      </section>

      <section style={s('position:relative;flex:1;margin-top:-30px;border-radius:32px 32px 0 0;background:var(--bg);padding:26px 24px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 -10px 30px rgba(30,36,48,.08)')}>
        <div style={s('display:flex;flex-direction:column;gap:6px;text-align:center;align-items:center')}>
          <span style={s('font-size:13px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-ink)')}>{BRAND}</span>
          <h1 className="serif" style={s('font-size:36px;line-height:1.08;margin:0')}>{TAGLINE}</h1>
          <p style={s('font-size:16px;line-height:1.5;color:var(--muted);margin:0;max-width:320px')}>{PITCH}</p>
        </div>
        <div role="list" aria-label="What it does" style={s('display:flex;justify-content:space-between;gap:8px;padding:2px 6px')}>
          {FOUR.map(f => (
            <div key={f.kind} role="listitem" style={s('display:flex;flex-direction:column;align-items:center;gap:6px')}>
              <Pic kind={f.kind} />
              <span style={s('font-size:14px;font-weight:700')}>{f.label}</span>
            </div>
          ))}
        </div>
        <p style={s('font-size:13px;line-height:1.45;color:var(--muted);margin:0;text-align:center')}>{BRAND} is an AI companion, not a therapist or a doctor. If you’re ever in danger, it helps you reach real people.</p>
        <div style={s('margin-top:auto;display:flex;flex-direction:column;gap:4px')}>
          <button type="button" onClick={() => { set({ returning: false }); go('age'); }} style={s('height:56px;border-radius:28px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:600;width:100%;box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 35%,transparent)')}>Get started</button>
          <button type="button" onClick={() => { set({ returning: true, age18: false }); go('name'); }} style={s('height:48px;border:none;background:none;color:var(--accent-ink);font-size:17px;font-weight:600;width:100%')}>I already have an account</button>
        </div>
      </section>
    </main>
  );
}
