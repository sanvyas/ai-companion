import { useStore, dayOf } from '../state/store';
import { addPlanItem, confirmEvent, startWalkFlow } from '../state/actions';
import { s } from './css';
import { Sheet } from './Chrome';
import { MOODS } from './moods';
import { closeSheet, useV3 } from './ui';
import type { JournalEntry } from '../api';

const BG = ['linear-gradient(135deg,#93C48A,#DDEFE4)', 'linear-gradient(135deg,#E8896B,#FCEFCF)', 'linear-gradient(135deg,#6F6BB8,#E6E4F5)'];

/** An event near them. Nothing is booked or paid here; saying "I’ll go" only adds a tiny step and a reminder. */
export function EventSheet({ id }: { id: string }) {
  const events = useStore(x => x.events);
  const i = events.findIndex(e => e.id === id);
  const e = events[i];
  if (!e) return null;
  const d = e.details as Record<string, string | undefined>;
  const when = new Date(e.startsAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
  const tags = [e.beginnerFriendly ? 'Beginner friendly' : null, e.groupSize, e.price].filter(Boolean) as string[];
  const go = async () => { if (e.interested) { closeSheet(); return; } await confirmEvent(e.id); void addPlanItem(`Go to ${e.title.toLowerCase()}`); closeSheet(); };
  return (
    <Sheet label={e.title} onClose={closeSheet}>
      <div aria-hidden="true" style={s(`height:140px;border-radius:24px;background:${BG[i % 3]};flex:none`)} />
      <h2 className="serif" style={s('font-size:32px;line-height:1.1;margin:0')}>{e.title}</h2>
      <div style={s('font-size:14px;color:#636B78')}>{when} · {e.venue}</div>
      <div style={s('display:flex;flex-wrap:wrap;gap:6px')}>{tags.map(t => <span key={t} style={s('height:30px;padding:0 12px;border-radius:15px;background:#FFFFFF;font-size:13px;font-weight:600;display:flex;align-items:center')}>{t}</span>)}</div>
      {d.like && <p style={s('font-size:16px;line-height:1.5;margin:0')}>{d.like}</p>}
      {d.stay && <p style={s('font-size:14px;line-height:1.5;margin:0;color:#636B78')}>{d.stay}</p>}
      <button onClick={() => void go()} style={s('height:56px;border-radius:28px;border:none;background:#2F2A5E;color:#FFFFFF;font-size:16px;font-weight:700;flex:none')}>{e.interested ? 'You’re going · close' : 'I’ll go'}</button>
      <button onClick={() => { closeSheet(); void startWalkFlow(); }} style={s('height:48px;border-radius:24px;border:none;background:none;color:#2F2A5E;font-size:15px;font-weight:700;flex:none')}>Walk me there</button>
      <span style={s('font-size:13px;color:#636B78')}>Nothing is booked or paid here. I’ll remind you before it starts.{e.organiser ? ` Listed by ${e.organiser}.` : ''}</span>
    </Sheet>
  );
}

const first = (t: string) => { const one = t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0]; return one.length > 52 ? `${one.slice(0, 50).trimEnd()}…` : one; };
export const dayKeyOf = (iso: string) => new Date(iso).toDateString();
export const daySummary = (es: JournalEntry[]) => first([...es].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0].text);

/** What was written or said on one day. */
export function DaySheet({ entryId }: { entryId: string }) {
  const all = useStore(x => x.jEntries);
  const anchor = all.find(e => e.id === entryId);
  if (!anchor) return null;
  const k = dayKeyOf(anchor.createdAt);
  const es = all.filter(e => dayKeyOf(e.createdAt) === k).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const m = MOODS[es.at(-1)!.mood];
  return (
    <Sheet label="That day" onClose={closeSheet}>
      <div style={s('display:flex;align-items:center;gap:12px')}><span aria-hidden="true" style={s(`width:36px;height:36px;border-radius:${m.shape};background:${m.color}`)} /><span style={s('font-size:15px;color:#636B78;font-weight:600')}>{dayOf(anchor.createdAt)} · {m.label.toLowerCase()}</span></div>
      <p className="serif" style={s('font-size:28px;line-height:1.15;margin:0')}>{daySummary(es)}</p>
      {es.map(e => (
        <div key={e.id} style={s('background:#FFFFFF;border-radius:20px;padding:14px 16px;display:flex;flex-direction:column;gap:6px')}>
          <span style={s('font-size:12px;color:#636B78;font-weight:700')}>{new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })} · {e.mode === 'spoken' ? 'Spoken' : 'Written'}{e.shared ? ' · Saathi can learn from this' : ' · just for you'}</span>
          <span style={s('font-size:16px;line-height:1.45;white-space:pre-wrap')}>{e.text}</span>
        </div>
      ))}
    </Sheet>
  );
}

export function V3Sheets() {
  const sheet = useV3(x => x.sheet);
  if (!sheet) return null;
  if (sheet.id === 'event') return <EventSheet id={sheet.eventId} />;
  if (sheet.id === 'day') return <DaySheet entryId={sheet.entryId} />;
  return null;
}
