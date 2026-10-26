import { C, serif, shadow } from '../theme';
import { set, useStore } from '../state/store';
import { go, openSheet, toast } from '../state/actions';
import { EVENTS, HOBBIES, SMALL_STEPS } from '../data/outside';
import { Svg, P } from '../components/icons';
import { Heading, Scroll, TabHeader, TextButton, PrimaryButton, flex } from '../components/ui';
import { Disc } from '../components/figures';
import { useEffect } from 'react';

export function Outside() {
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
          <PrimaryButton onClick={() => set({ smallReply: 'Lovely. I’ll ask how it went, later.' })} style={{ marginTop: 6 }}>I’ll try it</PrimaryButton>
          <div style={{ ...flex('row'), justifyContent: 'space-between' }}>
            <TextButton onClick={() => set({ small: Math.min(small + 1, SMALL_STEPS.length - 1), smallReply: small >= SMALL_STEPS.length - 1 ? 'That’s as small as it gets. Even thinking about it counts.' : null })}>Something smaller</TextButton>
            <TextButton onClick={() => set({ smallReply: 'That’s okay. Today can just be today.' })}>Not today</TextButton>
          </div>
        </section>

        <button onClick={() => go('walk', { walkEnded: false })} style={{ margin: '12px 24px 0', ...flex('row', 16), alignItems: 'center', textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.card }}>
          <div style={{ flex: 'none', width: 52, height: 52, borderRadius: '50%', background: C.sky, display: 'grid', placeItems: 'center' }}><Svg d={P.walker} size={24} /></div>
          <div style={flex('column', 3)}><span style={{ fontSize: 17, fontWeight: 600 }}>Walk with me</span><span style={{ fontSize: 15, color: C.muted }}>I’ll keep you company, quietly. Audio only.</span></div>
        </button>

        <Heading title="Near you, soon" sub="Small, beginner-friendly meetups. Go alone, or with me in your ear." style={{ margin: '28px 24px 12px' }} />
        <div style={{ ...flex('column', 12), padding: '0 24px' }}>
          {EVENTS.map(e => (
            <button key={e.id} onClick={() => set({ sheet: 'event', eventId: e.id, eventStage: 'detail' })} style={{ textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: 0, overflow: 'hidden', boxShadow: shadow.card, ...flex('column') }}>
              {/* TODO(outside-service): partner event photo; placeholder keeps the layout honest. */}
              <div aria-hidden style={{ height: 112, background: 'repeating-linear-gradient(135deg,#F3ECE1 0 10px,#EDE4D6 10px 20px)', display: 'grid', placeItems: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>{e.img}</div>
              <div style={{ padding: '16px 20px 20px', ...flex('column', 6) }}>
                <span style={{ fontSize: 17, fontWeight: 600 }}>{e.title}</span>
                <span style={{ fontSize: 15, color: C.muted }}>{e.when} · {e.far} · {e.price}</span>
                <div style={{ ...flex('row', 6), flexWrap: 'wrap', marginTop: 2 }}>
                  {e.tags.map(tg => <span key={tg} style={{ fontSize: 13, padding: '4px 10px', borderRadius: 12, background: C.tealSoft, color: C.tealDark }}>{tg}</span>)}
                </div>
                <span style={{ fontSize: 15, lineHeight: 1.45, marginTop: 4, fontStyle: 'italic', fontFamily: serif }}>{e.why}</span>
              </div>
            </button>
          ))}
        </div>

        <Heading title="Hobbies to try" sub="Low-pressure things to start at home." style={{ margin: '28px 24px 12px' }} />
        <div style={{ ...flex('row', 12), overflowX: 'auto', padding: '0 24px 8px' }}>
          {HOBBIES.map(hb => (
            <div key={hb.title} style={{ flex: 'none', width: 200, borderRadius: 28, padding: 20, background: hb.bg, ...flex('column', 6) }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{hb.title}</span>
              <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{hb.desc}</span>
              <button onClick={() => { set(p => ({ plan: [...p.plan.filter(x => !x.done), { id: Date.now(), label: `${hb.title}, 10 minutes`, done: false }].slice(-3) })); toast(`Added “${hb.title}” for 10 minutes. No pressure.`); }}
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

  // A finished walk is a win (PRD §8.4). Record it exactly once.
  useEffect(() => {
    if (ended) set(p => ({ wins: [{ text: 'Went for a walk', when: 'Today' }, ...p.wins].slice(0, 6) }));
  }, [ended]);

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
            <div role="status" style={{ fontFamily: serif, fontSize: 22, textAlign: 'center', textWrap: 'pretty' }}>{WALK_LINES[Math.floor(tick / 8) % 4]}</div>
            {/* TODO(health): show steps once the native health adapter exists and the user has consented. */}
            <div style={{ fontSize: 15, color: C.muted }}>{mmss(tick)} walking · location stays on your phone</div>
          </div>
          <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)', ...flex('column', 8) }}>
            <PrimaryButton onClick={() => go('call', { callMode: 'voice', micOk: true })}>Talk</PrimaryButton>
            <TextButton onClick={() => set({ walkEnded: true })}>End walk</TextButton>
          </div>
        </>
      ) : (
        <>
          <div style={{ flex: 1, ...flex('column', 12), justifyContent: 'center', padding: '0 24px', animation: 'sIn 700ms' }}>
            <h2 style={{ fontFamily: serif, fontSize: 34, lineHeight: 1.15, fontWeight: 400, margin: 0 }}>You went out. That matters.</h2>
            <div style={{ fontSize: 17, color: C.muted }}>{mmss(tick)} outside. I’ll add it to your wins.</div>
          </div>
          <div style={{ padding: '0 24px calc(var(--sa-bottom) + 32px)' }}><PrimaryButton onClick={() => go('outside')} style={{ width: '100%' }}>Done</PrimaryButton></div>
        </>
      )}
    </main>
  );
}
