import { useEffect, useMemo, useState } from 'react';
import { moodIndexFor, themeDef, themesOf, weekThemes, THEMES, type ThemeKey } from '@saathi/domain';
import { api, type ConversationItem, type JournalEntry } from '../api';
import { speechLocale, stopDictation } from '../audio/dictation';
import { Orb } from '../components/figures';
import { finishJournal, go, keepPrivate, loadInsights, loadJournal, loadMoreJournal, loadTalk, openChat, openSheet, saveJournal, startCall, startJournal, toggleDictation } from '../state/actions';
import { dayOf, set, useStore, type JournalResult } from '../state/store';
import { HelpPill, ScreenFrame } from './Chrome';
import { useSaid } from './guidance';
import { Ic, type IconName } from './icons';
import { push, setV2, useV2 } from './ui';
import { MOODS5, Weather, moodByValue } from './Weather';

type Kind = 'page' | 'voice' | 'chat' | 'video';
const KIND: Record<Kind, { icon: IconName; bg: string; label: string }> = {
  page: { icon: 'pen', bg: 'var(--t-rose)', label: 'Page' },
  voice: { icon: 'mic', bg: 'var(--t-sky)', label: 'Voice' },
  chat: { icon: 'chat', bg: 'var(--t-sky)', label: 'Chat' },
  video: { icon: 'cam', bg: 'var(--t-rose)', label: 'Video' },
};
const kindOfConversation = (m: ConversationItem['mode']): Kind => (m === 'video' ? 'video' : m === 'text' || m === 'checkin' ? 'chat' : 'voice');

interface Item { id: string; kind: Kind; at: string; text: string; /** Only things they let Saathi learn from get themes. */ themes: ThemeKey[]; entry?: JournalEntry; convo?: ConversationItem; mood?: number }

function useTimeline(): Item[] {
  const entries = useStore(s => s.jEntries);
  const recent = useStore(s => s.recent);
  const remember = useStore(s => s.consent?.remember ?? false);
  return useMemo(() => {
    const a: Item[] = entries.map(e => ({ id: `p${e.id}`, kind: e.mode === 'spoken' ? 'voice' : 'page', at: e.createdAt, text: e.text, themes: remember && e.shared ? themesOf(e.text) : [], entry: e, mood: e.mood }));
    const b: Item[] = recent.filter(c => c.summary).map(c => ({ id: `c${c.id}`, kind: kindOfConversation(c.mode), at: c.startedAt, text: c.summary ?? '', themes: remember ? themesOf(c.summary ?? '') : [], convo: c }));
    return [...a, ...b].sort((x, y) => y.at.localeCompare(x.at));
  }, [entries, recent, remember]);
}

const ago = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

function ThemeChips({ ts }: { ts: ThemeKey[] }) {
  return <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{ts.slice(0, 3).map(k => { const h = themeDef(k); return <span key={k} className="pill" style={{ height: 22, fontSize: 11.5, background: `${h.color}33` }}><span className="dot" style={{ width: 8, height: 8, background: h.color }} />{h.label}</span>; })}</span>;
}

// ---------------------------------------------------------------------------------------------- the tab
export function JournalTab() {
  const seg = useV2(s => s.jseg);
  const more = useStore(s => s.jNext);
  useEffect(() => { void loadJournal(); void loadTalk(); void loadInsights(); }, []);
  return (
    <>
      <div className="hhead"><div><div className="eyebrow">Journal</div><h1 className="h1" style={{ marginTop: 4 }}>Your story<br />so far</h1></div><HelpPill /></div>
      <div className="card" style={{ background: 'var(--t-sand)', padding: 14 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <button className="btn grow1" data-track="journal.write" onClick={() => startJournal('write')}><Ic n="pen" />Write</button>
          <button className="btn grow1 soft" style={{ background: 'var(--card)' }} data-track="journal.talk_it_out" onClick={() => startJournal('speak')}><Ic n="mic" />Speak</button>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>Everything you write or say is kept here, only for you.</p>
      </div>
      <div className="seg" role="tablist" aria-label="Journal view" style={{ marginTop: 14 }}>
        <button role="tab" aria-selected={seg === 'timeline'} onClick={() => setV2({ jseg: 'timeline' })}>Timeline</button>
        <button role="tab" aria-selected={seg === 'progress'} onClick={() => setV2({ jseg: 'progress' })}>Progress</button>
      </div>
      {seg === 'timeline' ? <Timeline /> : <Progress />}
      {seg === 'timeline' && more && <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => void loadMoreJournal()}>Show older entries</button>}
      <p className="foot">Private to you. You can delete anything, any time.</p>
    </>
  );
}

function Timeline() {
  const all = useTimeline();
  const [q, setQ] = useState('');
  const [f, setF] = useState<ThemeKey | ''>('');
  const counts = useMemo(() => { const c: Partial<Record<ThemeKey, number>> = {}; all.forEach(t => t.themes.forEach(k => { c[k] = (c[k] ?? 0) + 1; })); return c; }, [all]);
  const items = all.filter(t => (!f || t.themes.includes(f)) && (!q || t.text.toLowerCase().includes(q.toLowerCase())));
  const week = items.filter(t => ago(t.at) <= 7), older = items.filter(t => ago(t.at) > 7);
  const open = (t: Item) => { if (t.entry) set({ sheet: 'jread', jReadId: t.entry.id }); else if (t.convo) push({ id: 'convo', arg: t.convo.id }); };
  const group = (title: string, list: Item[]) => list.length > 0 && (
    <>
      <div className="sec-h" style={{ margin: '16px 0 8px' }}><b className="eyebrow">{title}</b></div>
      <ul className="list card" style={{ padding: '2px 14px' }}>
        {list.map(t => (
          <li key={t.id}>
            <button className="row grow1" style={{ textAlign: 'left', gap: 12, alignItems: 'flex-start' }} onClick={() => open(t)}>
              <span className="ico" style={{ background: KIND[t.kind].bg, width: 38, height: 38, borderRadius: 12, marginTop: 2 }}><Ic n={KIND[t.kind].icon} /></span>
              <span className="grow1">
                <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', display2: 'box' } as React.CSSProperties}><span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.text}</span></span>
                <span className="fine" style={{ display: 'block', margin: '2px 0 5px' }}>{KIND[t.kind].label} · {dayOf(t.at)}{t.entry && !t.entry.shared ? ' · just for you' : ''}</span>
                {t.themes.length > 0 && <ThemeChips ts={t.themes} />}
              </span>
              {t.mood !== undefined && <span style={{ width: 28, flex: 'none' }} aria-label={MOODS5[t.mood]?.label}><Weather k={MOODS5[t.mood].k} /></span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
  return (
    <div className="stg">
      <div className="row" style={{ marginTop: 14, position: 'relative' }}>
        <input type="text" aria-label="Search your journal" placeholder="Search your words" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
      </div>
      {Object.keys(counts).length > 0 && (
        <div className="hscroll" style={{ marginTop: 10 }}>
          <div className="chips" style={{ flexWrap: 'nowrap' }}>
            <button className="chip" aria-pressed={!f} onClick={() => setF('')}>All</button>
            {THEMES.filter(h => counts[h.key]).map(h => <button key={h.key} className="chip" style={{ whiteSpace: 'nowrap' }} aria-pressed={f === h.key} onClick={() => setF(h.key)}><span className="dot" style={{ background: h.color, width: 10, height: 10 }} />{h.label} {counts[h.key]}</button>)}
          </div>
        </div>
      )}
      {items.length === 0
        ? <div className="card" style={{ textAlign: 'center', padding: '26px 20px', marginTop: 14 }}><b className="h3">{all.length ? 'Nothing matches' : 'No pages yet'}</b><p className="muted small" style={{ marginTop: 4 }}>{all.length ? 'Try another word or theme.' : 'Your first page plants your first flower.'}</p></div>
        : <>{group('This week', week)}{group('Earlier', older)}</>}
    </div>
  );
}

function Progress() {
  const ins = useStore(s => s.insights);
  const letter = useStore(s => s.letter);
  const { remember, said } = useSaid();
  const now = new Date();
  const wk = useMemo(() => weekThemes(said, now, 7), [said]); // eslint-disable-line react-hooks/exhaustive-deps
  const two = useMemo(() => weekThemes(said, now, 14), [said]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = ins?.moodSeries ?? [];
  const byDay = new Map(series.map(p => [p.day, p.value]));
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(now.getTime() - (13 - i) * 86_400_000); return { d, iso: d.toLocaleDateString('en-CA') }; });
  const keys = THEMES.map(h => h.key).filter(k => (wk[k] ?? 0) || (two[k] ?? 0));
  const max = Math.max(1, ...keys.map(k => two[k] ?? 0));
  const enough = (ins?.daysOfData ?? 0) >= 3;
  return (
    <div className="stg">
      <div className="card" style={{ marginTop: 14 }}>
        <div className="sec-h" style={{ marginBottom: 8 }}><b className="h3">How you have felt</b><span className="fine">Last 14 days</span></div>
        <div className="weekrow" style={{ rowGap: 10 }}>
          {days.map(({ d, iso }, i) => {
            const v = byDay.get(iso), m = moodByValue(v);
            return <div key={iso}>{m ? <Weather k={m.k} /> : <span className="none" />}<span>{i === 13 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'narrow' })}</span></div>;
          })}
        </div>
      </div>
      <div className="card">
        <b className="h3">What came up</b>
        {!remember
          ? <p className="muted small" style={{ marginTop: 8 }}>Turn on “Remember things from our chats” in You, and Saathi can show what you talk about. Your pages marked “just for you” are never read.</p>
          : keys.length
            ? keys.map(k => { const h = themeDef(k), a = wk[k] ?? 0, b = (two[k] ?? 0) - a; return (
              <div key={k} style={{ margin: '12px 0' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}><b className="small"><span className="dot" style={{ background: h.color, width: 10, height: 10, marginRight: 6 }} />{h.label}</b><span className="fine">{a} this week · {a > b ? `up from ${b}` : a < b ? `down from ${b}` : 'same as before'}</span></div>
                <div className="bar" style={{ marginTop: 6, height: 8 }}><i style={{ width: `${Math.round((a / max) * 100)}%`, background: h.color }} /></div>
              </div>
            ); })
            : <p className="muted small" style={{ marginTop: 8 }}>Saathi will show what you talk about once you have written or talked a few times.</p>}
      </div>
      <div className="card">
        <b className="h3">What seems to help you</b>
        {enough && ins && ins.rhythms.length > 0
          ? <ul className="list" style={{ marginTop: 4 }}>{ins.rhythms.map(r => <li key={r}><span className="ico" style={{ background: 'var(--t-sage)' }}><Ic n="leaf" color="#2F7A49" /></span><div className="grow1">{r}</div></li>)}</ul>
          : <p className="muted small" style={{ marginTop: 6 }}>Saathi needs a couple of weeks of check-ins to see what helps you. Nothing to do, just keep showing up.</p>}
      </div>
      {(ins?.wins.length ?? 0) > 0 && (
        <div className="card">
          <b className="h3">Small things you did</b>
          <ul className="list" style={{ marginTop: 4 }}>{ins?.wins.slice(0, 6).map(w => <li key={w.id}><span className="dot" style={{ background: '#F1A56B', width: 9, height: 9 }} /><span className="grow1">{w.label}</span><span className="fine">{dayOf(w.createdAt)}</span></li>)}</ul>
        </div>
      )}
      {letter && (
        <button className="mode" onClick={() => push({ id: 'letter' })}>
          <span className="ico" style={{ background: 'var(--t-rose)' }}><Ic n="pen" /></span>
          <span className="grow1"><b style={{ display: 'block' }}>Sunday letter</b><span className="muted small">{dayOf(letter.createdAt)}</span></span><Ic n="chev" />
        </button>
      )}
      <button className="mode" onClick={() => push({ id: 'why' })}>
        <span className="ico" style={{ background: 'var(--t-sand)' }}><Ic n="star" /></span>
        <span className="grow1"><b style={{ display: 'block' }}>How Saathi uses this</b><span className="muted small">See how today’s plan, stories, messages and events are chosen</span></span><Ic n="chev" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- a past conversation
export function ConvoScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const convo = useStore(s => s.recent.find(c => c.id === id));
  const comp = useStore(s => s.compName);
  const [msgs, setMsgs] = useState<{ id: string; role: 'user' | 'ai' | 'system'; text: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.messages(id).then(setMsgs).catch(() => setFailed(true)); }, [id]);
  const k = KIND[convo ? kindOfConversation(convo.mode) : 'chat'];
  return (
    <ScreenFrame title={`${k.label} conversation`} onBack={onBack}>
      {convo && <div className="row" style={{ gap: 10, margin: '6px 0 10px', flexWrap: 'wrap' }}><b>{dayOf(convo.startedAt)}</b></div>}
      {convo?.summary && <div className="card" style={{ background: 'var(--t-sand)', boxShadow: 'none' }}><div className="eyebrow">{comp}’s note</div><p className="small" style={{ marginTop: 4 }}>{convo.summary}</p></div>}
      {msgs === null && !failed && <p className="muted" role="status" style={{ marginTop: 14 }}>One moment…</p>}
      {failed && <p className="muted" role="alert" style={{ marginTop: 14 }}>I couldn’t open that conversation right now.</p>}
      {msgs && <div className="msgs" style={{ marginTop: 10 }}>{msgs.filter(m => m.role !== 'system').map(m => <div key={m.id} className={'m ' + (m.role === 'user' ? 'me' : 'her')}>{m.text}</div>)}</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
        <button className="btn block" onClick={() => void openChat(id)}><Ic n="chat" />Continue this conversation</button>
        <p className="fine" style={{ textAlign: 'center' }}>Conversations are cleared on the schedule you chose in You, under Privacy.</p>
      </div>
    </ScreenFrame>
  );
}

// ---------------------------------------------------------------------------------------------- writing
const PROMPTS = ['What’s taking up space today?', 'One thing that felt okay', 'Something I didn’t say', 'What I need right now'];

export function JournalCompose() {
  const stage = useStore(s => s.jStage);
  const close = () => { stopDictation(); set({ jResult: null }); go('journal'); };
  return (
    <div className="screen" role="main" aria-label="New journal entry" style={{ zIndex: 20 }}>
      <div className="sc-head">
        <button className="backbtn" onClick={close}><Ic n="back" />{stage === 'edit' ? 'Cancel' : 'Close'}</button>
        <div className="ttl">Today, {new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
        <HelpPill />
      </div>
      {stage === 'edit' && <Edit />}
      {stage === 'saving' && <div role="status" className="sc-body" style={{ display: 'grid', placeItems: 'center' }}><span className="muted">Saving…</span></div>}
      {stage === 'thinking' && (
        <div role="status" className="sc-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center', justifyContent: 'center' }}>
          <Orb size={96} mode="thinking" /><span className="h2 muted">Reading it gently…</span>
        </div>
      )}
      {stage === 'review' && <Review />}
    </div>
  );
}

function Edit() {
  const mode = useStore(s => s.jMode);
  const text = useStore(s => s.jText);
  const prompt = useStore(s => s.jPrompt);
  const share = useStore(s => s.jShare);
  const dictating = useStore(s => s.dictating);
  const busy = useStore(s => s.dictBusy);
  const err = useStore(s => s.jError);
  useStore(s => s.dictLang);
  const remember = useStore(s => s.consent?.remember ?? false);
  const comp = useStore(s => s.compName);
  const speak = mode === 'speak';
  return (
    <>
      <div style={{ padding: '4px 18px 0', display: 'grid', gap: 10 }}>
        <div className="seg" role="tablist" aria-label="Entry mode">
          <button role="tab" aria-selected={!speak} onClick={() => { stopDictation(); set({ jMode: 'write' }); }}>Write</button>
          <button role="tab" aria-selected={speak} onClick={() => set({ jMode: 'speak' })}>Talk it out</button>
        </div>
        <div className="hscroll" role="group" aria-label="Prompts"><div className="chips" style={{ flexWrap: 'nowrap' }}>{PROMPTS.map(p => <button key={p} className="chip" style={{ whiteSpace: 'nowrap' }} aria-pressed={prompt === p} onClick={() => set({ jPrompt: prompt === p ? null : p })}>{p}</button>)}</div></div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 18px 0', minHeight: 0 }}>
        {prompt && <div className="h3 muted" style={{ fontStyle: 'italic', marginBottom: 8 }}>{prompt}</div>}
        <textarea aria-label="Journal entry" value={text} onChange={e => set({ jText: e.target.value })} placeholder={speak ? 'Tap the microphone and just talk. I’ll write it down.' : 'Whatever’s on your mind. No one else reads this.'}
          style={{ flex: 1, minHeight: 120, background: 'transparent', border: 0, fontFamily: 'var(--disp)', fontSize: 19, lineHeight: 1.6, padding: 0, boxShadow: 'none' }} />
      </div>
      {err && <div role="alert" className="err" style={{ padding: '0 18px' }}>{err}</div>}
      {speak && (
        <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: '8px 0 4px' }}>
          <button onClick={toggleDictation} aria-label={dictating ? 'Listening. Tap to stop.' : text ? 'Tap to keep talking' : 'Tap to start talking'} className="iconbtn" style={{ width: 80, height: 80, background: dictating ? 'var(--leaf2)' : 'var(--indigo)', color: '#fff', boxShadow: 'var(--sh2)', position: 'relative' }}>
            {dictating && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--brand)', animation: 'sRing 2s cubic-bezier(.22,.61,.36,1) infinite' }} />}
            <Ic n={dictating ? 'stop' : 'mic'} size={30} />
          </button>
          <span role="status" className="muted small">{dictating ? 'Listening. Tap to stop.' : busy ? 'Writing down the last bit…' : text ? 'Tap to keep talking' : 'Tap to start talking'}</span>
          {!dictating && (
            <div className="chips" role="group" aria-label="Language you’re speaking">
              <button className="chip" aria-pressed={speechLocale() === 'en-IN'} onClick={() => set({ dictLang: 'en' })}>English</button>
              <button className="chip" aria-pressed={speechLocale() === 'hi-IN'} onClick={() => set({ dictLang: 'hi' })} lang="hi">हिन्दी</button>
            </div>
          )}
        </div>
      )}
      <div style={{ padding: '10px 18px 22px', display: 'grid', gap: 10 }}>
        <button className="sw card" role="switch" aria-checked={share} disabled={!remember} onClick={() => set({ jShare: !share })} style={{ padding: '12px 14px', opacity: remember ? 1 : .6 }}>
          <span><b>{share ? `${comp} can learn from this` : 'Just for me'}</b><span className="muted" style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>{!remember ? 'Turn on “Remember things from our chats” in You to let me learn from pages.' : share ? 'You’ll see what I noticed and choose what I remember.' : 'Saved privately. I won’t read it or remember it.'}</span></span><i />
        </button>
        <button className="btn block" disabled={!text.trim()} onClick={() => void saveJournal()}>Save</button>
      </div>
    </>
  );
}

function Review() {
  const r = useStore(s => s.jResult) as JournalResult | null;
  const comp = useStore(s => s.compName);
  if (!r) return null;
  const m = MOODS5[moodIndexFor(r.mood)];
  const flip = (id: number) => set(p => ({ jResult: p.jResult && { ...p.jResult, keep: p.jResult.keep.includes(id) ? p.jResult.keep.filter(k => k !== id) : [...p.jResult.keep, id] } }));
  const flipOpt = (k: 'hookOn' | 'stepOn') => set(p => ({ jResult: p.jResult && { ...p.jResult, [k]: !p.jResult[k] } }));
  return (
    <div className="sc-body" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
      <h2 className="h1">What I noticed</h2>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}><span style={{ width: 34, flex: 'none' }} aria-label={m.label}><Weather k={m.k} /></span><p style={{ fontSize: 16.5, lineHeight: 1.55 }}>{r.noticed}</p></div>
      {r.careFlag && (
        <section aria-label="Support" className="card" style={{ background: 'var(--t-sand)', display: 'grid', gap: 10 }}>
          <b>That sounds really heavy.</b>
          <span className="small" style={{ color: 'var(--ink2)' }}>Would it help to talk to a real person? It’s free, any time. I’m here too.</span>
          <div className="row" style={{ gap: 8 }}><button className="btn sm indigo grow1" onClick={() => openSheet('helplines')}>See helplines</button><button className="btn sm line grow1" onClick={() => void startCall('voice')}>Talk with {comp}</button></div>
        </section>
      )}
      <section className="card">
        <b className="h3">Remember this?</b>
        <p className="muted small" style={{ marginBottom: 4 }}>Only what you pick is saved. Edit it later in Memory.</p>
        {r.memories.map(mm => {
          const keep = r.keep.includes(mm.id);
          return (
            <div key={mm.id} className="row" style={{ gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <div className="grow1"><div className="eyebrow">{mm.theme}</div><div>{mm.text}</div>{mm.sensitive && <div className="fine">This feels personal, so it’s off unless you choose it.</div>}</div>
              <button className={'chip'} aria-pressed={keep} onClick={() => flip(mm.id)}>{keep ? 'Saved' : 'Save'}</button>
            </div>
          );
        })}
        {r.memories.length === 0 && <p className="muted small">Nothing to remember from this one.</p>}
      </section>
      <button className="sw card" role="switch" aria-checked={r.hookOn} onClick={() => flipOpt('hookOn')}><span><b>Next time we talk</b><span className="muted" style={{ display: 'block', fontStyle: 'italic', fontWeight: 500 }}>“{r.hook}”</span></span><i /></button>
      <button className="sw card" role="switch" aria-checked={r.stepOn} onClick={() => flipOpt('stepOn')}><span><b>A small step for tomorrow</b><span className="muted" style={{ display: 'block', fontWeight: 500 }}>{r.step}</span></span><i /></button>
      <button className="btn block" onClick={() => void finishJournal()}>Done</button>
      <button className="btn ghost block" onClick={() => void keepPrivate()}>Keep it just for me</button>
    </div>
  );
}
