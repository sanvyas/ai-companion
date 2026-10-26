import { C, serif, shadow } from '../theme';
import { useEffect, useState } from 'react';
import { set, useStore } from '../state/store';
import { addPlanItem, endWalk, go, loadOutside, openSheet, setCity, startWalkFlow, talkOnWalk, toast } from '../state/actions';
import { HOBBIES, SMALL_STEPS } from '../data/outside';
import { Svg, P } from '../components/icons';
import { Heading, Scroll, TabHeader, TextButton, PrimaryButton, flex } from '../components/ui';
import { Disc } from '../components/figures';

const whenOf = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const tagsOf = (d: Record<string, unknown>) => (Array.isArray(d.tags) ? (d.tags as string[]) : []);

export function Outside() {
  const events = useStore(s => s.events);
  const city = useStore(s => s.eventsCity);
  const [cityDraft, setCityDraft] = useState('');
  useEffect(() => { void loadOutside(); }, []);
  const small = useStore(s => s.small);
  const reply = useStore(s => s.smallReply);
  return (
    <main aria-label="Outside" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <TabHeader title="Outside" />
      <Scroll pad="24px 0 var(--scroll-bottom)" gap={0}>
        <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45, margin: '-12px 24px 16px', textWrap: 'pretty' }}>Gentle ways to step out, only when you want to.</div>
        <section aria-label="One small thing" style={{ margin: '0 24px', borderRadius: 28, padding: 24, background: 'linear-gradient(160deg,#FBE3CF 0%,#F3ECE1 100%)', ...flex('column', 12) }}>
          <span style={{ fontSize: 15, color: C.muted }}>One small thing</span>
          <span style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.25, textWrap: 'pretty' }}>{SMALL_STEPS[small]}</span>
          {reply && <span role="status" style={{ fontSize: 17, color: C.teal }}>{reply}</span>}
          <PrimaryButton onClick={() => { void addPlanItem(SMALL_STEPS[small]); set({ smallReply: 'Lovely. It’s on your plan for today.' }); }} style={{ marginTop: 6 }}>I’ll try it</PrimaryButton>
          <div style={{ ...flex('row'), justifyContent: 'space-between' }}>
            <TextButton onClick={() => set({ small: Math.min(small + 1, SMALL_STEPS.length - 1), smallReply: small >= SMALL_STEPS.length - 1 ? 'That’s as small as it gets. Even thinking about it counts.' : null })}>Something smaller</TextButton>
            <TextButton onClick={() => set({ smallReply: 'That’s okay. Today can just be today.' })}>Not today</TextButton>
          </div>
        </section>

        <button onClick={() => void startWalkFlow()} style={{ margin: '12px 24px 0', ...flex('row', 16), alignItems: 'center', textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.card }}>
          <div style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', background: C.sky, display: 'grid', placeItems: 'center' }}><Svg d={P.walker} size={24} /></div>
          <div style={flex('column', 3)}><span style={{ fontSize: 17, fontWeight: 600 }}>Walk with me</span><span style={{ fontSize: 15, color: C.muted }}>I’ll keep you company, quietly. Audio only.</span></div>
        </button>

        <Heading title="Near you, soon" sub="Small, beginner-friendly meetups. Go alone, or with me in your ear." style={{ margin: '28px 24px 12px' }} />
        <div style={{ ...flex('column', 12), padding: '0 24px' }}>
          {events.map(e => (
            <button key={e.id} onClick={() => set({ sheet: 'event', eventId: e.id, eventStage: 'detail' })} style={{ textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: '18px 20px 20px', boxShadow: shadow.card, ...flex('column', 6) }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{e.title}</span>
              <span style={{ fontSize: 15, color: C.muted }}>{whenOf(e.startsAt)} · {e.venue} · {e.price}</span>
              <div style={{ ...flex('row', 6), flexWrap: 'wrap', marginTop: 2 }}>
                {tagsOf(e.details).map(tg => <span key={tg} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 12, background: C.tealSoft, color: C.tealDark }}>{tg}</span>)}
              </div>
              {typeof e.details.why === 'string' && <span style={{ fontSize: 15, lineHeight: 1.45, marginTop: 4, fontStyle: 'italic', fontFamily: serif }}>{e.details.why}</span>}
            </button>
          ))}
          {events.length === 0 && (
            <form onSubmit={ev => { ev.preventDefault(); if (cityDraft.trim()) void setCity(cityDraft.trim()); }} style={{ background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.card, ...flex('column', 10) }}>
              <span style={{ fontSize: 17, lineHeight: 1.45 }}>{city ? `Nothing listed in ${city} just yet.` : 'Which city are you in?'}</span>
              <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>Only the city, never your exact location. I’ll show small meetups when there are some.</span>
              <input aria-label="City" value={cityDraft} onChange={e => setCityDraft(e.target.value)} placeholder="e.g. Bengaluru" autoComplete="address-level2" style={{ height: 48, borderRadius: 24, border: 'none', background: C.sand, padding: '0 18px', fontSize: 17, outline: 'none' }} />
              <PrimaryButton type="submit">{city ? 'Change city' : 'Save city'}</PrimaryButton>
            </form>
          )}
        </div>

        <Heading title="Hobbies to try" sub="Low-pressure things to start at home." style={{ margin: '28px 24px 12px' }} />
        <div style={{ ...flex('row', 12), overflowX: 'auto', padding: '0 24px 8px' }}>
          {HOBBIES.map(hb => (
            <div key={hb.title} style={{ flex: 'none', width: 200, borderRadius: 28, padding: 20, background: hb.bg, ...flex('column', 6) }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{hb.title}</span>
              <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{hb.desc}</span>
              <button onClick={() => { void addPlanItem(`${hb.title}, 10 minutes`); toast(`Added “${hb.title}” for 10 minutes. No pressure.`); }}
                style={{ marginTop: 8, alignSelf: 'flex-start', height: 44, padding: '0 16px', borderRadius: 22, border: 'none', background: 'rgba(255,255,255,.8)', color: C.teal, fontSize: 15, fontWeight: 600 }}>Start small</button>
            </div>
          ))}
        </div>
      </Scroll>
    </main>
  );
}

const WALK_LINES = ['I’m here. Walk at whatever pace feels right.', 'Notice one sound around you.', 'You don’t have to go far.', 'Your shoulders can drop a little.'];
const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

export function Walk() {
  const tick = useStore(s => s.tick);
  const ended = useStore(s => s.walkEnded);
  const line = useStore(s => s.callLine);
  const secs = useStore(s => s.walkSeconds);
  const listening = useStore(s => s.callPhase === 'listening');

  return (
    <main aria-label="Walk with me" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'linear-gradient(180deg,#CFE3F0 0%,#E6EFF1 45%,#FBF7F0 85%)' }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between', padding: 'var(--head-pad) 24px 0' }}>
        <div style={{ fontSize: 15, color: C.muted }}>Walk with me</div>
        <button onClick={() => openSheet('support')} style={{ height: 44, padding: '0 16px', borderRadius: 22, background: C.amber, border: `1px solid ${C.amberLine}`, color: C.amberInk, fontSize: 15, fontWeight: 600 }}>Need help?</button>
      </div>
      {!ended ? (
        <>
          <div style={{ flex: 1, ...flex('column', 28), alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
            <div style={{ width: 220, height: 220, display: 'grid', placeItems: 'center' }}><Disc size={200} bg="radial-gradient(circle at 40% 35%, #FFFFFF 0%, #CFE3F0 50%, #9FCFC3 100%)" /></div>
            <div role="status" style={{ fontFamily: serif, fontSize: 22, textAlign: 'center', textWrap: 'pretty' }}>{line?.who === 'ai' ? line.text : WALK_LINES[Math.floor(tick / 8) % 4]}</div>
            {/* TODO(health): show steps once the native health adapter exists and the user has consented. */}
            <div style={{ fontSize: 15, color: C.muted }}>{mmss(tick)} walking · I don’t track your location</div>
          </div>
          <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 8) }}>
            <PrimaryButton onClick={() => void talkOnWalk()}>{listening ? 'Listening…' : 'Talk'}</PrimaryButton>
            <TextButton onClick={() => void endWalk()}>End walk</TextButton>
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, ...flex('column', 12), justifyContent: 'center', padding: '0 24px', animation: 'sIn 700ms' }}>
            <h2 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: 0 }}>You went out. That matters.</h2>
            <div style={{ fontSize: 17, color: C.muted }}>{mmss(secs)} outside. It’s in your wins.</div>
          </div>
          <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)' }}><PrimaryButton onClick={() => go('outside')} style={{ width: '100%' }}>Done</PrimaryButton></div>
        </>
      )}
    </main>
  );
}
