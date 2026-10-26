import { useRef } from 'react';
import { C, MOODS, TOD, ring, serif, shadow } from '../theme';
import { set, useStore } from '../state/store';
import { go, openBreathe, startCheckin, startJournal } from '../state/actions';
import { useTimeOfDay } from '../hooks';
import { Companion } from '../components/figures';
import { Svg, P } from '../components/icons';
import { HelpPill, PrimaryButton, Scroll, SectionLabel, flex } from '../components/ui';

function Tile({ title, desc, onClick, discBg, icon, dark }: { title: string; desc: string; onClick: () => void; discBg: string; icon: string; dark?: boolean }) {
  return (
    <button onClick={onClick} style={{ textAlign: 'left', border: 'none', borderRadius: 24, padding: 16, background: dark ? 'linear-gradient(145deg,#2B3A63,#5A5493)' : C.white, color: dark ? C.moonText : C.ink, ...flex('column', 6), minHeight: 128, boxShadow: dark ? '0 12px 28px rgba(42,46,69,.18)' : shadow.card }}>
      <span style={{ width: 44, height: 44, borderRadius: '50%', background: discBg, display: 'grid', placeItems: 'center' }}><Svg d={icon} stroke={dark ? C.moonText : C.ink} /></span>
      <span style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>{title}</span>
      <span style={{ fontSize: 13, color: dark ? C.lavenderDeep : C.muted, lineHeight: 1.4 }}>{desc}</span>
    </button>
  );
}

export function Today() {
  const tod = useTimeOfDay();
  const t = TOD[tod];
  const nick = useStore(s => s.nick);
  const compName = useStore(s => s.compName);
  const look = useStore(s => s.look);
  const inApp = useStore(s => s.inApp);
  const mood = useStore(s => s.mood);
  const plan = useStore(s => s.plan);
  const hide = useStore(s => s.priv.hide);
  const taps = useRef<number[]>([]);

  // Triple-tap the wordmark to hide the screen behind a breathing view (PRD §8.7.3 quick hide).
  const onLogo = () => {
    const n = Date.now();
    taps.current = taps.current.filter(x => n - x < 900).concat(n);
    if (taps.current.length >= 3 && hide) { taps.current = []; openBreathe(); }
  };

  const evening = tod === 'evening';
  const goCalm = () => go('calm', { calmTab: evening ? 'sleep' : 'meditate' });

  return (
    <main aria-label="Today" style={{ position: 'absolute', inset: 0, ...flex('column'), background: t.bg }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between', padding: 'var(--head-pad) 24px 0' }}>
        <button onClick={onLogo} aria-label="Saathi" style={{ background: 'none', border: 'none', padding: 0, fontFamily: serif, fontSize: 22 }}>Saathi</button>
        <HelpPill />
      </div>
      <Scroll pad="28px 24px var(--scroll-bottom)" gap={0}>
        <h1 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: 0 }}>{t.greet}{nick.trim() ? `, ${nick.trim()}` : ''}.</h1>
        <div style={{ fontSize: 17, color: C.muted, marginTop: 8 }}>{t.line}</div>

        {inApp && (
          <section aria-label="A quiet moment" style={{ marginTop: 20, borderRadius: 28, padding: '18px 20px', background: 'rgba(255,255,255,.7)', boxShadow: '0 10px 28px rgba(42,46,69,.06)', ...flex('column', 10), animation: 'sDrop 600ms cubic-bezier(.22,.61,.36,1)' }}>
            <span style={{ fontSize: 17, fontWeight: 600 }}>A quiet moment for you?</span>
            <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>Your evening check-in is here whenever you are. Two minutes, or skip it.</span>
            <div style={{ ...flex('row', 8), alignItems: 'center' }}>
              <button onClick={startCheckin} style={{ height: 48, padding: '0 20px', borderRadius: 24, border: 'none', background: C.teal, color: C.white, fontSize: 15, fontWeight: 600 }}>Check in</button>
              <button onClick={() => set({ inApp: false })} style={{ height: 48, padding: '0 12px', background: 'none', border: 'none', color: C.teal, fontSize: 15, fontWeight: 600 }}>Not now</button>
            </div>
          </section>
        )}

        <section aria-label={`${compName}`} style={{ marginTop: 20, borderRadius: 32, padding: 20, background: 'rgba(255,255,255,.62)', boxShadow: '0 12px 32px rgba(42,46,69,.06)', ...flex('column', 14) }}>
          <div style={{ ...flex('row', 16), alignItems: 'center' }}>
            <div style={{ flex: 'none', width: 96, height: 96, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: '50%' }}><Companion look={look} size={88} /></div>
            <div style={{ flex: 1, ...flex('column', 2) }}>
              <span style={{ fontFamily: serif, fontSize: 22 }}>{compName} is here</span>
              <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>Your AI companion. Voice, video or text.</span>
            </div>
          </div>
          <div style={flex('row', 8)}>
            <PrimaryButton onClick={() => go('talk')} style={{ flex: 1.4, boxShadow: shadow.primary }}>Talk</PrimaryButton>
            <button onClick={() => go('call', { callMode: 'sit', firstRun: false })} style={{ flex: 1, height: 56, borderRadius: 28, border: `1.5px solid ${C.teal}`, background: C.white, color: C.teal, fontSize: 15, fontWeight: 600 }}>Just sit</button>
          </div>
        </section>

        <SectionLabel style={{ marginTop: 24, marginBottom: 10 }}>Feel better now</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          <Tile dark title="Calm" desc="Meditate, sleep stories, sounds." onClick={goCalm} discBg="rgba(255,255,255,.16)" icon={P.moon} />
          <Tile title="Breathe" desc="A slow, one-minute reset." onClick={openBreathe} discBg={C.sky} icon={P.wave} />
          <Tile title="Journal" desc="Write or talk it out, privately." onClick={() => startJournal('write')} discBg={C.peach} icon={P.pen} />
          <Tile title="Go outside" desc="A short walk, or a meetup nearby." onClick={() => go('outside')} discBg={C.tealSoft} icon={P.pin} />
        </div>

        <SectionLabel style={{ marginTop: 24, marginBottom: 10 }}>Check in with yourself</SectionLabel>
        <section style={{ background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.cardSoft, ...flex('column', 14) }}>
          <div style={flex('column', 2)}><h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>How are you?</h2><span style={{ fontSize: 15, color: C.muted }}>One tap helps me notice how your weeks go.</span></div>
          <div role="group" aria-label="How are you?" style={{ ...flex('row'), justifyContent: 'space-between', padding: '0 2px' }}>
            {MOODS.map((m, i) => (
              <button key={m.label} aria-label={m.label} aria-pressed={mood === i} onClick={() => set({ mood: mood === i ? null : i })}
                style={{ width: 48, height: 48, border: 'none', background: m.color, borderRadius: m.radius, boxShadow: mood === i ? ring : '0 6px 16px rgba(42,46,69,.10)', transition: 'box-shadow 400ms' }} />
            ))}
          </div>
          <div role="status" style={{ fontSize: 15, color: C.muted, minHeight: 22 }}>{mood === null ? 'One tap, if you like. No need.' : `${MOODS[mood].label}. Thanks for telling me.`}</div>
        </section>

        <SectionLabel style={{ marginTop: 24, marginBottom: 10 }}>Your day</SectionLabel>
        <section style={{ background: C.white, borderRadius: 28, padding: '20px 20px 6px', boxShadow: shadow.cardSoft, ...flex('column') }}>
          <div style={{ ...flex('column', 2), marginBottom: 4 }}><h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>Today’s gentle plan</h2><span style={{ fontSize: 15, color: C.muted }}>Small steps. Skipping one is okay.</span></div>
          {plan.map((p, i) => (
            <button key={p.id} role="checkbox" aria-checked={p.done} onClick={() => set(st => ({ plan: st.plan.map(x => (x.id === p.id ? { ...x, done: !x.done } : x)) }))}
              style={{ ...flex('row', 14), alignItems: 'center', textAlign: 'left', border: 'none', background: 'none', padding: '14px 0', borderBottom: i < plan.length - 1 ? `1px solid ${C.rule}` : 'none' }}>
              <div style={{ flex: 'none', width: 28, height: 28, borderRadius: '50%', border: p.done ? `1.5px solid ${C.teal}` : '1.5px solid #C9C2B6', background: p.done ? C.teal : 'transparent', display: 'grid', placeItems: 'center', transition: 'all 500ms cubic-bezier(.22,.61,.36,1)' }}>
                <Svg d={P.check} size={14} stroke="#FFFFFF" sw={3} style={{ opacity: p.done ? 1 : 0 }} />
              </div>
              <div style={flex('column', 2)}>
                <span style={{ fontSize: 17, color: p.done ? C.muted : C.ink }}>{p.label}</span>
                {p.done && <span style={{ fontSize: 15, color: C.teal }}>That counts.</span>}
              </div>
            </button>
          ))}
        </section>

        <SectionLabel style={{ marginTop: 24, marginBottom: 10 }}>{evening ? 'For tonight' : 'Suggested for you'}</SectionLabel>
        <button onClick={goCalm} style={{ textAlign: 'left', border: 'none', borderRadius: 28, padding: 20, background: 'linear-gradient(135deg,#232C4B,#5A5493)', color: C.moonText, ...flex('row', 16), alignItems: 'center' }}>
          <div style={{ flex: 1, ...flex('column', 4) }}>
            <span style={{ fontSize: 13, color: C.moonSoft, fontWeight: 600 }}>{evening ? 'Calm · for tonight' : 'Calm · meditate'}</span>
            <span style={{ fontFamily: serif, fontSize: 22 }}>{evening ? 'Wind down for sleep' : 'A five-minute reset'}</span>
            <span style={{ fontSize: 15, color: C.lavenderDeep, lineHeight: 1.4 }}>{evening ? 'A sleep story, rain sounds or slow breathing.' : 'Guided meditations, sleep stories and sounds.'}</span>
          </div>
          <span style={{ flex: 'none', width: 48, height: 48, borderRadius: '50%', background: C.moonText, display: 'grid', placeItems: 'center' }}><Svg d={P.play} size={18} stroke="none" fill={C.night} /></span>
        </button>
      </Scroll>
    </main>
  );
}
