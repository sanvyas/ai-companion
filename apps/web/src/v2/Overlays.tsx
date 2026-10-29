import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useDialog } from '../components/useDialog';
import { findCalm, SLEEP_TIMERS } from '../data/calm';
import { EMERGENCY, TELE_MANAS } from '../data/helplines';
import { acknowledgeHelp, closeBreathe, closePlayer, confirmSafe, go, openBreathe, openPlayer, startCall, stepPlayer, toast, togglePlay } from '../state/actions';
import { set, useStore } from '../state/store';
import { Bird } from './Bird';
import { gardenMayHaveChanged } from './garden';
import { plantNow } from './garden-actions';
import { HelpPill } from './Chrome';
import { Ic } from './icons';
import { endTour, setV2, startTour, useV2 } from './ui';

const ease = (t: number) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------------------------------------- breathing
/** In for four, hold for two, out for six: three slow breaths. With reduced motion the circle holds still and the words do the work. */
export function BreatheOverlay() {
  const reduce = useStore(s => s.reduceMotion);
  const ref = useDialog<HTMLDivElement>(closeBreathe);
  const core = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const [word, setWord] = useState('Get ready');
  const [cycle, setCycle] = useState(0);
  const [done, setDone] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setDone(false); setCycle(0); setWord('Get ready');
    const t0 = performance.now();
    let raf = 0, last = '';
    const loop = (n: number) => {
      const s = (n - t0) / 1000, c = s % 12, cyc = Math.min(2, Math.floor(s / 12));
      let sc: number, ph: string;
      if (c < 4) { sc = 1 + .85 * ease(c / 4); ph = 'Breathe in'; } else if (c < 6) { sc = 1.85; ph = 'Hold'; } else { sc = 1.85 - .85 * ease((c - 6) / 6); ph = 'Out, slowly'; }
      if (!reduce && core.current && halo.current) { core.current.style.transform = `scale(${sc})`; halo.current.style.transform = `scale(${sc * 1.18})`; halo.current.style.opacity = String(.3 + .4 * (sc - 1)); }
      if (ph !== last) { last = ph; setWord(ph); }
      setCycle(cyc);
      if (s >= 36) { setDone(true); void api.breathed().then(() => gardenMayHaveChanged()).catch(() => undefined); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run, reduce]);

  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Breathe with me" className="screen dark" style={{ zIndex: 62, outline: 'none' }}>
      <div className="sc-head"><button className="backbtn" onClick={closeBreathe}><Ic n="back" />Back</button><div className="ttl">Breathe</div><HelpPill /></div>
      <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {!done ? (
          <>
            <div className="breathe" aria-hidden="true"><div className="halo" ref={halo} /><div className="core" ref={core} /><div className="word">{word}</div></div>
            <div className="sr-only" role="status" aria-live="polite">{word}</div>
            <div className="pdots" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} className={i <= cycle ? 'on' : ''} />)}</div>
            <p style={{ marginTop: 14, opacity: .85 }}>Breath {cycle + 1} of 3</p>
            <button className="btn glass" style={{ marginTop: 20 }} onClick={closeBreathe}>Stop here</button>
          </>
        ) : (
          <>
            <div className="breathe" aria-hidden="true"><div className="halo" style={{ opacity: .4 }} /><div className="core" /><div className="word">Well done</div></div>
            <h2 className="h1" style={{ color: '#fff' }}>That counts.</h2>
            <p style={{ opacity: .85, margin: '8px 0 22px', maxWidth: 280 }}>Three slow breaths. Your pond got a new lily.</p>
            <button className="btn" onClick={closeBreathe}>Done</button>
            <button className="btn glass" style={{ marginTop: 8 }} onClick={() => setRun(r => r + 1)}>Another round</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- crisis
/** Fixed words only, never anything written by the AI. No Escape, no back gesture: choose an action, or confirm you are safe. */
export function CrisisOverlay() {
  const confirm = useStore(s => s.crisisConfirm);
  const compName = useStore(s => s.compName);
  const trusted = useStore(s => s.trustedDial);
  const ref = useDialog<HTMLDivElement>();
  useEffect(() => {
    history.pushState({ crisis: true }, '');
    const hold = () => history.pushState({ crisis: true }, '');
    window.addEventListener('popstate', hold);
    return () => window.removeEventListener('popstate', hold);
  }, []);
  const call = (tel: string, kind: 'helpline' | 'contact' | 'emergency', title: string, sub: string, dark?: boolean) => (
    <a className="mode" style={dark ? { background: 'var(--ink)', color: 'var(--bg)' } : undefined} href={`tel:${tel}`} onClick={() => acknowledgeHelp(kind)}>
      <span className="grow1"><b style={{ display: 'block' }}>{title}</b><span className="small" style={{ opacity: .8 }}>{sub}</span></span><Ic n="phone" />
    </a>
  );
  return (
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label="Your safety matters most right now" className="screen" style={{ zIndex: 90, background: 'linear-gradient(180deg,#FFE8CC,#FFF4E4)', color: '#3A2400', outline: 'none', animation: 'fi .5s both' }}>
      <div className="sc-body" style={{ padding: '56px 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row" style={{ gap: 10 }}><Bird size={32} /><span className="small">{compName} is still listening</span></div>
        <h1 className="h1" style={{ fontSize: 30 }}>Your safety matters most right now.</h1>
        <p style={{ fontSize: 16.5, lineHeight: 1.55 }}>I’m an AI, so I can’t be there the way a person can. Let’s get you to someone who can.</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 6 }}>
          {call(TELE_MANAS.tel, 'helpline', 'Call a helpline', `Tele-MANAS ${TELE_MANAS.num}`, true)}
          {trusted && call(trusted.phone, 'contact', `Call ${trusted.name}`, 'Trusted contact')}
          {call(EMERGENCY.tel, 'emergency', 'Call emergency services', EMERGENCY.num)}
          <button className="mode" onClick={openBreathe}><span className="grow1"><b style={{ display: 'block' }}>Breathe with me</b><span className="small" style={{ opacity: .8 }}>One minute</span></span><Ic n="wave" /></button>
          <button className="mode" onClick={() => void startCall('voice')}><span className="grow1"><b style={{ display: 'block' }}>Stay with me</b><span className="small" style={{ opacity: .8 }}>Voice</span></span><Ic n="mic" /></button>
        </div>
        <p style={{ fontSize: 16, lineHeight: 1.55, marginTop: 6 }}>If you can, put anything that could be unsafe out of reach, and stay with someone.</p>
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          {!confirm ? (
            <button className="btn ghost block" style={{ color: '#3A2400' }} onClick={() => set({ crisisConfirm: true })}>I’m safe right now</button>
          ) : (
            <div role="group" aria-label="Confirm you are safe" className="card" style={{ display: 'grid', gap: 10 }}>
              <b>Are you safe right now?</b>
              <span className="muted small">If that changes, help is always one tap away.</span>
              <button className="btn block" onClick={confirmSafe}>Yes, I’m safe right now</button>
              <button className="btn ghost block" onClick={() => set({ crisisConfirm: false })}>Show me help again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- level up
export function LevelUpOverlay() {
  const name = useV2(s => s.levelUp);
  // A celebration waits for a quiet moment: never over a call, a walk, writing, a story, breathing, a sheet or the safety screen.
  const calm = useStore(s => !['call', 'chat', 'walk', 'jcompose'].includes(s.screen) && !s.breathe && !s.crisis && !s.player && !s.sheet && !s.paywall);
  const free = useV2(s => !s.sheet && s.tour === null);
  if (!name || !calm || !free) return null;
  return <LevelUpCard name={name} />;
}

function LevelUpCard({ name }: { name: string }) {
  const ref = useDialog<HTMLDivElement>(() => setV2({ levelUp: null }));
  const cs = ['#F9A3C0', '#FFD36B', '#8FCF7B', '#8FB8F0', '#fff'];
  return (
    <div ref={ref} tabIndex={-1} className="layer" role="dialog" aria-modal="true" aria-label={`Your garden grew: ${name}`} style={{ background: 'rgba(14,20,40,.62)', display: 'grid', placeItems: 'center', padding: 24, outline: 'none' }}>
      <div className="fall" aria-hidden="true">{Array.from({ length: 26 }, (_, i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, background: cs[i % 5], animationDelay: `-${((i * 53) % 40) / 10}s` }} />)}</div>
      <div className="card" style={{ textAlign: 'center', maxWidth: 310, padding: '30px 22px 22px', animation: 'growIn .8s var(--spring) both', position: 'relative' }}>
        <span className="ico" style={{ width: 64, height: 64, borderRadius: 22, background: 'var(--leafsoft)', margin: '0 auto' }}><Ic n="leaf" color="#2F7A49" size={32} /></span>
        <div className="eyebrow" style={{ marginTop: 12 }}>Your garden grew</div>
        <h2 className="h1" style={{ margin: '4px 0 8px' }}>{name}</h2>
        <p className="muted">Because you kept showing up, in your own way. Nothing here ever fades.</p>
        <button className="btn block" style={{ marginTop: 20 }} onClick={() => setV2({ levelUp: null })}>Keep going</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- first seed
function SeedArt({ planted }: { planted: boolean }) {
  const sparks = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = i / 8 * 6.28; return <circle key={i} cx="150" cy="130" r="4" fill="#FFD36B" style={{ ['--dx' as string]: `${(Math.cos(a) * 70).toFixed(0)}px`, ['--dy' as string]: `${(Math.sin(a) * 60 - 10).toFixed(0)}px` }} />; });
  return (
    <div className="seedstage">
      <svg viewBox="0 0 300 300" width="300" height="300" aria-hidden="true">
        <defs><radialGradient id="sg" cx=".5" cy=".4" r=".7"><stop offset="0" stopColor="#FFF2C9" /><stop offset="1" stopColor="#FFE0A8" /></radialGradient></defs>
        <circle cx="150" cy="150" r="130" fill="url(#sg)" opacity=".85" />
        <ellipse cx="150" cy="232" rx="96" ry="22" fill="#6B4631" opacity=".25" /><ellipse cx="150" cy="226" rx="90" ry="22" fill="#8A5A3A" /><ellipse cx="150" cy="220" rx="90" ry="22" fill="#A56F45" />
        {planted ? (
          <>
            <g className="grow" style={{ transformOrigin: '150px 220px' }}>
              <path d="M150 220C150 190 150 160 150 128" stroke="#4A9645" strokeWidth="7" strokeLinecap="round" fill="none" />
              <path d="M150 160C120 160 104 142 104 118C130 118 150 134 150 160Z" fill="#6CC067" /><path d="M150 144C178 144 196 128 196 104C170 104 150 120 150 144Z" fill="#8AD36B" />
              <circle cx="150" cy="122" r="9" fill="#F4A6B7" /><circle cx="150" cy="122" r="3.5" fill="#FFD36B" />
            </g>
            <g className="spark">{sparks}</g>
          </>
        ) : (
          <g style={{ animation: 'bob 2.6s ease-in-out infinite' }}><ellipse cx="150" cy="150" rx="15" ry="21" fill="#B07A45" /><ellipse cx="146" cy="143" rx="5" ry="8" fill="#D9A56C" opacity=".8" /></g>
        )}
      </svg>
    </div>
  );
}

/** The last step of sign-up: the first marigold really is planted in the garden. */
export function SeedScreen() {
  const [planted, setPlanted] = useState(false);
  const [busy, setBusy] = useState(false);
  const plant = async () => {
    setBusy(true);
    await plantNow('marigold', 0);
    setPlanted(true);
    setBusy(false);
  };
  return (
    <div className="onb" style={{ position: 'absolute' }}>
      <div className="top"><span style={{ width: 44 }} /><div className="dots" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} className="on" />)}</div><span className="fine" style={{ width: 60, textAlign: 'right' }}>6 of 6</span></div>
      <div className="body"><div className="page" style={{ textAlign: 'center' }}>
        <h1 className="h1" style={{ marginTop: 12 }}>{planted ? 'Your garden has begun' : 'Plant your first seed'}</h1>
        <p className="muted" style={{ margin: '6px auto 0', maxWidth: 290 }}>{planted ? 'Every time you check in, write, talk or breathe, it grows. It never wilts.' : 'Your garden grows with the small things you do. Let’s plant the first seed together.'}</p>
        <SeedArt planted={planted} />
      </div></div>
      <div className="foot2">
        {planted
          ? <button className="btn block" onClick={() => { setV2({ seed: false }); go('today'); setTimeout(startTour, 700); }}>Show me around</button>
          : <button className="btn block" disabled={busy} onClick={() => void plant()}><Ic n="leaf" />{busy ? 'Planting…' : 'Plant the seed'}</button>}
        {!planted && <button className="btn ghost block" onClick={() => { setV2({ seed: false }); go('today'); }}>Skip for now</button>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- tour
const TOUR = [
  { sel: '[data-tour="today"] li.next, [data-tour="today"]', t: 'Start here', d: 'Each day has three small steps. Begin with a check-in. It takes ten seconds.' },
  { sel: '[data-tour="hero"]', t: 'This is your garden', d: 'It grows when you check in, write, talk or breathe. Tap any labelled spot to go there.' },
  { sel: '[data-tour="tabbar"]', t: 'Five tabs, always here', d: 'Home, Journal, Talk (the big button), Calm and You. Everything in the app lives in one of these.' },
  { sel: '[data-tour="help"]', t: 'Help is one tap away', d: 'If things ever get hard, tap Help for helplines, your trusted person and your safety plan.' },
] as const;

export function Tour() {
  const step = useV2(s => s.tour);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; appH: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipTop, setTipTop] = useState(0);

  useLayoutEffect(() => {
    if (step === null) return;
    const st = TOUR[step];
    const app = document.querySelector<HTMLElement>('.v2 .app');
    const el = st.sel.split(',').map(q => document.querySelector<HTMLElement>(q.trim())).find(Boolean) ?? null; // tried in order: the step to do next, else the whole list
    if (!app || !el) { if (step + 1 < TOUR.length) setV2({ tour: step + 1 }); else endTour(); return; }
    if (!st.sel.includes('tabbar') && !st.sel.includes('help')) el.scrollIntoView({ block: st.sel.includes('hero') ? 'start' : 'center' });
    else document.querySelector('.v2 .pane.on')?.scrollTo({ top: 0 });
    const id = setTimeout(() => {
      const a = app.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 6;
      setBox({ x: r.left - a.left - pad, y: r.top - a.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, appH: a.height });
    }, step === 0 ? 450 : 600);
    return () => clearTimeout(id);
  }, [step]);

  useLayoutEffect(() => {
    if (!box || !tipRef.current) return;
    const th = tipRef.current.offsetHeight;
    setTipTop(box.y + box.h + 14 + th < box.appH - 8 ? box.y + box.h + 14 : Math.max(8, box.y - th - 14));
  }, [box, step]);

  if (step === null) return null;
  const st = TOUR[step];
  const last = step === TOUR.length - 1;
  return (
    <div className="coach" role="dialog" aria-label="Quick tour">
      <div className="blocker" />
      {box && <div className="hole" style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: st.sel.includes('tabbar') ? 0 : 26 }} />}
      <div className="tip" ref={tipRef} style={{ top: tipTop, opacity: box ? 1 : 0 }}>
        <div className="eyebrow" style={{ color: 'var(--brand-text)' }}>Quick tour · {step + 1} of {TOUR.length}</div>
        <h2 className="h2" style={{ marginTop: 4 }}>{st.t}</h2>
        <p className="muted" style={{ marginTop: 6 }}>{st.d}</p>
        <div className="row">
          <div className="dts" aria-hidden="true">{TOUR.map((_, i) => <i key={i} className={i === step ? 'on' : ''} />)}</div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" onClick={endTour}>Skip</button>
            <button className="btn sm" onClick={() => { if (last) endTour(); else { setBox(null); setV2({ tour: step + 1 }); } }}>{last ? 'Got it' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- calm player
/** Plays a meditation or sleep story. The reading is the whole experience: no background sounds. */
export function PlayerOverlay() {
  const id = useStore(s => s.player);
  const playing = useStore(s => s.pPlaying);
  const ended = useStore(s => s.pEnded);
  const line = useStore(s => s.pLineText);
  const idx = useStore(s => s.pLineIdx);
  const elapsed = useStore(s => s.pElapsed);
  const timer = useStore(s => s.pTimer);
  const narrator = useStore(s => s.pNarrator);
  const nick = useStore(s => s.nick);
  const comp = useStore(s => s.compName);
  const ref = useDialog<HTMLDivElement>(closePlayer);
  const it = findCalm(id);
  useEffect(() => { if (ended) gardenMayHaveChanged(); }, [ended]);
  if (!it?.lines) return null;
  const sleep = it.kind === 'sleep';
  const total = it.lines.length;
  const pct = Math.round(Math.min(1, (idx + (playing ? 0.5 : 0)) / total) * 100);
  const mm = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={it.title} className="screen dark" style={{ zIndex: 56, outline: 'none' }}>
      <div className="sc-head"><button className="backbtn" onClick={closePlayer}><Ic n="back" />Back</button><div className="ttl">{sleep ? 'Sleep story' : 'Meditation'}</div><HelpPill /></div>
      <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {!ended ? (
          <>
            <div className="glow" aria-hidden="true" />
            <div className="pline" aria-live="polite" key={idx} style={{ animationDuration: '5s' }}>{line || 'Settling in…'}</div>
            <div className="bar" role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ width: 240, background: 'rgba(255,255,255,.2)' }}><i style={{ width: `${pct}%` }} /></div>
            <p style={{ opacity: .75, marginTop: 8, fontVariantNumeric: 'tabular-nums' }}>{mm(elapsed)} · {it.title}</p>
            <p className="fine" style={{ marginTop: 2 }}>Part {Math.min(idx + 1, total)} of {total} · Narrated by {narrator || `${comp}, on your phone`}</p>
            <div className="row" style={{ gap: 10, marginTop: 22 }}>
              <button className="iconbtn" aria-label="Previous part" onClick={() => stepPlayer(-1)}><Ic n="back" /></button>
              <button className="btn sm" style={{ background: '#CFC7F2', color: '#2A2A5A', boxShadow: 'none', minWidth: 120 }} onClick={togglePlay}><Ic n={playing ? 'pause' : 'play'} />{playing ? 'Pause' : 'Resume'}</button>
              <button className="iconbtn" aria-label="Next part" onClick={() => stepPlayer(1)}><Ic n="chev" /></button>
            </div>
            {sleep && (
              <div style={{ marginTop: 22 }}>
                <div className="fine" style={{ marginBottom: 6 }}>Sleep timer</div>
                <div className="chips" style={{ justifyContent: 'center' }}>{SLEEP_TIMERS.map(t => <button key={t} className="chip" aria-pressed={timer === t} onClick={() => set({ pTimer: t })}>{t}</button>)}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="glow" aria-hidden="true" />
            <h2 className="h1" style={{ color: '#fff', marginTop: 28 }}>{sleep ? `Sleep well, ${nick || 'friend'}.` : 'Nicely done.'}</h2>
            <p style={{ opacity: .85, margin: '8px 0 22px', maxWidth: 280 }}>{sleep ? 'I’ll be here in the morning. The moon nook in your garden has lit up.' : 'A few quiet minutes counts. Your pond got a new lily.'}</p>
            <button className="btn" onClick={closePlayer}>Done</button>
            <button className="btn glass" style={{ marginTop: 8 }} onClick={() => openPlayer(it.id, { sounds: false })}>Play again</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- Plus
// TODO(billing): Play/App Store subscriptions via POST /billing/verify. Nothing is purchasable yet.
export function PaywallOverlay() {
  const compName = useStore(s => s.compName);
  const ref = useDialog<HTMLDivElement>(() => set({ paywall: false }));
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Saathi Plus" className="screen" style={{ zIndex: 50, outline: 'none' }}>
      <div className="sc-body" style={{ padding: '80px 22px 24px', display: 'flex', flexDirection: 'column' }}>
        <h1 className="h1" style={{ fontSize: 32 }}>Saathi Plus</h1>
        <p className="muted" style={{ fontSize: 16.5, marginTop: 14 }}>Unlimited voice and video, full memory you can edit, and calls from {compName} when you’d like them.</p>
        <div className="card" style={{ marginTop: 24 }}><b className="h2">₹499 a month</b><p className="muted small" style={{ marginTop: 6 }}>Free for 7 days. We’ll remind you two days before the trial ends. Cancel or pause in the app.</p></div>
        <p className="muted small" style={{ marginTop: 14 }}>Crisis support and helplines are always free.</p>
        <div style={{ marginTop: 'auto', display: 'grid', gap: 8, paddingTop: 20 }}>
          <button className="btn block" onClick={() => { set({ paywall: false }); toast('Plus isn’t available to start yet. We’ll tell you when it is.'); }}>Try Plus</button>
          <button className="btn line block" onClick={() => set({ paywall: false })}>Not now</button>
          <button className="link" onClick={() => toast('No previous purchases found.')}>Restore purchases</button>
        </div>
      </div>
    </div>
  );
}
