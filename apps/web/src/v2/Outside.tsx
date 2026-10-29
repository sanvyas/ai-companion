import { useEffect, useState } from 'react';
import { SMALL_STEPS, HOBBIES } from '../data/outside';
import { addPlanItem, endWalk, go, loadOutside, openSheet, setCity, startWalkFlow, talkOnWalk, toast } from '../state/actions';
import { set, useStore } from '../state/store';
import { Bird } from './Bird';
import { gardenMayHaveChanged } from './garden';
import { Ic } from './icons';
import { ScreenFrame } from './Chrome';
import { pop, getV2 } from './ui';

const whenOf = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const tagsOf = (d: Record<string, unknown>) => (Array.isArray(d.tags) ? (d.tags as string[]) : []);
const back = () => { if (getV2().stack.length) pop(); else go('today'); };

export function Outside() {
  const events = useStore(s => s.events);
  const city = useStore(s => s.eventsCity);
  const small = useStore(s => s.small);
  const reply = useStore(s => s.smallReply);
  const [cityDraft, setCityDraft] = useState('');
  useEffect(() => { void loadOutside(); }, []);
  return (
    <ScreenFrame title="Outside" onBack={back}>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Gentle ways to step out, only when you want to.</p>
      <div className="stg">
        <section aria-label="One small thing" className="card" style={{ background: 'linear-gradient(160deg,#FBE3CF,#F3ECE1)', color: '#3A2400', display: 'grid', gap: 10 }}>
          <span className="eyebrow">One small thing</span>
          <span className="h2" style={{ lineHeight: 1.25 }}>{SMALL_STEPS[small]}</span>
          {reply && <span role="status" style={{ fontWeight: 700, color: '#2F7A49' }}>{reply}</span>}
          <button className="btn block" onClick={() => { void addPlanItem(SMALL_STEPS[small]); set({ smallReply: 'Lovely. It’s on your plan for today.' }); }}>I’ll try it</button>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="link" onClick={() => set({ small: Math.min(small + 1, SMALL_STEPS.length - 1), smallReply: small >= SMALL_STEPS.length - 1 ? 'That’s as small as it gets. Even thinking about it counts.' : null })}>Something smaller</button>
            <button className="link" onClick={() => set({ smallReply: 'That’s okay. Today can just be today.' })}>Not today</button>
          </div>
        </section>
        <button className="mode" onClick={() => void startWalkFlow()}>
          <span className="ico" style={{ background: '#D9EEDD' }}><Ic n="pin" /></span>
          <span className="grow1"><b style={{ display: 'block' }}>Walk with me</b><span className="muted small">I’ll keep you company, quietly. Audio only.</span></span><Ic n="chev" />
        </button>
      </div>

      <div className="sec">
        <div className="sec-h"><h2 className="h2">Near you, soon</h2></div>
        <p className="muted small" style={{ margin: '-6px 0 12px' }}>Small, beginner-friendly meetups. Go alone, or with me in your ear.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {events.map(e => (
            <button key={e.id} className="card" style={{ textAlign: 'left', width: '100%' }} onClick={() => set({ sheet: 'event', eventId: e.id, eventStage: 'detail' })}>
              <b>{e.title}</b>
              <div className="muted small">{whenOf(e.startsAt)} · {e.venue} · {e.price}</div>
              {tagsOf(e.details).length > 0 && <div className="chips" style={{ marginTop: 6 }}>{tagsOf(e.details).map(tg => <span key={tg} className="pill leaf">{tg}</span>)}</div>}
              {typeof e.details.why === 'string' && <div className="small" style={{ marginTop: 6, fontStyle: 'italic' }}>{e.details.why}</div>}
            </button>
          ))}
          {events.length === 0 && (
            <form className="card" style={{ display: 'grid', gap: 10 }} onSubmit={ev => { ev.preventDefault(); if (cityDraft.trim()) void setCity(cityDraft.trim()); }}>
              <b>{city ? `Nothing listed in ${city} just yet.` : 'Which city are you in?'}</b>
              <span className="muted small">Only the city, never your exact location. I’ll show small meetups when there are some.</span>
              <input type="text" aria-label="City" value={cityDraft} onChange={e => setCityDraft(e.target.value)} placeholder="e.g. Bengaluru" autoComplete="address-level2" />
              <button type="submit" className="btn block" disabled={!cityDraft.trim()}>{city ? 'Change city' : 'Save city'}</button>
            </form>
          )}
        </div>
      </div>

      <div className="sec">
        <div className="sec-h"><h2 className="h2">Hobbies to try</h2></div>
        <p className="muted small" style={{ margin: '-6px 0 12px' }}>Low-pressure things to start at home.</p>
        <div className="hscroll">
          {HOBBIES.map(hb => (
            <div key={hb.title} className="card" style={{ flex: 'none', width: 200, background: hb.bg, color: '#1F2A44', display: 'grid', gap: 6, alignContent: 'start' }}>
              <b>{hb.title}</b><span className="small" style={{ opacity: .8 }}>{hb.desc}</span>
              <button className="btn sm soft" style={{ marginTop: 6, justifySelf: 'start', background: 'rgba(255,255,255,.8)' }} onClick={() => { void addPlanItem(`${hb.title}, 10 minutes`); toast(`Added “${hb.title}” for 10 minutes. No pressure.`); }}>Start small</button>
            </div>
          ))}
        </div>
      </div>
    </ScreenFrame>
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
    <div className="screen" role="main" aria-label="Walk with me" style={{ zIndex: 20, background: 'linear-gradient(180deg,#CFE3F0,#E6EFF1 45%,var(--bg) 85%)' }}>
      <div className="sc-head">
        <span className="pill" style={{ background: 'rgba(255,255,255,.7)' }}>Walk with me</span>
        <span style={{ flex: 1 }} />
        <button className="helpbtn" onClick={() => openSheet('support')}><Ic n="life" />Need help?</button>
      </div>
      {!ended ? (
        <>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, textAlign: 'center' }}>
            <div style={{ width: 150, height: 150 }}><Bird size={150} /></div>
            <div role="status" className="h2" style={{ lineHeight: 1.35, maxWidth: 300 }}>{line?.who === 'ai' ? line.text : WALK_LINES[Math.floor(tick / 8) % 4]}</div>
            {/* TODO(health): show steps once the native health adapter exists and the user has consented. */}
            <div className="muted small">{mmss(tick)} walking · I don’t track your location</div>
          </div>
          <div style={{ padding: '0 18px 26px', display: 'grid', gap: 8 }}>
            <button className="btn block" onClick={() => void talkOnWalk()}><Ic n="mic" />{listening ? 'Listening…' : 'Talk'}</button>
            <button className="btn ghost block" onClick={() => void endWalk().then(() => gardenMayHaveChanged())}>End walk</button>
          </div>
        </>
      ) : (
        <>
          <div className="sc-body" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
            <h2 className="h1" style={{ fontSize: 32 }}>You went out. That matters.</h2>
            <p className="muted">{mmss(secs)} outside. It’s in your wins, and your garden has a new stepping stone.</p>
          </div>
          <div style={{ padding: '0 18px 26px' }}><button className="btn block" onClick={() => { gardenMayHaveChanged(); go('today'); }}>Done</button></div>
        </>
      )}
    </div>
  );
}
