import { C, MOODS, serif, shadow } from '../theme';
import { clearPrefs, getState, initialState, resetState, set, useStore } from '../state/store';
import { closeSheet, go, openBreathe, openSheet, teardownAll, toast } from '../state/actions';
import { EVENTS } from '../data/outside';
import { HELPLINES, TELE_MANAS } from '../data/helplines';
import { SAFETY_PLAN, TRUSTED_CONTACT } from '../data/seed';
import { useDialog } from '../components/useDialog';
import { useReduceMotion } from '../components/figures';
import { Svg, P } from '../components/icons';
import { CallLink, PrimaryButton, Switch, TextButton, flex } from '../components/ui';

const Heading = ({ children }: { children: string }) => <h2 style={{ fontFamily: serif, fontSize: 28, fontWeight: 400, margin: 0, lineHeight: 1.2 }}>{children}</h2>;

export function Sheets() {
  const sheet = useStore(s => s.sheet);
  const reduce = useReduceMotion();
  const ref = useDialog<HTMLDivElement>(closeSheet);
  if (!sheet) return null;
  return (
    <>
      <div onClick={closeSheet} aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(18,24,43,.35)', zIndex: 58, animation: reduce ? undefined : 'sIn 400ms' }} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={sheet === 'support' ? 'Support' : 'Details'} data-scroll="1" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', overflow: 'auto', background: C.paper, borderRadius: '28px 28px 0 0', padding: '12px 24px calc(var(--sa-bottom) + 32px)', zIndex: 59, animation: reduce ? undefined : 'sUp 500ms cubic-bezier(.22,.61,.36,1)', ...flex('column', 12), outline: 'none' }}>
        <div aria-hidden style={{ width: 40, height: 5, borderRadius: 3, background: C.track, alignSelf: 'center', marginBottom: 8 }} />
        {sheet === 'support' && <Support />}
        {sheet === 'helplines' && <Helplines />}
        {sheet === 'plan' && <Plan />}
        {sheet === 'letter' && <Letter />}
        {sheet === 'jread' && <JournalRead />}
        {sheet === 'mic' && <Mic />}
        {sheet === 'delete' && <DeleteAll />}
        {sheet === 'event' && <EventSheet />}
      </div>
    </>
  );
}

function Support() {
  const rows = [
    { label: 'Talk to a person now', desc: 'Helplines for India, free', amber: true, tap: () => openSheet('helplines') },
    { label: 'My safety plan', desc: 'What helps, and who to call', tap: () => openSheet('plan') },
    { label: 'Breathe with me', desc: 'One minute, guided', tap: openBreathe },
  ];
  return (
    <>
      <Heading>You’re not alone in this.</Heading>
      <div style={{ fontSize: 15, color: C.muted, marginTop: -4 }}>Free, always. Works without internet.</div>
      {/* One tap to a human (PRD §8.10.1): the dialer opens straight away. */}
      <CallLink tel={TELE_MANAS.tel} style={{ minHeight: 64, borderRadius: 28, padding: '12px 20px', background: C.ink, color: C.white, justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Call Tele-MANAS</span><span style={{ fontSize: 17 }}>{TELE_MANAS.num}</span>
      </CallLink>
      {rows.map(r => (
        <button key={r.label} onClick={r.tap} style={{ ...flex('row', 16), alignItems: 'center', textAlign: 'left', minHeight: 80, borderRadius: 28, padding: '16px 20px', border: r.amber ? `1px solid ${C.amberLine}` : '1px solid transparent', background: r.amber ? C.amber : C.white }}>
          <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{r.label}</span><span style={{ fontSize: 15, color: C.muted }}>{r.desc}</span></div>
          <Svg d={P.chev} size={18} stroke={C.muted} />
        </button>
      ))}
    </>
  );
}

function Helplines() {
  return (
    <>
      <Heading>Talk to a person now</Heading>
      {HELPLINES.map(h => (
        <div key={h.id} style={{ ...flex('row', 12), alignItems: 'center', borderRadius: 28, padding: '16px 16px 16px 20px', background: C.white, boxShadow: shadow.lift }}>
          <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{h.name}</span><span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{h.desc}</span></div>
          <CallLink tel={h.tel} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600, flex: 'none' }}>Call {h.num}</CallLink>
        </div>
      ))}
      <div style={{ ...flex('row', 12), alignItems: 'center', borderRadius: 28, padding: '16px 16px 16px 20px', background: C.white, boxShadow: shadow.lift }}>
        <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{TRUSTED_CONTACT.name} (trusted contact)</span><span style={{ fontSize: 15, color: C.muted }}>Your {TRUSTED_CONTACT.relation}.</span></div>
        {TRUSTED_CONTACT.phone ? (
          <CallLink tel={TRUSTED_CONTACT.phone} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>Call {TRUSTED_CONTACT.name}</CallLink>
        ) : (
          // TODO(trusted-contact): store the number (encrypted) via PUT /me/trusted-contact.
          <button onClick={() => toast(`Add ${TRUSTED_CONTACT.name}’s number to call from here.`)} style={{ height: 48, padding: '0 18px', borderRadius: 24, border: 'none', background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>Call {TRUSTED_CONTACT.name}</button>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Numbers come from Saathi’s verified list for India and are checked before every update.</div>
    </>
  );
}

function Plan() {
  return (
    <>
      <Heading>My safety plan</Heading>
      {SAFETY_PLAN.map(sp => (
        <div key={sp.label} style={{ ...flex('column', 4), padding: '14px 0', borderBottom: `1px solid ${C.sandDark}` }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{sp.label}</span>
          <span style={{ fontSize: 17, lineHeight: 1.5 }}>{sp.text}</span>
        </div>
      ))}
      <PrimaryButton onClick={() => { go('chat', { msgs: [...getState().msgs, { who: 'ai', text: 'Let’s look at your safety plan together. What would you like to change?' }] }); }} style={{ marginTop: 8 }}>Edit together</PrimaryButton>
    </>
  );
}

function Letter() {
  const nick = useStore(s => s.nick);
  const comp = useStore(s => s.compName);
  return (
    <>
      <div style={{ fontSize: 15, color: C.muted }}>Sunday letter · 19 Oct</div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.6, ...flex('column', 14), textWrap: 'pretty' }}>
        <span>Dear {nick},</span>
        <span>This week you stepped out three times, even on Wednesday when sleep was short. You called Priya, and afterwards you said you’d laughed properly for the first time in a while.</span>
        <span>Evenings seem gentler when the phone goes down before midnight. Just something I noticed.</span>
        <span>One invitation for the week ahead, if you’d like it: the Sunday walk at Cubbon Park. Thirty minutes, or less.</span>
        <span>— {comp}</span>
      </div>
    </>
  );
}

function JournalRead() {
  const id = useStore(s => s.jReadId);
  const entries = useStore(s => s.jEntries);
  const comp = useStore(s => s.compName);
  const e = entries.find(x => x.id === id);
  if (!e) return null;
  const m = MOODS[e.mood];
  return (
    <>
      <div style={{ ...flex('row', 10), alignItems: 'center' }}><span aria-label={m.label} style={{ width: 14, height: 14, borderRadius: m.radius, background: m.color }} /><span style={{ fontSize: 15, color: C.muted }}>{e.date} · {e.mode === 'spoken' ? 'Spoken' : 'Written'}</span></div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.6, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{e.text}</div>
      <button role="switch" aria-checked={e.shared} onClick={() => set(p => ({ jEntries: p.jEntries.map(x => (x.id === e.id ? { ...x, shared: !x.shared } : x)) }))} style={{ ...flex('row', 14), alignItems: 'center', background: C.white, borderRadius: 24, padding: '14px 16px', border: 'none', textAlign: 'left', marginTop: 8 }}>
        <span style={{ flex: 1, ...flex('column', 2) }}><span style={{ fontSize: 15, fontWeight: 600 }}>{comp} can learn from this</span><span style={{ fontSize: 13, color: C.muted }}>Off keeps it just for you.</span></span>
        <Switch on={e.shared} />
      </button>
      <TextButton onClick={() => { set(p => ({ jEntries: p.jEntries.filter(x => x.id !== e.id), sheet: null })); toast('Entry deleted, for good.'); }} style={{ color: C.muted }}>Delete this entry</TextButton>
    </>
  );
}

function Mic() {
  const pendingMode = useStore(s => s.pendingMode);
  const pendingFirst = useStore(s => s.pendingFirst);
  return (
    <>
      <Heading>May I use your microphone?</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>So I can hear you. It’s only on while we’re talking, and recordings aren’t kept.</div>
      {/* TODO(webrtc): call getUserMedia here and fall back to text on denial (PRD §8.3.1, §10). */}
      <PrimaryButton onClick={() => go('call', { micOk: true, callMode: pendingMode ?? 'voice', firstRun: pendingFirst })} style={{ marginTop: 8 }}>Allow microphone</PrimaryButton>
      <TextButton onClick={() => go('chat')}>Type instead</TextButton>
    </>
  );
}

function DeleteAll() {
  const n = useStore(s => s.memories.length);
  const wipe = () => {
    // No backend yet: this clears everything held on this device. TODO(account): DELETE /me (30-day hard delete).
    teardownAll();
    clearPrefs();
    resetState(initialState(false));
    toast('Cleared from this device. Take care of yourself.');
  };
  return (
    <>
      <Heading>This removes everything, for good. Take your time.</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.6, color: C.muted }}>Your conversations, check-ins, {n} memories, your safety plan and your account. It’s gone from our servers within 30 days. Backups clear on schedule.</div>
      <TextButton onClick={() => toast('Your file will be ready within 24 hours. We’ll let you know.')} style={{ textAlign: 'left', padding: 0 }}>Export a copy first</TextButton>
      <PrimaryButton onClick={wipe} style={{ background: C.ink }}>Delete my account and data</PrimaryButton>
      <TextButton onClick={closeSheet}>Keep everything</TextButton>
    </>
  );
}

function EventSheet() {
  const id = useStore(s => s.eventId);
  const stage = useStore(s => s.eventStage);
  const e = EVENTS.find(x => x.id === id) ?? EVENTS[0];
  const field = (k: string, v: string) => <div style={flex('column', 4)}><span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{k}</span><span style={{ fontSize: 17, lineHeight: 1.5 }}>{v}</span></div>;
  const share = () => toast('Share link copied. Send it to someone you’d like there.');
  if (stage === 'detail') return (
    <>
      <div aria-hidden style={{ height: 150, borderRadius: 24, background: 'repeating-linear-gradient(135deg,#F3ECE1 0 10px,#EDE4D6 10px 20px)', display: 'grid', placeItems: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.muted }}>{e.img}</div>
      <Heading>{e.title}</Heading>
      <div style={{ fontSize: 15, color: C.muted }}>{e.when} · {e.where} · {e.far} · {e.price}</div>
      {field('What it’s like', e.like)}{field('How long', e.stay)}{field('Getting there', e.how)}
      <PrimaryButton onClick={() => set({ eventStage: 'confirm' })} style={{ marginTop: 8 }}>I’ll try this</PrimaryButton>
      <div style={{ ...flex('row'), justifyContent: 'space-between' }}>
        <TextButton onClick={share}>Bring a friend</TextButton>
        <TextButton onClick={() => { toast('Thank you. We’ve paused this event while we look into it.'); set({ sheet: null }); }} style={{ color: C.muted, fontSize: 15 }}>Report a concern</TextButton>
      </div>
    </>
  );
  if (stage === 'confirm') return (
    <>
      <Heading>Let me read it back.</Heading>
      <div style={{ fontSize: 22, lineHeight: 1.45, fontFamily: serif, textWrap: 'pretty' }}>{e.readback}</div>
      <div style={{ borderRadius: 24, background: C.white, padding: '16px 20px', ...flex('row'), justifyContent: 'space-between', fontSize: 17 }}><span>Price</span><span style={{ fontWeight: 600 }}>{e.price}</span></div>
      <div style={{ fontSize: 15, color: C.muted }}>You can cancel the RSVP any time from Today.</div>
      {/* TODO(outside-service): POST /outside/events/{id}/interest + "time to leave" reminder. */}
      <PrimaryButton onClick={() => { set(p => ({ eventStage: 'done', plan: [...p.plan, { id: Date.now(), label: e.title, done: false }].slice(-3) })); }} style={{ marginTop: 4 }}>Confirm RSVP</PrimaryButton>
      <TextButton onClick={() => set({ eventStage: 'detail' })}>Not yet</TextButton>
    </>
  );
  return (
    <>
      <Heading>It’s on your Today.</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>I’ll remind you two hours before. Is there someone you could bring?</div>
      <PrimaryButton onClick={share} style={{ marginTop: 8 }}>Invite someone</PrimaryButton>
      <TextButton onClick={closeSheet}>Maybe solo</TextButton>
    </>
  );
}
