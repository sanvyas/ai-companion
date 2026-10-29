import { useEffect, useState } from 'react';
import { PLANT_KINDS } from '@saathi/domain';
import { api, type SafetyPlan as SafetyPlanT } from '../api';
import { useDialog } from '../components/useDialog';
import { EMERGENCY, TELE_MANAS } from '../data/helplines';
import {
  acknowledgeHelp, allowMic, closeSheet as closeStoreSheet, confirmEvent, deleteEntry, deleteEverything, errMsg, exportMyData, loadYou, openBreathe, openChat, openSheet as openStoreSheet,
  removeTrusted, saveSafetyPlan, saveTrusted, setEntryShared, toast,
} from '../state/actions';
import { dayOf, getState, set, useStore } from '../state/store';
import { gardenMayHaveChanged, useGarden } from './garden';
import { plantNow } from './garden-actions';
import { useGuidance } from './guidance';
import { doOneThing } from './Home';
import { Ic } from './icons';
import { closeSheet as closeV2Sheet, useV2 } from './ui';
import { MOODS5, Weather, moodByValue } from './Weather';

// Bottom sheets. A few belong to the new design (check-in, planting, confirmations); the rest are opened by the shared app code
// through its own `sheet` setting (help, helplines, safety plan, letter, entries, microphone, delete, events, trusted person).

function Frame({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return (
    <>
      <div className={'scrim' + (on ? ' on' : '')} onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} className={'sheet' + (on ? ' on' : '')} role="dialog" aria-modal="true" aria-label={label} style={{ outline: 'none' }}>
        <div className="grab" aria-hidden="true" />
        {children}
      </div>
    </>
  );
}

const H = ({ children, center }: { children: React.ReactNode; center?: boolean }) => <h2 className="h1" style={{ fontSize: 24, textAlign: center ? 'center' : undefined }}>{children}</h2>;
const Call = ({ tel, onClick, children, className }: { tel: string; onClick?: () => void; children: React.ReactNode; className?: string }) => <a className={className} href={`tel:${tel}`} onClick={onClick}>{children}</a>;

export function Sheets() {
  const sheet = useStore(s => s.sheet);
  const v2 = useV2(s => s.sheet);
  if (sheet) return <StoreSheet which={sheet} />;
  if (!v2) return null;
  if (v2.id === 'checkin') return <Frame label="How are you feeling?" onClose={closeV2Sheet}><CheckinSheet /></Frame>;
  if (v2.id === 'plant') return <Frame label="Plant something" onClose={closeV2Sheet}><PlantSheet slot={v2.slot} /></Frame>;
  if (v2.id === 'confirm') return (
    <Frame label={v2.title} onClose={closeV2Sheet}>
      <H>{v2.title}</H>
      <p className="muted" style={{ margin: '6px 0 16px' }}>{v2.body}</p>
      <button className="btn block" onClick={() => { closeV2Sheet(); v2.onYes(); }}>{v2.yes}</button>
      <button className="btn ghost block" onClick={closeV2Sheet}>Not now</button>
    </Frame>
  );
  return null;
}

function StoreSheet({ which }: { which: NonNullable<ReturnType<typeof getState>['sheet']> }) {
  const label = which === 'support' ? 'Support' : 'Details';
  return (
    <Frame label={label} onClose={closeStoreSheet}>
      {which === 'support' && <Support />}
      {which === 'helplines' && <Helplines />}
      {which === 'plan' && <SafetyPlanView />}
      {which === 'planedit' && <SafetyPlanEdit />}
      {which === 'trusted' && <Trusted />}
      {which === 'letter' && <LetterSheet />}
      {which === 'jread' && <JournalRead />}
      {which === 'mic' && <Mic />}
      {which === 'delete' && <DeleteAll />}
      {which === 'event' && <EventSheet />}
    </Frame>
  );
}

// ---------------------------------------------------------------------------------------------- check-in
function CheckinSheet() {
  const [picked, setPicked] = useState<number | null>(null);
  const { one } = useGuidance();
  const choose = (v: number) => {
    if (picked !== null) return;
    setPicked(v);
    setTimeout(() => {
      const was = getState().mood;
      set({ mood: v });
      void api.logMood(v, 'checkin').then(() => gardenMayHaveChanged()).catch(e => { set({ mood: was }); toast(errMsg(e)); setPicked(null); });
    }, 650);
  };
  const m = moodByValue(picked);
  if (picked !== null && m && getState().mood === picked) {
    return (
      <>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 64, flex: 'none' }}><Weather k={m.k} /></div>
          <div><div className="h2">{m.label}</div><p style={{ marginTop: 4 }}>{m.say}</p></div>
        </div>
        {one && (
          <div className="card" style={{ marginTop: 16, boxShadow: '0 0 0 2px var(--brand),var(--sh1)' }}>
            <div className="eyebrow" style={{ color: 'var(--brand2)' }}>One small thing</div>
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <span className="ico" style={{ background: '#FFE9B8' }}><Ic n={one.icon} /></span>
              <div className="grow1"><b>{one.title}</b><div className="muted small">{one.sub}</div></div>
            </div>
            <p className="fine" style={{ marginTop: 10 }}>Because: {one.why}</p>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
          {one && <button className="btn block" onClick={() => { closeV2Sheet(); doOneThing(one.id); }}><Ic n={one.icon} />{one.cta}</button>}
          <button className="btn ghost block" onClick={closeV2Sheet}>Maybe later</button>
        </div>
      </>
    );
  }
  return (
    <>
      <H center>How are you feeling?</H>
      <p className="muted" style={{ textAlign: 'center', margin: '4px 0 14px' }}>There’s no wrong answer. Tap the one that fits.</p>
      <div className="faces" role="group" aria-label="How are you feeling?">
        {MOODS5.map(m1 => (
          <button key={m1.k} className={'face' + (picked === m1.v ? ' pick' : '')} disabled={picked !== null} aria-label={m1.label} data-track={`mood.${m1.v}`} onClick={() => choose(m1.v)}>
            <Weather k={m1.k} /><span>{m1.label}</span>
          </button>
        ))}
      </div>
      <div className="mooddesc muted" role="status">{m ? m.say : 'Tap a weather'}</div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- planting
function PlantSheet({ slot }: { slot: number | 'auto' }) {
  const garden = useGarden(s => s.garden);
  const [busy, setBusy] = useState(false);
  if (!garden) return <p className="muted">One moment…</p>;
  const free = (i: number) => !garden.plants.some(p => p.slot === i);
  const target = slot === 'auto' ? Array.from({ length: garden.slots }, (_, i) => i).find(free) ?? null : slot;
  const full = target === null || !free(target);
  return (
    <>
      <H>Plant something</H>
      <p className="muted" style={{ margin: '4px 0 14px' }}>Plants grow one step on every day you show up. Missing a day never harms them.</p>
      {full && <p className="note" role="status">Every plot is in use right now. More open up as your garden grows.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {PLANT_KINDS.map(d => {
          const lock = garden.sunlight < d.at;
          return (
            <button key={d.id} className="mode" disabled={lock || full || busy} style={lock ? { opacity: .55 } : undefined}
              onClick={async () => { if (target === null) return; setBusy(true); await plantNow(d.id, target); setBusy(false); }}>
              <span className="ico" style={{ background: d.kind === 'tree' ? '#DDF0DC' : '#FFF1D2' }}><Ic n={d.kind === 'tree' ? 'leaf' : 'flower'} color={d.kind === 'tree' ? '#2F7A49' : '#B26A00'} /></span>
              <span className="grow1"><b style={{ display: 'block' }}>{d.name}</b><span className="muted small">{lock ? `Opens as your garden grows (${d.at} sunlight)` : `Ready after ${d.days} days you show up`}</span></span>
              <Ic n={lock ? 'lock' : 'chev'} />
            </button>
          );
        })}
      </div>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={closeV2Sheet}>Not now</button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- help
function Support() {
  const trusted = useStore(s => s.trustedDial);
  const helplines = useStore(s => s.helplines);
  const tele = helplines.find(h => h.id === TELE_MANAS.id);
  return (
    <>
      <H>You’re not alone in this.</H>
      <p className="muted" style={{ margin: '6px 0 14px' }}>If you are in danger right now, or thinking about hurting yourself, please reach out to someone. It’s okay to ask. Free, always, and it works without internet.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Call className="mode" tel={EMERGENCY.tel} onClick={() => acknowledgeHelp('emergency')}>
          <span className="ico" style={{ background: '#FFD9D2' }}><Ic n="phone" color="#8A2D1C" /></span>
          <span className="grow1"><b style={{ display: 'block' }}>Emergency · {EMERGENCY.num}</b><span className="small" style={{ color: 'var(--ink2)' }}>If someone is in immediate danger</span></span>
        </Call>
        <Call className="mode" tel={tele?.tel ?? TELE_MANAS.tel} onClick={() => acknowledgeHelp('helpline')}>
          <span className="ico" style={{ background: '#D9EEDD' }}><Ic n="phone" color="#2F7A49" /></span>
          <span className="grow1"><b style={{ display: 'block' }}>Tele-MANAS · {tele?.number ?? TELE_MANAS.num}</b><span className="muted small">Free mental health helpline, 24 hours</span></span>
        </Call>
        {trusted
          ? <Call className="mode" tel={trusted.phone} onClick={() => acknowledgeHelp('contact')}><span className="ico" style={{ background: '#FADCE3' }}><Ic n="heart" /></span><span className="grow1"><b style={{ display: 'block' }}>Call {trusted.name}</b><span className="muted small">Your trusted person</span></span></Call>
          : <button className="mode" onClick={() => openStoreSheet('trusted')}><span className="ico" style={{ background: '#FADCE3' }}><Ic n="heart" /></span><span className="grow1"><b style={{ display: 'block' }}>Add someone you trust</b><span className="muted small">A person you could call on a hard day</span></span><Ic n="chev" /></button>}
        <button className="mode" onClick={() => openStoreSheet('helplines')}><span className="ico" style={{ background: '#E4DDF3' }}><Ic n="life" /></span><span className="grow1"><b style={{ display: 'block' }}>More helplines</b><span className="muted small">Every number, with hours and languages</span></span><Ic n="chev" /></button>
        <button className="mode" onClick={() => openStoreSheet('plan')}><span className="ico" style={{ background: '#CBE7B5' }}><Ic n="list" /></span><span className="grow1"><b style={{ display: 'block' }}>My safety plan</b><span className="muted small">What helps, and who to call</span></span><Ic n="chev" /></button>
        <button className="mode" onClick={openBreathe}><span className="ico" style={{ background: '#D3ECF5' }}><Ic n="wave" /></span><span className="grow1"><b style={{ display: 'block' }}>Breathe with me</b><span className="muted small">One minute, guided</span></span><Ic n="chev" /></button>
      </div>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={closeStoreSheet}>Close</button>
    </>
  );
}

function Helplines() {
  const helplines = useStore(s => s.helplines);
  const trusted = useStore(s => s.trustedDial);
  return (
    <>
      <H>Talk to a person now</H>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {helplines.map(h => (
          <div key={h.id} className="card row" style={{ gap: 12 }}>
            <div className="grow1"><b>{h.name}</b><div className="muted small">{h.description}</div>{h.hours && <div className="fine">{h.hours}</div>}</div>
            <Call className="btn sm indigo" tel={h.tel} onClick={() => acknowledgeHelp(h.kind === 'emergency' ? 'emergency' : 'helpline')}><Ic n="phone" />{h.number}</Call>
          </div>
        ))}
        <div className="card row" style={{ gap: 12 }}>
          {trusted
            ? <><div className="grow1"><b>{trusted.name}</b><div className="muted small">Your trusted contact.</div></div><Call className="btn sm indigo" tel={trusted.phone} onClick={() => acknowledgeHelp('contact')}><Ic n="phone" />Call</Call></>
            : <><div className="grow1"><b>Someone you trust</b><div className="muted small">Add a person you could call.</div></div><button className="btn sm soft" onClick={() => openStoreSheet('trusted')}>Add</button></>}
        </div>
      </div>
      {helplines.some(h => h.stale) && <p className="fine" style={{ marginTop: 10 }}>Some numbers haven’t been re-checked recently. If one doesn’t connect, try another.</p>}
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => openStoreSheet('support')}>Back</button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- safety plan
const EMPTY_PLAN: SafetyPlanT = { warningSigns: [], copingSteps: [], people: [], places: [], professionals: [], makingSpaceSafer: [] };
const PLAN_SECTIONS: { key: Exclude<keyof SafetyPlanT, 'people'>; label: string; hint: string }[] = [
  { key: 'warningSigns', label: 'Signs things are getting harder', hint: 'e.g. not sleeping, pulling away from people' },
  { key: 'copingSteps', label: 'Things that help me', hint: 'e.g. a walk, music, cold water' },
  { key: 'places', label: 'Places I can go', hint: 'e.g. the park, a friend’s house' },
  { key: 'professionals', label: 'Professionals', hint: 'e.g. Dr. Rao, 080 …' },
  { key: 'makingSpaceSafer', label: 'Making my space safer', hint: 'e.g. ask someone to keep my tablets' },
];

function SafetyPlanView() {
  const plan = useStore(s => s.safetyPlan);
  useEffect(() => { void loadYou(); }, []);
  const empty = !plan || (!plan.warningSigns.length && !plan.copingSteps.length && !plan.people.length && !plan.places.length && !plan.professionals.length && !(plan.makingSpaceSafer ?? []).length);
  return (
    <>
      <H>My safety plan</H>
      {empty ? (
        <p className="muted" style={{ margin: '8px 0' }}>You haven’t written one yet. It’s a few lines for a hard moment: what helps, who to call. It stays private, and it opens without internet once you’ve seen it.</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {PLAN_SECTIONS.map(sec => (plan?.[sec.key] ?? []).length > 0 && (
            <div key={sec.key} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="eyebrow">{sec.label}</div>
              {(plan?.[sec.key] ?? []).map(t => <div key={t} style={{ marginTop: 4 }}>{t}</div>)}
            </div>
          ))}
          {(plan?.people ?? []).length > 0 && (
            <div style={{ padding: '12px 0' }}>
              <div className="eyebrow">People I can reach</div>
              {plan?.people.map(pp => (
                <div key={pp.name} className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <span>{pp.name}</span>
                  {pp.phone && <Call className="btn sm indigo" tel={pp.phone} onClick={() => acknowledgeHelp('contact')}><Ic n="phone" />Call</Call>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button className="btn block" style={{ marginTop: 8 }} onClick={() => openStoreSheet('planedit')}>{empty ? 'Write mine' : 'Edit'}</button>
      <button className="btn ghost block" onClick={() => openStoreSheet('support')}>Back</button>
    </>
  );
}

const lines = (t: string) => t.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 10);

function SafetyPlanEdit() {
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
    openStoreSheet('plan');
  };
  const area = (key: string, label: string, hint: string) => (
    <div key={key} style={{ marginTop: 14 }}>
      <label className="f" htmlFor={`sp-${key}`}>{label}</label>
      <textarea id={`sp-${key}`} value={txt[key]} onChange={e => setTxt(t => ({ ...t, [key]: e.target.value }))} placeholder={hint} rows={3} />
    </div>
  );
  return (
    <>
      <H>My safety plan</H>
      <p className="muted" style={{ margin: '4px 0 0' }}>One item per line. Only you can see this.</p>
      {PLAN_SECTIONS.slice(0, 2).map(sec => area(sec.key, sec.label, sec.hint))}
      {area('people', 'People I can reach', 'Priya, 98xxxxxx12')}
      {PLAN_SECTIONS.slice(2).map(sec => area(sec.key, sec.label, sec.hint))}
      <button className="btn block" style={{ marginTop: 16 }} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      <button className="btn ghost block" onClick={() => openStoreSheet('plan')}>Cancel</button>
    </>
  );
}

function Trusted() {
  const cur = useStore(s => s.me?.trustedContact);
  const [name, setName] = useState(cur?.name ?? '');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState(cur?.relation ?? '');
  const ok = name.trim() && phone.replace(/\D/g, '').length >= 8;
  return (
    <>
      <H>Someone you trust</H>
      <p className="muted" style={{ margin: '6px 0 14px' }}>A person I can suggest you reach out to on a hard day. I never contact them myself, and their number is stored encrypted.</p>
      <label className="f" htmlFor="tc-name">Name</label>
      <input type="text" id="tc-name" value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
      <label className="f" htmlFor="tc-phone" style={{ marginTop: 12 }}>Phone number</label>
      <input type="text" id="tc-phone" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={cur ? `${cur.phoneMasked} (enter again to change)` : '10-digit mobile number'} autoComplete="off" />
      <label className="f" htmlFor="tc-rel" style={{ marginTop: 12 }}>Who are they to you? (optional)</label>
      <input type="text" id="tc-rel" value={relation} onChange={e => setRelation(e.target.value)} placeholder="e.g. sister, friend" autoComplete="off" />
      <button className="btn block" style={{ marginTop: 16 }} disabled={!ok} onClick={() => { void saveTrusted({ name: name.trim(), phone: phone.trim(), relation: relation.trim() }).then(closeStoreSheet); }}>Save</button>
      {cur && <button className="btn ghost block" onClick={() => { void removeTrusted().then(closeStoreSheet); }}>Remove {cur.name}</button>}
    </>
  );
}

// ---------------------------------------------------------------------------------------------- reading
function LetterSheet() {
  const letter = useStore(s => s.letter);
  if (!letter) return <H>No letter yet.</H>;
  return (
    <>
      <div className="eyebrow">Sunday letter · {dayOf(letter.createdAt)}</div>
      <div style={{ fontFamily: 'var(--disp)', fontSize: 19, lineHeight: 1.6, marginTop: 10, display: 'grid', gap: 12 }}>
        {letter.body.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
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
  const m = MOODS5[e.mood];
  return (
    <>
      <div className="row" style={{ gap: 10 }}><div style={{ width: 28 }} aria-label={m.label}><Weather k={m.k} /></div><span className="muted small">{dayOf(e.createdAt)} · {e.mode === 'spoken' ? 'Spoken' : 'Written'}</span></div>
      <p style={{ fontFamily: 'var(--disp)', fontSize: 19, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 12 }}>{e.text}</p>
      <button className="sw card" role="switch" aria-checked={e.shared} onClick={() => void setEntryShared(e.id, !e.shared)} style={{ marginTop: 14, padding: '12px 14px' }}>
        <span><b>{comp} can learn from this</b><span className="muted" style={{ display: 'block', fontSize: 13 }}>Off keeps it just for you.</span></span><i />
      </button>
      <button className="btn ghost block" style={{ color: '#B3392A' }} onClick={() => void deleteEntry(e.id)}>Delete this entry</button>
    </>
  );
}

function Mic() {
  return (
    <>
      <H>May I use your microphone?</H>
      <p className="muted" style={{ margin: '6px 0 16px' }}>So I can hear you. It’s only on while we’re talking, and recordings aren’t kept.</p>
      <button className="btn block" onClick={() => void allowMic()}><Ic n="mic" />Allow microphone</button>
      <button className="btn ghost block" onClick={() => { closeStoreSheet(); void openChat(); }}>Type instead</button>
    </>
  );
}

function DeleteAll() {
  const n = useStore(s => s.memories.length);
  const [sure, setSure] = useState(false);
  return (
    <>
      <H>This removes everything, for good. Take your time.</H>
      <p className="muted" style={{ margin: '8px 0 12px' }}>Your conversations, check-ins, {n} memories, your garden, your safety plan and your account. You have 30 days to change your mind by signing in again. After that it’s gone from our servers, and backups clear on schedule.</p>
      <button className="link" onClick={() => void exportMyData()}>Download a copy first</button>
      <button className="btn block" style={{ background: 'var(--ink)', color: 'var(--bg)', marginTop: 8 }} onClick={() => { if (sure) { closeStoreSheet(); void deleteEverything(); } else setSure(true); }}>{sure ? 'Yes, delete my account and data' : 'Delete my account and data'}</button>
      <button className="btn ghost block" onClick={closeStoreSheet}>Keep everything</button>
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
  const field = (k: string, v?: string) => (v ? <div style={{ marginTop: 10 }}><div className="eyebrow">{k}</div><div>{v}</div></div> : null);
  const share = async () => {
    const text = `${e.title}, ${when}, ${e.venue}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); toast('Copied. Send it to someone you’d like there.'); }
    } catch { /* cancelled */ }
  };
  if (stage === 'detail') return (
    <>
      <H>{e.title}</H>
      <p className="muted small" style={{ marginTop: 4 }}>{when} · {e.venue} · {e.price}{e.groupSize ? ` · ${e.groupSize}` : ''}</p>
      {field('What it’s like', d.like)}{field('How long', d.stay)}{field('Getting there', d.how)}
      {e.organiser && <p className="fine" style={{ marginTop: 10 }}>Listed by {e.organiser}</p>}
      <button className="btn block" style={{ marginTop: 14 }} onClick={() => set({ eventStage: 'confirm' })}>I’ll try this</button>
      <button className="btn ghost block" onClick={() => void share()}>Bring a friend</button>
    </>
  );
  if (stage === 'confirm') return (
    <>
      <H>Let me read it back.</H>
      <p style={{ fontFamily: 'var(--disp)', fontSize: 20, lineHeight: 1.45, margin: '10px 0' }}>{e.title}, {when}, at {e.venue}. {e.price === 'Free' ? 'It’s free.' : `It costs ${e.price}.`}</p>
      <p className="muted small">Nothing is booked or paid here. I’ll remind you before it starts.</p>
      <button className="btn block" style={{ marginTop: 12 }} onClick={() => void confirmEvent(e.id).then(gardenMayHaveChanged)}>I’m interested</button>
      <button className="btn ghost block" onClick={() => set({ eventStage: 'detail' })}>Not yet</button>
    </>
  );
  return (
    <>
      <H>Noted.</H>
      <p className="muted" style={{ margin: '8px 0 14px' }}>I’ll nudge you shortly before it’s time to leave. Is there someone you could bring?</p>
      <button className="btn block" onClick={() => void share()}>Invite someone</button>
      <button className="btn ghost block" onClick={closeStoreSheet}>Maybe solo</button>
    </>
  );
}
