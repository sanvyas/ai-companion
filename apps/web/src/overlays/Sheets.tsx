import { C, MOODS, serif, shadow } from '../theme';
import { useEffect, useState } from 'react';
import { dayOf, set, useStore } from '../state/store';
import { acknowledgeHelp, allowMic, closeSheet, confirmEvent, deleteEntry, deleteEverything, exportMyData, loadYou, openBreathe, openChat, openSheet, removeTrusted, saveSafetyPlan, saveTrusted, setEntryShared, toast } from '../state/actions';
import { TELE_MANAS } from '../data/helplines';
import type { SafetyPlan as SafetyPlanT } from '../api';
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
        {sheet === 'trusted' && <TrustedSheet />}
        {sheet === 'planedit' && <PlanEdit />}
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
      {/* One tap to a human (PRD 8.10.1): the dialer opens straight away. */}
      <CallLink tel={TELE_MANAS.tel} onClick={() => acknowledgeHelp('helpline')} style={{ minHeight: 64, borderRadius: 28, padding: '12px 20px', background: C.ink, color: C.white, justifyContent: 'space-between', gap: 12 }}>
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
  const helplines = useStore(s => s.helplines);
  const trusted = useStore(s => s.trustedDial);
  return (
    <>
      <Heading>Talk to a person now</Heading>
      {helplines.map(h => (
        <div key={h.id} style={{ ...flex('row', 12), alignItems: 'center', borderRadius: 28, padding: '16px 16px 16px 20px', background: C.white, boxShadow: shadow.lift }}>
          <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{h.name}</span><span style={{ fontSize: 15, color: C.muted, lineHeight: 1.4 }}>{h.description}</span>{h.hours && <span style={{ fontSize: 13, color: C.muted }}>{h.hours}</span>}</div>
          <CallLink tel={h.tel} onClick={() => acknowledgeHelp(h.kind === 'emergency' ? 'emergency' : 'helpline')} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600, flex: 'none' }}>Call {h.number}</CallLink>
        </div>
      ))}
      <div style={{ ...flex('row', 12), alignItems: 'center', borderRadius: 28, padding: '16px 16px 16px 20px', background: C.white, boxShadow: shadow.lift }}>
        {trusted ? (
          <>
            <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>{trusted.name}</span><span style={{ fontSize: 15, color: C.muted }}>Your trusted contact.</span></div>
            <CallLink tel={trusted.phone} onClick={() => acknowledgeHelp('contact')} style={{ height: 48, padding: '0 18px', borderRadius: 24, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600, flex: 'none' }}>Call {trusted.name}</CallLink>
          </>
        ) : (
          <>
            <div style={{ flex: 1, ...flex('column', 3) }}><span style={{ fontSize: 17, fontWeight: 600 }}>Someone you trust</span><span style={{ fontSize: 15, color: C.muted }}>Add a person you could call.</span></div>
            <button onClick={() => openSheet('trusted')} style={{ height: 48, padding: '0 18px', borderRadius: 24, border: `1.5px solid ${C.teal}`, background: C.white, color: C.teal, fontSize: 15, fontWeight: 600, flex: 'none' }}>Add</button>
          </>
        )}
      </div>
      {helplines.some(h => h.stale) && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>Some numbers haven’t been re-checked recently. If one doesn’t connect, try another.</div>}
    </>
  );
}

const EMPTY_PLAN: SafetyPlanT = { warningSigns: [], copingSteps: [], people: [], places: [], professionals: [], makingSpaceSafer: [] };
const PLAN_SECTIONS: { key: Exclude<keyof SafetyPlanT, 'people'>; label: string; hint: string }[] = [
  { key: 'warningSigns', label: 'Signs things are getting harder', hint: 'e.g. not sleeping, pulling away from people' },
  { key: 'copingSteps', label: 'Things that help me', hint: 'e.g. a walk, music, cold water' },
  { key: 'places', label: 'Places I can go', hint: 'e.g. the park, a friend’s house' },
  { key: 'professionals', label: 'Professionals', hint: 'e.g. Dr. Rao, 080 …' },
  { key: 'makingSpaceSafer', label: 'Making my space safer', hint: 'e.g. ask someone to keep my tablets' },
];

function Plan() {
  const plan = useStore(s => s.safetyPlan);
  useEffect(() => { void loadYou(); }, []);
  const empty = !plan || (!plan.warningSigns.length && !plan.copingSteps.length && !plan.people.length && !plan.places.length && !plan.professionals.length && !(plan.makingSpaceSafer ?? []).length);
  return (
    <>
      <Heading>My safety plan</Heading>
      {empty ? (
        <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>You haven’t written one yet. It’s a few lines for a hard moment: what helps, who to call. It stays private, and it opens without internet once you’ve seen it.</div>
      ) : (
        <>
          {PLAN_SECTIONS.map(sec => (plan?.[sec.key] ?? []).length > 0 && (
            <div key={sec.key} style={{ ...flex('column', 4), padding: '14px 0', borderBottom: `1px solid ${C.sandDark}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{sec.label}</span>
              {(plan?.[sec.key] ?? []).map(t => <span key={t} style={{ fontSize: 17, lineHeight: 1.5 }}>{t}</span>)}
            </div>
          ))}
          {(plan?.people ?? []).length > 0 && (
            <div style={{ ...flex('column', 6), padding: '14px 0', borderBottom: `1px solid ${C.sandDark}` }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>People I can reach</span>
              {plan?.people.map(pp => (
                <div key={pp.name} style={{ ...flex('row', 12), alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 17 }}>{pp.name}</span>
                  {pp.phone && <CallLink tel={pp.phone} onClick={() => acknowledgeHelp('contact')} style={{ height: 40, padding: '0 14px', borderRadius: 20, background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>Call</CallLink>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <PrimaryButton onClick={() => openSheet('planedit')} style={{ marginTop: 8 }}>{empty ? 'Write mine' : 'Edit'}</PrimaryButton>
    </>
  );
}

const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10);

function PlanEdit() {
  const cur = useStore(s => s.safetyPlan) ?? EMPTY_PLAN;
  const [txt, setTxt] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(PLAN_SECTIONS.map(sec => [sec.key, (cur[sec.key] ?? []).join('\n')])),
    people: cur.people.map(p => (p.phone ? `${p.name}, ${p.phone}` : p.name)).join('\n'),
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const people = lines(txt.people).map(l => { const [name, ...rest] = l.split(','); const phone = rest.join(',').trim(); return phone ? { name: name.trim().slice(0, 60), phone: phone.slice(0, 20) } : { name: name.trim().slice(0, 60) }; });
    const next: SafetyPlanT = { ...EMPTY_PLAN, ...Object.fromEntries(PLAN_SECTIONS.map(sec => [sec.key, lines(txt[sec.key]).map(x => x.slice(0, 200))])), people };
    await saveSafetyPlan(next);
    setBusy(false);
    openSheet('plan');
  };
  const area = (key: string, label: string, hint: string) => (
    <label key={key} style={flex('column', 6)}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <textarea value={txt[key]} onChange={e => setTxt(t => ({ ...t, [key]: e.target.value }))} placeholder={hint} rows={3} style={{ width: '100%', resize: 'vertical', border: 'none', borderRadius: 20, background: C.white, padding: '12px 16px', fontSize: 17, lineHeight: 1.5, outline: 'none', fontFamily: 'inherit' }} />
    </label>
  );
  return (
    <>
      <Heading>My safety plan</Heading>
      <div style={{ fontSize: 15, color: C.muted, marginTop: -4 }}>One item per line. Only you can see this.</div>
      {PLAN_SECTIONS.slice(0, 2).map(sec => area(sec.key, sec.label, sec.hint))}
      {area('people', 'People I can reach', 'Priya, 98xxxxxx12')}
      {PLAN_SECTIONS.slice(2).map(sec => area(sec.key, sec.label, sec.hint))}
      <PrimaryButton onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</PrimaryButton>
      <TextButton onClick={() => openSheet('plan')}>Cancel</TextButton>
    </>
  );
}

function TrustedSheet() {
  const me = useStore(s => s.me);
  const cur = me?.trustedContact;
  const [name, setName] = useState(cur?.name ?? '');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState(cur?.relation ?? '');
  const ok = name.trim() && phone.replace(/\D/g, '').length >= 8;
  const input = (label: string, v: string, on: (x: string) => void, extra: { type?: string; ph?: string; auto?: string } = {}) => (
    <label style={flex('column', 6)}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <input value={v} onChange={e => on(e.target.value)} type={extra.type ?? 'text'} placeholder={extra.ph} autoComplete={extra.auto ?? 'off'} style={{ height: 52, borderRadius: 26, border: 'none', background: C.white, padding: '0 18px', fontSize: 17, outline: 'none' }} />
    </label>
  );
  return (
    <>
      <Heading>Someone you trust</Heading>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C.muted }}>A person I can suggest you reach out to on a hard day. I never contact them myself, and their number is stored encrypted.</div>
      {input('Name', name, setName, { auto: 'off' })}
      {input('Phone number', phone, setPhone, { type: 'tel', ph: cur ? `${cur.phoneMasked} (enter again to change)` : '10-digit mobile number', auto: 'off' })}
      {input('Who are they to you? (optional)', relation, setRelation, { ph: 'e.g. sister, friend' })}
      <PrimaryButton onClick={() => { void saveTrusted({ name: name.trim(), phone: phone.trim(), relation: relation.trim() }).then(closeSheet); }} disabled={!ok} style={ok ? undefined : { opacity: 0.5 }}>Save</PrimaryButton>
      {cur && <TextButton onClick={() => { void removeTrusted().then(closeSheet); }} style={{ color: C.muted }}>Remove {cur.name}</TextButton>}
    </>
  );
}

function Letter() {
  const letter = useStore(s => s.letter);
  if (!letter) return <Heading>No letter yet.</Heading>;
  return (
    <>
      <div style={{ fontSize: 15, color: C.muted }}>Sunday letter · {dayOf(letter.createdAt)}</div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.6, ...flex('column', 14), textWrap: 'pretty' }}>
        {letter.body.split(/\n{2,}/).map((para, i) => <span key={i}>{para}</span>)}
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
      <div style={{ ...flex('row', 10), alignItems: 'center' }}><span aria-label={m.label} style={{ width: 14, height: 14, borderRadius: m.radius, background: m.color }} /><span style={{ fontSize: 15, color: C.muted }}>{dayOf(e.createdAt)} · {e.mode === 'spoken' ? 'Spoken' : 'Written'}</span></div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.6, whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{e.text}</div>
      <button role="switch" aria-checked={e.shared} onClick={() => void setEntryShared(e.id, !e.shared)} style={{ ...flex('row', 14), alignItems: 'center', background: C.white, borderRadius: 24, padding: '14px 16px', border: 'none', textAlign: 'left', marginTop: 8 }}>
        <span style={{ flex: 1, ...flex('column', 2) }}><span style={{ fontSize: 15, fontWeight: 600 }}>{comp} can learn from this</span><span style={{ fontSize: 13, color: C.muted }}>Off keeps it just for you.</span></span>
        <Switch on={e.shared} />
      </button>
      <TextButton onClick={() => void deleteEntry(e.id)} style={{ color: C.muted }}>Delete this entry</TextButton>
    </>
  );
}

function Mic() {
  return (
    <>
      <Heading>May I use your microphone?</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>So I can hear you. It’s only on while we’re talking, and recordings aren’t kept.</div>
      <PrimaryButton onClick={() => void allowMic()} style={{ marginTop: 8 }}>Allow microphone</PrimaryButton>
      <TextButton onClick={() => { closeSheet(); void openChat(); }}>Type instead</TextButton>
    </>
  );
}

function DeleteAll() {
  const n = useStore(s => s.memories.length);
  const [sure, setSure] = useState(false);
  return (
    <>
      <Heading>This removes everything, for good. Take your time.</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.6, color: C.muted }}>Your conversations, check-ins, {n} memories, your safety plan and your account. You have 30 days to change your mind by signing in again. After that it’s gone from our servers, and backups clear on schedule.</div>
      <TextButton onClick={() => void exportMyData()} style={{ textAlign: 'left', padding: 0 }}>Download a copy first</TextButton>
      {sure
        ? <PrimaryButton onClick={() => { closeSheet(); void deleteEverything(); }} style={{ background: C.ink }}>Yes, delete my account and data</PrimaryButton>
        : <PrimaryButton onClick={() => setSure(true)} style={{ background: C.ink }}>Delete my account and data</PrimaryButton>}
      <TextButton onClick={closeSheet}>Keep everything</TextButton>
    </>
  );
}

function EventSheet() {
  const id = useStore(s => s.eventId);
  const stage = useStore(s => s.eventStage);
  const events = useStore(s => s.events);
  const e = events.find(x => x.id === id);
  if (!e) return null;
  const d = e.details as Record<string, string | undefined>;
  const when = new Date(e.startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
  const field = (k: string, v?: string) => v ? <div style={flex('column', 4)}><span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{k}</span><span style={{ fontSize: 17, lineHeight: 1.5 }}>{v}</span></div> : null;
  const share = async () => {
    const text = `${e.title}, ${when}, ${e.venue}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Copied. Send it to someone you’d like there.'); }
    } catch { /* cancelled */ }
  };
  if (stage === 'detail') return (
    <>
      <Heading>{e.title}</Heading>
      <div style={{ fontSize: 15, color: C.muted }}>{when} · {e.venue} · {e.price}{e.groupSize ? ` · ${e.groupSize}` : ''}</div>
      {field('What it’s like', d.like)}{field('How long', d.stay)}{field('Getting there', d.how)}
      {e.organiser && <div style={{ fontSize: 13, color: C.muted }}>Listed by {e.organiser}</div>}
      <PrimaryButton onClick={() => set({ eventStage: 'confirm' })} style={{ marginTop: 8 }}>I’ll try this</PrimaryButton>
      <div style={{ ...flex('row'), justifyContent: 'space-between' }}>
        <TextButton onClick={() => void share()}>Bring a friend</TextButton>
      </div>
    </>
  );
  if (stage === 'confirm') return (
    <>
      <Heading>Let me read it back.</Heading>
      <div style={{ fontSize: 22, lineHeight: 1.45, fontFamily: serif, textWrap: 'pretty' }}>{e.title}, {when}, at {e.venue}. {e.price === 'Free' ? 'It’s free.' : `It costs ${e.price}.`}</div>
      <div style={{ fontSize: 15, color: C.muted }}>Nothing is booked or paid here. I’ll remind you before it starts.</div>
      <PrimaryButton onClick={() => void confirmEvent(e.id)} style={{ marginTop: 4 }}>I’m interested</PrimaryButton>
      <TextButton onClick={() => set({ eventStage: 'detail' })}>Not yet</TextButton>
    </>
  );
  return (
    <>
      <Heading>Noted.</Heading>
      <div style={{ fontSize: 17, lineHeight: 1.55, color: C.muted }}>I’ll nudge you shortly before it’s time to leave. Is there someone you could bring?</div>
      <PrimaryButton onClick={() => void share()} style={{ marginTop: 8 }}>Invite someone</PrimaryButton>
      <TextButton onClick={closeSheet}>Maybe solo</TextButton>
    </>
  );
}
