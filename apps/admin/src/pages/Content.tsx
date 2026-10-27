import { useState } from 'react';
import { api, useLoad } from '../lib/api';
import { day, when } from '../lib/format';
import { useSession } from '../lib/session';
import { Badge, Banner, Button, Card, Dialog, Field, Loading, PageHead, Problem, Table, Tabs, Toggle, useAction } from '../lib/ui';

interface Helpline { id: string; name: string; description: string; number: string; tel: string; kind: string; city: string | null; languages: string[]; hours: string; sort: number; active: boolean; verified_at: string | null; stale: boolean }
interface Event { id: string; city: string; title: string; venue: string; starts_at: string; category: string; price: string; group_size: string | null; organiser: string | null; beginner_friendly: boolean; details: { tags?: string[]; why?: string; like?: string; stay?: string; how?: string }; active: boolean; interested: number }
interface Calm { id: string; kind: string; category: string; title: string; minutes: number; has_script: boolean; sessions: number }

function HelplineDialog({ h, onClose, done }: { h: Helpline; onClose: () => void; done: () => void }) {
  const act = useAction();
  const [f, setF] = useState({ name: h.name, description: h.description, number: h.number, tel: h.tel, hours: h.hours, active: h.active });
  const dial = f.number !== h.number || f.tel !== h.tel;
  return (
    <Dialog title={`Edit ${h.name}`} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={async () => { const r = await act(() => api.put<{ verificationCleared: boolean }>(`/content/helplines/${h.id}`, f)); if (r) { done(); onClose(); } }}>Save</Button></>}>
      {dial && <Banner><span>Changing the number clears “verified”. Someone must call it and verify it again.</span></Banner>}
      {(['name', 'description', 'number', 'tel', 'hours'] as const).map(k => <Field key={k} label={k === 'tel' ? 'Dial string (what the phone dials)' : k[0].toUpperCase() + k.slice(1)}>{id => <input id={id} className="input" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} />}</Field>)}
      <div className="row"><Toggle on={f.active} onChange={v => setF({ ...f, active: v })} label="Shown in the app" /><span>Shown in the app</span></div>
    </Dialog>
  );
}

function Helplines() {
  const { data, error, reload } = useLoad<{ items: Helpline[] }>('/content/helplines');
  const { can } = useSession();
  const act = useAction();
  const [edit, setEdit] = useState<Helpline | null>(null);
  const [verify, setVerify] = useState<Helpline | null>(null);
  const [note, setNote] = useState('');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const stale = data.items.filter(h => h.active && h.stale).length;
  return (
    <>
      {stale > 0 && <Banner tone="bad"><span><b>{stale} helpline{stale === 1 ? ' hasn’t' : 's haven’t'} been verified in the last 100 days.</b> Call each number, confirm it connects, then mark it verified. Do this before inviting people.</span></Banner>}
      <Card flush>
        <Table rows={data.items} rowKey={h => h.id} cols={[
          { head: 'Helpline', cell: h => <><b>{h.name}</b> {!h.active && <Badge>hidden</Badge>}<div className="muted" style={{ fontSize: 12.5 }}>{h.description}</div></> },
          { head: 'Number', cell: h => <span className="mono">{h.number}</span> }, { head: 'Hours', cell: h => h.hours },
          { head: 'Verified', cell: h => h.verified_at ? <Badge tone={h.stale ? 'warn' : 'ok'}>{day(h.verified_at)}{h.stale ? ' · old' : ''}</Badge> : <Badge tone="bad">Never</Badge>, nowrap: true },
          { head: '', right: true, cell: h => can('content.write') && <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => { setVerify(h); setNote(''); }}>Verify</Button><Button size="sm" onClick={() => setEdit(h)}>Edit</Button></div> },
        ]} />
      </Card>
      {edit && <HelplineDialog h={edit} onClose={() => setEdit(null)} done={reload} />}
      {verify && (
        <Dialog title={`Verify ${verify.name}`} onClose={() => setVerify(null)} footer={<><Button onClick={() => setVerify(null)}>Cancel</Button><Button variant="primary" disabled={note.trim().length < 3} onClick={async () => { const r = await act(() => api.post(`/content/helplines/${verify.id}/verify`, { note }), 'Marked verified today.'); if (r) { setVerify(null); reload(); } }}>Mark verified today</Button></>}>
          <p>Call <b className="mono">{verify.number}</b> yourself and confirm it connects to the right service.</p>
          <Field label="What you checked">{id => <input id={id} className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. called, answered in 20 seconds" />}</Field>
        </Dialog>
      )}
    </>
  );
}

function EventDialog({ ev, onClose, done }: { ev: Event | null; onClose: () => void; done: () => void }) {
  const act = useAction();
  const [f, setF] = useState({ id: ev?.id ?? '', city: ev?.city ?? '', title: ev?.title ?? '', venue: ev?.venue ?? '', startsAt: ev ? ev.starts_at.slice(0, 16) : '', category: ev?.category ?? 'walk', price: ev?.price ?? 'Free', groupSize: ev?.group_size ?? '', organiser: ev?.organiser ?? '', why: ev?.details.why ?? '', like: ev?.details.like ?? '', stay: ev?.details.stay ?? '', how: ev?.details.how ?? '', tags: (ev?.details.tags ?? []).join(', '), active: ev?.active ?? true });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const id = ev?.id ?? (f.id || f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50));
  return (
    <Dialog wide title={ev ? 'Edit event' : 'New event'} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={id.length < 3 || !f.title || !f.city || !f.venue || !f.startsAt} onClick={async () => {
      const body = { city: f.city, title: f.title, venue: f.venue, startsAt: new Date(f.startsAt).toISOString(), category: f.category, price: f.price, groupSize: f.groupSize || null, organiser: f.organiser || null, active: f.active, details: { tags: f.tags.split(',').map(s => s.trim()).filter(Boolean), why: f.why, like: f.like, stay: f.stay, how: f.how } };
      const r = await act(() => api.put(`/content/events/${id}`, body), 'Event saved.'); if (r) { done(); onClose(); }
    }}>Save event</Button></>}>
      <div className="grid g2">
        <Field label="Title">{i => <input id={i} className="input" value={f.title} onChange={set('title')} />}</Field>
        <Field label="City">{i => <input id={i} className="input" value={f.city} onChange={set('city')} />}</Field>
        <Field label="Venue">{i => <input id={i} className="input" value={f.venue} onChange={set('venue')} />}</Field>
        <Field label="Starts (your time)">{i => <input id={i} className="input" type="datetime-local" value={f.startsAt} onChange={set('startsAt')} />}</Field>
        <Field label="Category">{i => <input id={i} className="input" value={f.category} onChange={set('category')} />}</Field>
        <Field label="Price">{i => <input id={i} className="input" value={f.price} onChange={set('price')} />}</Field>
        <Field label="Group size">{i => <input id={i} className="input" value={f.groupSize} onChange={set('groupSize')} placeholder="About ten people" />}</Field>
        <Field label="Listed by">{i => <input id={i} className="input" value={f.organiser} onChange={set('organiser')} />}</Field>
      </div>
      <Field label="Tags" hint="Comma separated, e.g. Solo-friendly, Quiet">{i => <input id={i} className="input" value={f.tags} onChange={set('tags')} />}</Field>
      <Field label="Why it might suit someone">{i => <input id={i} className="input" value={f.why} onChange={set('why')} />}</Field>
      <Field label="What it’s like">{i => <textarea id={i} className="input" rows={2} value={f.like} onChange={set('like')} />}</Field>
      <div className="grid g2"><Field label="How long to stay">{i => <input id={i} className="input" value={f.stay} onChange={set('stay')} />}</Field><Field label="Getting there">{i => <input id={i} className="input" value={f.how} onChange={set('how')} />}</Field></div>
      <div className="row"><Toggle on={f.active} onChange={v => setF({ ...f, active: v })} label="Shown in the app" /><span>Shown in the app</span></div>
    </Dialog>
  );
}

function Events() {
  const { data, error, reload } = useLoad<{ items: Event[] }>('/content/events');
  const { can } = useSession();
  const act = useAction();
  const [edit, setEdit] = useState<Event | 'new' | null>(null);
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <Banner tone="info"><span>Events are entered by hand for now. Check every listing yourself (venue, organiser, price) before switching it on, because people may go alone.</span></Banner>
      <Card flush title="Events" actions={can('content.write') && <Button variant="primary" size="sm" onClick={() => setEdit('new')}>New event</Button>}>
        <Table rows={data.items} rowKey={e => e.id} empty="No events yet." cols={[
          { head: 'Event', cell: e => <><b>{e.title}</b> {!e.active && <Badge>hidden</Badge>}<div className="muted" style={{ fontSize: 12.5 }}>{e.venue}, {e.city} · {e.price}</div></> },
          { head: 'Starts', cell: e => when(e.starts_at), nowrap: true }, { head: 'Interested', cell: e => e.interested, right: true },
          { head: '', right: true, cell: e => can('content.write') && <div className="row" style={{ justifyContent: 'flex-end' }}><Button size="sm" onClick={() => setEdit(e)}>Edit</Button>{e.active && <Button size="sm" variant="ghost" onClick={() => void act(() => api.del(`/content/events/${e.id}`).then(reload), 'Hidden from the app.')}>Hide</Button>}</div> },
        ]} />
      </Card>
      {edit && <EventDialog ev={edit === 'new' ? null : edit} onClose={() => setEdit(null)} done={reload} />}
    </>
  );
}

function CalmList() {
  const { data, error, reload } = useLoad<{ items: Calm[] }>('/content/calm');
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <Banner tone="info"><span>The calm library is read-only here. The scripts are narrated by the phone’s own voice until real recordings exist. Sessions shows how often each one is played.</span></Banner>
      <Card flush><Table rows={data.items} rowKey={c => c.id} cols={[{ head: 'Title', cell: c => <b>{c.title}</b> }, { head: 'Type', cell: c => c.kind }, { head: 'Category', cell: c => c.category }, { head: 'Length', cell: c => `${c.minutes} min`, right: true }, { head: 'Script', cell: c => (c.has_script ? <Badge tone="ok">written</Badge> : <Badge>none</Badge>) }, { head: 'Sessions', cell: c => c.sessions, right: true }]} /></Card>
    </>
  );
}

export function Content() {
  const [tab, setTab] = useState<'helplines' | 'events' | 'calm'>('helplines');
  return (
    <>
      <PageHead title="Content" sub="The helplines, events and calm sessions the app shows." />
      <Tabs tabs={[{ id: 'helplines', label: 'Helplines' }, { id: 'events', label: 'Events' }, { id: 'calm', label: 'Calm library' }]} value={tab} onChange={setTab} />
      {tab === 'helplines' && <Helplines />}{tab === 'events' && <Events />}{tab === 'calm' && <CalmList />}
    </>
  );
}
