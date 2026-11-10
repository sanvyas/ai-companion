import { useEffect, useMemo } from 'react';
import { Companion } from '../components/figures';
import { stopDictation } from '../audio/dictation';
import { finishJournal, go, keepPrivate, loadInsights, loadJournal, loadMoreJournal, openSheet, saveJournal, startJournal, startCall, toggleDictation } from '../state/actions';
import { set, useStore, type JournalResult } from '../state/store';
import { Head, HelpButton } from './Chrome';
import { s } from './css';
import { I, Svg } from './icons';
import { MOODS } from './moods';
import { Weather } from './weather';
import { NotebookArt, PartArt } from './art';
import { dayKeyOf, daySummary } from './Sheets';
import { setV3, useV3 } from './ui';

const part = (d: Date) => { const h = d.getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; };
const PARTS = ['Morning', 'Afternoon', 'Evening'] as const;

export function JournalTab() {
  const entries = useStore(x => x.jEntries);
  const next = useStore(x => x.jNext);
  const insights = useStore(x => x.insights);
  const mood = useStore(x => x.mood);
  const tab = useV3(x => x.jtab);
  useEffect(() => { void loadJournal(); void loadInsights(); }, []);

  const todayKey = new Date().toDateString();
  const todays = entries.filter(e => dayKeyOf(e.createdAt) === todayKey).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const week = useMemo(() => {
    const days: { d: string; m: number | null; today: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const iso = dt.toLocaleDateString('en-CA');
      const found = insights?.moodSeries.find(x => x.day === iso);
      days.push({ d: i === 0 ? 'Today' : dt.toLocaleDateString('en-IN', { weekday: 'narrow' }), m: i === 0 ? mood : (found?.value ?? null), today: i === 0 });
    }
    return days;
  }, [insights, mood]);
  const book = useMemo(() => {
    const by = new Map<string, typeof entries>();
    for (const e of entries) { const k = dayKeyOf(e.createdAt); by.set(k, [...(by.get(k) ?? []), e]); }
    return [...by.values()].map(es => ({ es, last: [...es].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)! }));
  }, [entries]);

  return (
    <div className="screen" style={s('background:var(--bg);display:flex;flex-direction:column')}>
      <div style={s('padding:58px 20px 0;display:flex;flex-direction:column;gap:14px')}>
        <Head title="Journal" right={
          <div style={s('display:flex;gap:8px;align-items:center')}>
            <div role="tablist" aria-label="Journal views" style={s('display:flex;gap:4px;background:var(--soft);border-radius:22px;padding:4px')}>
              {(['today', 'book'] as const).map(k => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setV3({ jtab: k })} style={s(`height:36px;padding:0 14px;border-radius:18px;border:none;background:${tab === k ? 'var(--card)' : 'transparent'};font-size:14px;font-weight:700;box-shadow:${tab === k ? '0 2px 8px rgba(30,36,48,.08)' : 'none'}`)}>{k === 'today' ? 'Today' : 'Book'}</button>)}
            </div>
            <HelpButton small />
          </div>} />
        <div style={s('display:flex;justify-content:space-between')} role="list" aria-label="This week">
          {week.map((w, i) => {
            const m = w.m === null ? null : MOODS[w.m];
            return (
              <div key={i} role="listitem" aria-label={`${w.d}${m ? `, ${m.label.toLowerCase()}` : ', no check-in'}`} style={s(`width:44px;background:${w.today ? 'var(--card)' : 'transparent'};border-radius:16px;padding:8px 0;display:flex;flex-direction:column;align-items:center;gap:6px`)}>
                <span style={s('font-size:12px;color:var(--muted);font-weight:600')}>{w.d}</span>
                {w.m === null ? <span aria-hidden="true" style={s('width:28px;height:28px;border-radius:50%;border:2px dashed var(--line)')} /> : <Weather mood={w.m} size={28} />}
              </div>
            );
          })}
        </div>
      </div>

      {tab === 'today' && (
        <div data-scroll="1" style={s('flex:1;overflow:auto;padding:16px 20px 200px;display:flex;flex-direction:column;gap:6px')}>
          <span style={s('font-size:15px;color:var(--muted);font-weight:600')}>Today · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
          {todays.length === 0 && (
            <div style={s('display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--wash),var(--card));border-radius:28px;padding:16px 18px;margin:4px 0 8px;box-shadow:0 10px 26px rgba(30,36,48,.06)')}>
              <div style={s('flex:1;display:flex;flex-direction:column;gap:6px')}>
                <span className="serif" style={s('font-size:26px;line-height:1.1')}>A quiet page for today</span>
                <span style={s('font-size:15px;line-height:1.45;color:var(--muted)')}>A few lines, or say them out loud. Only you see it.</span>
              </div>
              <NotebookArt size={118} />
            </div>
          )}
          {PARTS.map((p, pi) => {
            const en = todays.filter(e => part(new Date(e.createdAt)) === p);
            return (
              <div key={p} style={s('display:flex;gap:14px')}>
                <div aria-hidden="true" style={s('flex:none;width:48px;display:flex;flex-direction:column;align-items:center;padding-top:10px')}><PartArt part={p} size={48} />{pi < PARTS.length - 1 && <span style={s('flex:1;width:2px;background:var(--line);margin-top:6px;border-radius:1px')} />}</div>
                <div style={s('flex:1;display:flex;flex-direction:column;gap:8px;padding:12px 0 14px')}>
                  <h2 className="kicker" style={s('margin:0')}>{p}</h2>
                  {en.map(e => (
                    <div key={e.id} style={s('background:var(--card);border-radius:22px;padding:14px 16px;display:flex;flex-direction:column;gap:6px;box-shadow:0 6px 16px rgba(30,36,48,.05);animation:kUp 500ms')}>
                      <div style={s('display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);font-weight:600')}><span>{new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</span><span aria-hidden="true">·</span><span>{e.mode === 'spoken' ? 'Spoken' : 'Written'}</span><span style={s('margin-left:auto;display:flex')}><Weather mood={e.mood} size={22} /></span></div>
                      <span style={s('font-size:17px;line-height:1.5;white-space:pre-wrap')}>{e.text}</span>
                    </div>
                  ))}
                  {en.length === 0 && <button onClick={() => startJournal('write')} style={s('min-height:56px;border-radius:20px;border:none;background:linear-gradient(135deg,var(--card),var(--wash));color:var(--ink);font-size:17px;font-weight:600;text-align:left;padding:0 16px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 16px rgba(30,36,48,.05)')}><span aria-hidden="true" style={s('flex:none;width:32px;height:32px;border-radius:50%;background:var(--t1);display:grid;place-items:center')}><Svg d={I.pen} size={16} /></span>How was your {p.toLowerCase()}?</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'book' && (
        <div data-scroll="1" style={s('flex:1;overflow:auto;padding:16px 20px 200px;display:flex;flex-direction:column;gap:10px')}>
          {book.length === 0 && <div style={s('display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:24px 8px')}><NotebookArt size={170} /><p className="serif" style={s('font-size:26px;line-height:1.15;margin:0')}>Your pages will gather here</p><p style={s('color:var(--muted);margin:0;line-height:1.5;font-size:17px')}>A day at a time. Nothing to catch up on.</p></div>}
          {book.map(({ es, last }) => {
            return (
              <button key={last.id} onClick={() => setV3({ sheet: { id: 'day', entryId: last.id } })} style={s('text-align:left;border:none;border-radius:22px;padding:14px 16px;background:var(--card);display:flex;gap:14px;align-items:center;box-shadow:0 6px 16px rgba(30,36,48,.05)')}>
                <Weather mood={last.mood} size={44} />
                <span style={s('flex:1;display:flex;flex-direction:column;gap:2px')}><span style={s('font-size:13px;color:var(--muted);font-weight:600')}>{new Date(last.createdAt).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span style={s('font-size:16px;font-weight:600;line-height:1.3')}>{daySummary(es)}</span></span>
                <span style={s('font-size:13px;color:var(--muted)')}>{es.length} {es.length === 1 ? 'note' : 'notes'}</span>
              </button>
            );
          })}
          {next && <button onClick={() => void loadMoreJournal()} style={s('height:48px;border:none;background:none;color:var(--accent-ink);font-size:15px;font-weight:700')}>Show earlier pages</button>}
        </div>
      )}

      <div style={s('position:absolute;left:20px;right:20px;bottom:108px;display:flex;gap:10px')}>
        <button onClick={() => startJournal('write')} data-track="journal.write" style={s('flex:1;height:56px;border-radius:28px;border:none;background:var(--card);font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 24px rgba(30,36,48,.1)')}><Svg d={I.pen} size={18} stroke="var(--ink)" />Write</button>
        <button onClick={() => { startJournal('speak'); setTimeout(() => toggleDictation(), 300); }} data-track="journal.speak" style={s('flex:1;height:56px;border-radius:28px;border:none;background:var(--accent);color:#FFFFFF;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 10px 24px rgba(47,42,94,.3)')}><Svg d={I.mic} size={18} stroke="#FFFFFF" />Speak</button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ a new page
const PROMPTS = ['What’s on my mind', 'One good thing', 'What I need', 'Tomorrow I’ll…'];

export function Compose() {
  const stage = useStore(x => x.jStage);
  const text = useStore(x => x.jText);
  const prompt = useStore(x => x.jPrompt);
  const share = useStore(x => x.jShare);
  const remember = useStore(x => x.consent?.remember ?? false);
  const dictating = useStore(x => x.dictating);
  const busy = useStore(x => x.dictBusy);
  const err = useStore(x => x.jError);
  const comp = useStore(x => x.compName);
  const look = useStore(x => x.look);
  const close = () => { stopDictation(); set({ jResult: null }); go('journal'); };
  const when = `Today · ${part(new Date())}`;
  return (
    <div className="screen" role="main" aria-label="New journal entry" style={{ ...s('background:#FFFDF8;display:flex;flex-direction:column;padding:52px 20px 32px') }}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <button onClick={close} style={s('height:44px;border:none;background:none;font-size:16px;font-weight:600;color:var(--muted);padding:0')}>{stage === 'edit' ? 'Cancel' : 'Close'}</button>
        <span style={s('font-size:14px;font-weight:700;color:var(--muted)')}>{when}</span>
        {stage === 'edit' ? <button onClick={() => void saveJournal()} disabled={!text.trim()} data-track="journal.save" style={s(`height:44px;padding:0 18px;border-radius:22px;border:none;background:${text.trim() ? 'var(--accent)' : '#B8B3CC'};color:#FFFFFF;font-size:15px;font-weight:700`)}>Save</button> : <span style={{ width: 60 }} />}
      </div>

      {stage === 'edit' && (
        <>
          <div role="group" aria-label="Prompts" style={s('display:flex;gap:6px;overflow-x:auto;margin:14px -20px 0;padding:0 20px')}>
            {PROMPTS.map(p => <button key={p} aria-pressed={prompt === p} onClick={() => set({ jPrompt: p, jText: text ? text : `${p}: ` })} style={s(`flex:none;height:44px;padding:0 14px;border-radius:22px;border:none;background:${prompt === p ? 'var(--p-butter)' : 'var(--soft)'};font-size:14px;font-weight:600`)}>{p}</button>)}
          </div>
          <textarea aria-label="Journal entry" value={text} onChange={e => set({ jText: e.target.value })} placeholder="Write anything. Only you see this." style={{ ...s('flex:1;margin-top:16px;width:100%;border:none;outline:none;resize:none;background:transparent;font-family:var(--serif);font-size:24px;line-height:1.4;color:var(--ink)') }} />
          {err && <div role="alert" style={s('color:var(--help);font-size:14px;padding:4px 0')}>{err}</div>}
          <button role="switch" aria-checked={share} disabled={!remember} onClick={() => set({ jShare: !share })} style={s(`display:flex;align-items:center;gap:12px;text-align:left;border:none;background:#F7F2E8;border-radius:18px;padding:12px 14px;margin-bottom:12px;opacity:${remember ? 1 : 0.65}`)}>
            <span style={s('flex:1;font-size:14px;line-height:1.35')}><b>{share ? `${comp} can learn from this` : 'Just for me'}</b><br /><span style={s('color:var(--muted)')}>{remember ? (share ? 'You’ll choose what it remembers before anything is saved.' : 'Saved, and never read.') : 'Turn on “Let Flint remember what I share” in You to let me learn.'}</span></span>
            <span aria-hidden="true" style={s(`flex:none;width:48px;height:30px;border-radius:15px;background:${share ? 'var(--accent)' : 'var(--line)'};position:relative`)}><span style={s(`position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:var(--card);transform:${share ? 'translateX(18px)' : 'none'};transition:transform 300ms`)} /></span>
          </button>
          <div style={s('display:flex;flex-direction:column;align-items:center;gap:8px')}>
            <button onClick={toggleDictation} aria-label={dictating ? 'Listening. Tap to stop.' : 'Tap and speak'} data-track="journal.dictate" style={s(`position:relative;width:76px;height:76px;border-radius:50%;border:none;background:${dictating ? '#C9654A' : 'var(--accent)'};display:grid;place-items:center`)}>
              {dictating && <span aria-hidden="true" style={s('position:absolute;inset:0;border-radius:50%;border:2px solid #E8896B;animation:kRing 1.6s ease-out infinite')} />}
              <Svg d={I.mic} size={28} stroke="#FFFFFF" sw={2} style={{ position: 'relative' }} />
            </button>
            <span role="status" style={s('font-size:14px;color:var(--muted);font-weight:600')}>{dictating ? 'Listening · tap to stop' : busy ? 'Writing down the last bit…' : 'Tap and speak'}</span>
          </div>
        </>
      )}
      {stage === 'saving' && <div role="status" style={s('flex:1;display:grid;place-items:center;color:var(--muted)')}>Saving…</div>}
      {stage === 'thinking' && (
        <div role="status" style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px')}>
          <div style={s('width:120px;height:120px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:flex;justify-content:center;align-items:flex-end')}><Companion look={look} size={120} mode="thinking" /></div>
          <span className="serif" style={s('font-size:26px;color:var(--muted)')}>Reading it…</span>
        </div>
      )}
      {stage === 'review' && <Review />}
    </div>
  );
}

function Review() {
  const r = useStore(x => x.jResult) as JournalResult | null;
  const look = useStore(x => x.look);
  const comp = useStore(x => x.compName);
  if (!r) return null;
  const flip = (id: number) => set(p => ({ jResult: p.jResult && { ...p.jResult, keep: p.jResult.keep.includes(id) ? p.jResult.keep.filter(k => k !== id) : [...p.jResult.keep, id] } }));
  const flipOpt = (k: 'hookOn' | 'stepOn') => set(p => ({ jResult: p.jResult && { ...p.jResult, [k]: !p.jResult[k] } }));
  const Check = ({ on }: { on: boolean }) => <span aria-hidden="true" style={s(`flex:none;width:26px;height:26px;border-radius:50%;border:2px solid var(--ink);background:${on ? 'var(--accent)' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={13} stroke="#FFFFFF" sw={3} style={{ opacity: on ? 1 : 0 }} /></span>;
  const row = (on: boolean) => s(`min-height:56px;border-radius:18px;border:none;background:${on ? 'var(--p-mint)' : 'var(--card)'};display:flex;align-items:center;gap:12px;padding:10px 16px;text-align:left;font-size:16px;font-weight:600`);
  return (
    <div data-scroll="1" style={s('flex:1;overflow:auto;display:flex;flex-direction:column;gap:14px;padding-top:24px;animation:kUp 500ms')}>
      <div style={s('display:flex;gap:12px;align-items:flex-start')}>
        <div style={s('flex:none;width:48px;height:48px;border-radius:50%;overflow:hidden;background:#F3EEFA;display:grid;place-items:center')}><Companion look={look} size={48} /></div>
        <p className="serif" style={s('font-size:26px;line-height:1.25;margin:0')}>{r.noticed}</p>
      </div>
      {r.careFlag && (
        <section aria-label="Support" style={s('background:#FFF1E8;border:1px solid #F0B79C;border-radius:20px;padding:14px;display:flex;flex-direction:column;gap:10px')}>
          <b>That sounds really heavy.</b>
          <span style={s('font-size:15px;line-height:1.4')}>Would it help to talk to a real person? It’s free, any time. I’m here too.</span>
          <div style={s('display:flex;gap:8px')}>
            <button onClick={() => openSheet('support')} style={s('flex:1;height:44px;border-radius:22px;border:none;background:#9A3B1E;color:#FFFFFF;font-weight:700')}>See helplines</button>
            <button onClick={() => void startCall('voice')} style={s('flex:1;height:44px;border-radius:22px;border:none;background:var(--card);font-weight:700')}>Talk with {comp}</button>
          </div>
        </section>
      )}
      <h2 className="kicker" style={s('margin:10px 0 0')}>Remember this?</h2>
      {r.memories.length === 0 && <p style={s('color:var(--muted);margin:0;font-size:14px')}>Nothing to remember from this one.</p>}
      {r.memories.map(m => { const on = r.keep.includes(m.id); return (
        <button key={m.id} role="checkbox" aria-checked={on} onClick={() => flip(m.id)} style={row(on)}><Check on={on} /><span style={s('flex:1')}>{m.text}{m.sensitive && <span style={s('display:block;font-size:12px;font-weight:500;color:var(--muted)')}>This feels personal, so it’s off unless you choose it.</span>}</span></button>
      ); })}
      <h2 className="kicker" style={s('margin:10px 0 0')}>Turn into a tiny step?</h2>
      <button role="checkbox" aria-checked={r.stepOn} onClick={() => flipOpt('stepOn')} style={row(r.stepOn)}><Check on={r.stepOn} /><span style={s('flex:1')}>{r.step}</span></button>
      <button role="checkbox" aria-checked={r.hookOn} onClick={() => flipOpt('hookOn')} style={row(r.hookOn)}><Check on={r.hookOn} /><span style={s('flex:1')}>Ask me about it next time<span style={s('display:block;font-size:13px;font-weight:500;color:var(--muted);font-style:italic')}>“{r.hook}”</span></span></button>
      <button onClick={() => void finishJournal()} data-track="journal.done" style={s('margin-top:auto;min-height:58px;border-radius:29px;border:none;background:var(--accent);color:#FFFFFF;font-size:17px;font-weight:700;flex:none')}>Done</button>
      <button onClick={() => void keepPrivate()} style={s('min-height:48px;border:none;background:none;color:var(--muted);font-size:15px;font-weight:600;flex:none')}>Keep it just for me</button>
    </div>
  );
}
