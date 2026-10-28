import { useEffect } from 'react';
import { C, serif } from '../theme';
import { set, useStore } from '../state/store';
import { acknowledgeHelp, closeBreathe, closePlayer, confirmSafe, openBreathe, openPlayer, setPlayerBg, startCall, stepPlayer, toast, togglePlay } from '../state/actions';
import { findCalm, PLAYER_BG_CHIPS, SLEEP_TIMERS } from '../data/calm';
import { EMERGENCY, TELE_MANAS } from '../data/helplines';
import { useDialog } from '../components/useDialog';
import { Disc, Orb, useReduceMotion } from '../components/figures';
import { P, Svg } from '../components/icons';
import { CallLink, HelpPill, PrimaryButton, TextButton, flex } from '../components/ui';

// ---- Paywall --------------------------------------------------------------------------------
// Calm copy, no countdowns, only on user action, never during distress (PRD §8.7.5).
// TODO(billing): Play/App Store subscriptions via POST /billing/verify. Nothing is purchasable yet.
export function Paywall() {
  const compName = useStore(s => s.compName);
  const ref = useDialog<HTMLDivElement>(() => set({ paywall: false }));
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Saathi Plus" style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'linear-gradient(180deg,#DCEBE6 0%,#FBF7F0 55%)', ...flex('column'), padding: 'calc(var(--sa-top) + 80px) 24px calc(var(--sa-bottom) + 32px)', animation: 'sIn 500ms', outline: 'none' }}>
      <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: 0 }}>Saathi Plus</h1>
      <div style={{ fontSize: 17, lineHeight: 1.6, color: C.muted, marginTop: 16, textWrap: 'pretty' }}>Unlimited voice and video, full memory you can edit, and calls from {compName} when you’d like them.</div>
      <div style={{ marginTop: 28, background: C.white, borderRadius: 28, padding: 20, ...flex('column', 6) }}>
        <span style={{ fontSize: 22, fontWeight: 600 }}>₹499 a month</span>
        <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>Free for 7 days. We’ll remind you two days before the trial ends. Cancel or pause in the app.</span>
      </div>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 16 }}>Crisis support and helplines are always free.</div>
      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button onClick={() => set({ paywall: false })} style={{ height: 56, borderRadius: 28, border: `1.5px solid ${C.teal}`, background: 'transparent', color: C.teal, fontSize: 17, fontWeight: 600 }}>Not now</button>
        <PrimaryButton onClick={() => { set({ paywall: false }); toast('Plus isn’t available to start yet. We’ll tell you when it is.'); }}>Try Plus</PrimaryButton>
      </div>
      <TextButton onClick={() => toast('No previous purchases found.')} style={{ fontSize: 15, marginTop: 8 }}>Restore purchases</TextButton>
    </div>
  );
}

// ---- Calm player ----------------------------------------------------------------------------
export function Player() {
  const id = useStore(s => s.player);
  const playing = useStore(s => s.pPlaying);
  const ended = useStore(s => s.pEnded);
  const line = useStore(s => s.pLineText);
  const idx = useStore(s => s.pLineIdx);
  const elapsed = useStore(s => s.pElapsed);
  const bg = useStore(s => s.pBg);
  const timer = useStore(s => s.pTimer);
  const sounds = useStore(s => s.sounds);
  const comp = useStore(s => s.compName);
  const narrator = useStore(s => s.pNarrator);
  const voice = useStore(s => s.voice);
  const nick = useStore(s => s.nick);
  const ref = useDialog<HTMLDivElement>(closePlayer);
  const it = findCalm(id);
  if (!it?.lines) return null;
  const sleep = it.kind === 'sleep';
  const total = it.lines.length;
  const pct = Math.round(Math.min(1, (idx + (playing ? 0.5 : 0)) / total) * 100);
  const mm = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const chip = (label: string, on: boolean, tap: () => void) => (
    <button key={label} aria-pressed={on} onClick={tap} style={{ flex: 'none', height: 40, padding: '0 16px', borderRadius: 20, border: 'none', background: on ? C.moonText : 'rgba(255,255,255,.12)', color: on ? C.nightDeep : C.moonText, fontSize: 15, fontWeight: 600 }}>{label}</button>
  );
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={it.title} className="on-dark" style={{ position: 'absolute', inset: 0, zIndex: 56, background: sleep ? 'linear-gradient(180deg,#232C4B 0%,#12182B 100%)' : 'linear-gradient(180deg,#2B4A52 0%,#142629 100%)', color: C.moonText, ...flex('column'), padding: 'calc(var(--sa-top) + 16px) 24px calc(var(--sa-bottom) + 24px)', animation: 'sUp 500ms cubic-bezier(.22,.61,.36,1)', outline: 'none' }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={closePlayer} aria-label="Close player" style={{ width: 44, height: 44, border: 'none', background: 'none', display: 'grid', placeItems: 'center', marginLeft: -10 }}><Svg d={P.down} size={24} stroke={C.moonText} /></button>
        <span style={{ fontSize: 13, color: C.moonSoft, fontWeight: 600 }}>{sleep ? (it.cat === 'Sleep story' ? 'Sleep story' : 'Sleep') : 'Meditation'}</span>
        <HelpPill dark small />
      </div>
      {!ended ? (
        <>
          <div style={{ flex: 1, minHeight: 0, ...flex('column', 20), alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 180, height: 180, display: 'grid', placeItems: 'center' }}>
              <Disc size={170} bg={sleep ? 'radial-gradient(circle at 40% 35%, #D9C2E4 0%, #7B74B8 55%, #5A5493 100%)' : 'radial-gradient(circle at 40% 35%, #E6F2EE 0%, #9FCFC3 50%, #3F7A70 100%)'} />
            </div>
            <div aria-live="polite" style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 20, lineHeight: 1.5, textAlign: 'center', minHeight: 60, textWrap: 'pretty', transition: 'opacity 600ms', opacity: playing || line ? 1 : 0.6 }}>{line || 'Settling in…'}</div>
          </div>
          <div style={flex('column', 4)}>
            <span style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.15 }}>{it.title}</span>
            <span style={{ fontSize: 15, color: C.moonMuted }}>{it.mins} min · Narrated by {narrator ? narrator : `${comp}, ${voice} voice`}</span>
          </div>
          <div role="progressbar" aria-label="Progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ marginTop: 16, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${pct}%`, background: C.moonText, borderRadius: 2, transition: 'width 800ms' }} /></div>
          <div style={{ ...flex('row'), justifyContent: 'space-between', fontSize: 13, color: C.moonMuted, marginTop: 8 }}><span>{mm(elapsed)}</span><span>Part {Math.min(idx + 1, total)} of {total}</span></div>
          <div style={{ ...flex('row', 36), justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
            <button onClick={() => stepPlayer(-1)} aria-label="Previous part" style={{ width: 56, height: 56, border: 'none', background: 'none', display: 'grid', placeItems: 'center' }}><Svg d={P.prev} size={26} stroke={C.moonText} /></button>
            <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} style={{ width: 76, height: 76, borderRadius: '50%', border: 'none', background: C.moonText, display: 'grid', placeItems: 'center' }}><Svg d={playing ? P.pauseSolid : P.play} size={28} stroke="none" fill={C.nightDeep} /></button>
            <button onClick={() => stepPlayer(1)} aria-label="Next part" style={{ width: 56, height: 56, border: 'none', background: 'none', display: 'grid', placeItems: 'center' }}><Svg d={P.next} size={26} stroke={C.moonText} /></button>
          </div>
          <div style={{ ...flex('column', 8), marginTop: 14 }}>
            <span style={{ fontSize: 13, color: C.moonMuted }}>Sound underneath</span>
            <div style={{ ...flex('row', 8), overflowX: 'auto', margin: '0 -24px', padding: '0 24px' }}>{PLAYER_BG_CHIPS.map(c => chip(c.label, bg === c.id, () => setPlayerBg(c.id)))}</div>
          </div>
          {sleep && (
            <div style={{ ...flex('column', 8), marginTop: 12 }}>
              <span style={{ fontSize: 13, color: C.moonMuted }}>Sleep timer</span>
              <div style={{ ...flex('row', 8), overflowX: 'auto', margin: '0 -24px', padding: '0 24px' }}>{SLEEP_TIMERS.map(t => chip(t, timer === t, () => set({ pTimer: t })))}</div>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ flex: 1, ...flex('column', 12), justifyContent: 'center', animation: 'sIn 800ms' }}>
            <h2 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: 0 }}>{sleep ? `Sleep well, ${nick}.` : 'Nicely done.'}</h2>
            <div style={{ fontSize: 17, color: C.moonSoft, lineHeight: 1.5 }}>{sleep ? (Object.keys(sounds).length ? 'The sounds will keep playing quietly until your timer ends.' : 'I’ll be here in the morning.') : 'A few quiet minutes counts. I’ve added it to your wins.'}</div>
          </div>
          <button onClick={closePlayer} style={{ height: 56, borderRadius: 28, border: 'none', background: C.moonText, color: C.nightDeep, fontSize: 17, fontWeight: 600 }}>Done</button>
          <button onClick={() => openPlayer(it.id)} style={{ height: 48, background: 'none', border: 'none', color: C.moonSoft, fontSize: 17, fontWeight: 600, marginTop: 4 }}>Play again</button>
        </>
      )}
    </div>
  );
}

// ---- Breathe --------------------------------------------------------------------------------
// In 4 · hold 2 · out 6 with a cycle counter (PRD §8.9). Under reduce motion the circle holds still and the word does the work.
export function Breathe() {
  const tick = useStore(s => s.tick);
  const reduce = useReduceMotion();
  const ref = useDialog<HTMLDivElement>(closeBreathe);
  const t = tick % 12;
  const word = t < 4 ? 'Breathe in' : t < 6 ? 'Hold' : 'Breathe out';
  const cycles = Math.floor(tick / 12);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Breathe with me" className="on-dark" style={{ position: 'absolute', inset: 0, zIndex: 65, background: 'linear-gradient(180deg,#232C4B 0%,#12182B 100%)', color: C.moonText, ...flex('column'), alignItems: 'center', padding: 'calc(var(--sa-top) + 72px) 24px calc(var(--sa-bottom) + 32px)', animation: 'sIn 600ms', outline: 'none' }}>
      <div style={{ fontSize: 15, color: C.moonMuted }}>Breathe with me</div>
      <div style={{ flex: 1, ...flex('column', 36), alignItems: 'center', justifyContent: 'center' }}>
        <div aria-hidden style={{ width: 240, height: 240, display: 'grid', placeItems: 'center' }}>
          <div style={{ width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #D9C2E4 0%, #7B74B8 55%, #5A5493 100%)', animation: reduce ? undefined : 'sBreath46 12s cubic-bezier(.45,0,.55,1) infinite' }} />
        </div>
        <div role="status" aria-live="polite" style={{ fontFamily: serif, fontSize: 34, textAlign: 'center' }}>{word}</div>
        <div style={{ fontSize: 15, color: C.moonMuted }}>{cycles === 0 ? 'Follow the circle, or just the words.' : `${cycles} breath${cycles === 1 ? '' : 's'} so far`}</div>
      </div>
      <button onClick={closeBreathe} style={{ width: '100%', height: 56, borderRadius: 28, border: 'none', background: C.moonText, color: '#1B2340', fontSize: 17, fontWeight: 600 }}>I’m done</button>
    </div>
  );
}

// ---- Crisis (level 3) -----------------------------------------------------------------------
// Fixed copy only, no AI text (PRD §8.10.3). No Escape, no back gesture: the user must pick an action
// or confirm "I'm safe right now" with one more tap.
export function Crisis() {
  const confirm = useStore(s => s.crisisConfirm);
  const compName = useStore(s => s.compName);
  const trusted = useStore(s => s.trustedDial);
  const ref = useDialog<HTMLDivElement>(); // focus + trap, no Escape handler

  useEffect(() => {
    history.pushState({ crisis: true }, '');
    const hold = () => history.pushState({ crisis: true }, '');
    window.addEventListener('popstate', hold);
    return () => window.removeEventListener('popstate', hold);
  }, []);

  const btn = (dark: boolean): React.CSSProperties => ({ minHeight: 64, borderRadius: 32, border: dark ? 'none' : `1.5px solid ${C.amberLine}`, background: dark ? C.ink : C.white, color: dark ? C.white : C.ink, fontSize: 17, fontWeight: 600, padding: '0 24px', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textDecoration: 'none' });
  const sub = { fontSize: 15, fontWeight: 500, opacity: 0.8 } as const;

  return (
    <div ref={ref} tabIndex={-1} role="alertdialog" aria-modal="true" aria-label="Your safety matters most right now" style={{ position: 'absolute', inset: 0, zIndex: 60, background: C.amber, ...flex('column', 12), padding: 'calc(var(--sa-top) + 56px) 24px calc(var(--sa-bottom) + 28px)', overflow: 'auto', animation: 'sIn 600ms', outline: 'none' }}>
      <div style={{ ...flex('row', 10), alignItems: 'center', fontSize: 15, color: C.amberText }}><Orb size={28} mode="listening" /> {compName} is still listening</div>
      <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: '12px 0 0' }}>Your safety matters most right now.</h1>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.amberText, textWrap: 'pretty' }}>I’m an AI, so I can’t be there the way a person can. Let’s get you to someone who can.</div>
      <div style={{ ...flex('column', 10), marginTop: 8 }}>
        <CallLink tel={TELE_MANAS.tel} onClick={() => acknowledgeHelp('helpline')} style={btn(true)}><span>Call a helpline</span><span style={sub}>Tele-MANAS {TELE_MANAS.num}</span></CallLink>
        {trusted && <CallLink tel={trusted.phone} onClick={() => acknowledgeHelp('contact')} style={btn(false)}><span>Call {trusted.name}</span><span style={sub}>Trusted contact</span></CallLink>}
        <CallLink tel={EMERGENCY.tel} onClick={() => acknowledgeHelp('emergency')} style={btn(false)}><span>Call emergency services</span><span style={sub}>{EMERGENCY.num}</span></CallLink>
        <button onClick={openBreathe} style={btn(false)}><span>Breathe with me</span><span style={sub}>One minute</span></button>
        <button onClick={() => void startCall('voice')} style={btn(false)}><span>Stay with me</span><span style={sub}>Voice</span></button>
      </div>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.amberText, marginTop: 8, textWrap: 'pretty' }}>If you can, put anything that could be unsafe out of reach, and stay with someone.</div>
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        {!confirm ? (
          <TextButton onClick={() => set({ crisisConfirm: true })} style={{ width: '100%', color: C.amberInk }}>I’m safe right now</TextButton>
        ) : (
          <div role="group" aria-label="Confirm you are safe" style={{ background: C.white, borderRadius: 24, padding: 18, ...flex('column', 10) }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Are you safe right now?</span>
            <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>If that changes, help is always one tap away.</span>
            <PrimaryButton onClick={confirmSafe}>Yes, I’m safe right now</PrimaryButton>
            <TextButton onClick={() => set({ crisisConfirm: false })} style={{ color: C.amberInk }}>Show me help again</TextButton>
          </div>
        )}
      </div>
    </div>
  );
}

