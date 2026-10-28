import { useEffect } from 'react';
import { C, MOODS, serif, shadow } from '../theme';
import { dayOf, set, useStore, type JournalResult } from '../state/store';
import { finishJournal, go, keepPrivate, loadInsights, loadJournal, loadMoreJournal, openSheet, saveJournal, startCall, startJournal, toggleDictation } from '../state/actions';
import { speechLocale, stopDictation } from '../audio/dictation';
import { moodIndexFor } from '@saathi/domain';
import { Orb, useReduceMotion } from '../components/figures';
import { P, Svg } from '../components/icons';
import { HelpPill, Chip, Scroll, Segmented, Switch, TextButton, PrimaryButton, flex } from '../components/ui';

export function JournalTabs({ active }: { active: 'journal' | 'journey' }) {
  return (
    <div style={{ padding: 'var(--head-pad) 24px 0', ...flex('column', 16) }}>
      <div style={{ ...flex('row'), alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, margin: 0 }}>Journal</h1>
        <HelpPill />
      </div>
      <Segmented<'journal' | 'journey'> label="Journal view" options={[{ value: 'journal', label: 'Entries' }, { value: 'journey', label: 'Insights' }]} value={active} onChange={v => { if (v !== active) go(v); }} />
    </div>
  );
}

export function JournalList() {
  const entries = useStore(s => s.jEntries);
  const compName = useStore(s => s.compName);
  const more = useStore(s => s.jNext);
  useEffect(() => { void loadJournal(); }, []);
  return (
    <main aria-label="Journal entries" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <JournalTabs active="journal" />
      <Scroll pad="20px 24px var(--scroll-bottom)">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
          <button data-track="journal.write" onClick={() => startJournal('write')} style={{ textAlign: 'left', border: 'none', borderRadius: 28, padding: 18, background: C.white, boxShadow: shadow.card, ...flex('column', 8) }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: C.peach, display: 'grid', placeItems: 'center' }}><Svg d={P.pen} /></span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Write</span>
            <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>Type at your own pace, with a prompt if you like.</span>
          </button>
          <button data-track="journal.talk_it_out" onClick={() => startJournal('speak')} style={{ textAlign: 'left', border: 'none', borderRadius: 28, padding: 18, background: C.teal, color: C.white, boxShadow: '0 12px 32px rgba(63,122,112,.25)', ...flex('column', 8) }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center' }}><Svg d={P.mic} stroke="#FFFFFF" /></span>
            <span style={{ fontSize: 17, fontWeight: 600 }}>Talk it out</span>
            <span style={{ fontSize: 13, color: C.white, lineHeight: 1.4 }}>Just speak. I’ll write it down for you.</span>
          </button>
        </div>
        <div style={{ ...flex('row', 10), alignItems: 'flex-start', padding: '2px 4px 0', fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
          <Svg d={P.lock} size={16} stroke={C.muted} style={{ flex: 'none', marginTop: 1 }} />
          <span>Private by default. For each entry, you choose what {compName} learns.</span>
        </div>
        <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: '12px 0 0' }}>Recent entries</h2>
        {entries.map(e => {
          const m = MOODS[e.mood];
          return (
            <button key={e.id} onClick={() => set({ sheet: 'jread', jReadId: e.id })} style={{ textAlign: 'left', border: 'none', background: C.white, borderRadius: 28, padding: '18px 20px', boxShadow: shadow.cardSoft, ...flex('column', 8) }}>
              <div style={{ ...flex('row', 10), alignItems: 'center' }}>
                <span aria-label={m.label} style={{ width: 14, height: 14, borderRadius: m.radius, background: m.color, flex: 'none' }} />
                <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{dayOf(e.createdAt)}</span>
                <span style={{ fontSize: 13, color: C.muted }}>{e.mode === 'spoken' ? 'Spoken' : 'Written'}</span>
              </div>
              <span style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.5 }}>{e.text.length > 120 ? e.text.slice(0, 118) + '…' : e.text}</span>
              <span style={{ fontSize: 13, color: e.shared ? C.teal : C.muted, fontWeight: 600 }}>{e.shared ? `${compName} can learn from this` : 'Just for you'}</span>
            </button>
          );
        })}
        {entries.length === 0 && <span style={{ fontSize: 15, color: C.muted }}>Nothing here yet. Whenever you like.</span>}
        {more && <TextButton onClick={() => void loadMoreJournal()}>Show older entries</TextButton>}
      </Scroll>
    </main>
  );
}

const PROMPTS = ['What’s taking up space today?', 'One thing that felt okay', 'Something I didn’t say', 'What I need right now'];

export function JournalCompose() {
  const stage = useStore(s => s.jStage);
  return (
    <main aria-label="New journal entry" style={{ position: 'absolute', inset: 0, ...flex('column'), background: 'linear-gradient(180deg,#F3ECE1 0%,#FBF7F0 40%)' }}>
      <Header />
      {stage === 'edit' && <Edit />}
      {stage === 'thinking' && (
        <div role="status" style={{ flex: 1, ...flex('column', 20), alignItems: 'center', justifyContent: 'center' }}>
          <Orb size={96} mode="thinking" />
          <span style={{ fontFamily: serif, fontSize: 22, color: C.muted }}>Reading it gently…</span>
        </div>
      )}
      {stage === 'review' && <Review />}
    </main>
  );
}

function Header() {
  const stage = useStore(s => s.jStage);
  const now = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return (
    <div style={{ ...flex('row', 8), alignItems: 'center', padding: 'var(--head-pad) 16px 0' }}>
      <button onClick={() => { stopDictation(); set({ jResult: null }); go('journal'); }} style={{ height: 44, padding: '0 8px', border: 'none', background: 'none', color: C.teal, fontSize: 17, fontWeight: 600 }}>{stage === 'edit' ? 'Cancel' : 'Close'}</button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 15, color: C.muted }}>Today, {now}</div>
      <HelpPill />
    </div>
  );
}

function Edit() {
  const mode = useStore(s => s.jMode);
  const text = useStore(s => s.jText);
  const prompt = useStore(s => s.jPrompt);
  const share = useStore(s => s.jShare);
  const dictating = useStore(s => s.dictating);
  useStore(s => s.dictLang);
  const compName = useStore(s => s.compName);
  const reduce = useReduceMotion();
  const speak = mode === 'speak';

  return (
    <>
      <div style={{ padding: '16px 24px 0', ...flex('column', 12) }}>
        <Segmented<'write' | 'speak'> label="Entry mode" tone="sandDark" options={[{ value: 'write', label: 'Write' }, { value: 'speak', label: 'Talk it out' }]} value={mode} onChange={v => { if (v === 'write') stopDictation(); set({ jMode: v }); }} />
        <div role="group" aria-label="Prompts" style={{ ...flex('row', 8), overflowX: 'auto', margin: '0 -24px', padding: '0 24px' }}>
          {PROMPTS.map(p => <Chip key={p} label={p} on={prompt === p} onClick={() => set({ jPrompt: prompt === p ? null : p })} />)}
        </div>
      </div>
      <div style={{ flex: 1, ...flex('column'), padding: '16px 24px 0', minHeight: 0 }}>
        {prompt && <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 20, color: C.muted, marginBottom: 8 }}>{prompt}</div>}
        <textarea aria-label="Journal entry" value={text} onChange={e => set({ jText: e.target.value })} placeholder={speak ? 'Tap the microphone and just talk. I’ll write it down.' : 'Whatever’s on your mind. No one else reads this.'}
          style={{ flex: 1, minHeight: 0, width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', fontFamily: serif, fontSize: 20, lineHeight: 1.6, color: C.ink, padding: 0 }} />
      </div>
      {speak && (
        <div style={{ ...flex('column', 10), alignItems: 'center', padding: '8px 0 4px' }}>
          <button onClick={toggleDictation} aria-label={dictating ? 'Listening. Tap to stop.' : text ? 'Tap to keep talking' : 'Tap to start talking'} style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', border: 'none', background: dictating ? C.tealDark : C.teal, display: 'grid', placeItems: 'center', boxShadow: '0 12px 30px rgba(63,122,112,.3)' }}>
            {dictating && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #7FC4B5', animation: reduce ? 'sFade 2s infinite' : 'sRing 2s cubic-bezier(.22,.61,.36,1) infinite' }} />}
            <Svg d={dictating ? P.stop : P.mic} size={30} stroke="#FFFFFF" sw={1.9} style={{ position: 'relative' }} />
          </button>
          <span role="status" style={{ fontSize: 15, color: C.muted }}>{dictating ? 'Listening. Tap to stop.' : text ? 'Tap to keep talking' : 'Tap to start talking'}</span>
          {!dictating && (
            <div role="group" aria-label="Language you’re speaking" style={{ ...flex('row', 8) }}>
              <Chip label="English" on={speechLocale() === 'en-IN'} onClick={() => set({ dictLang: 'en' })} />
              <Chip label="हिन्दी" on={speechLocale() === 'hi-IN'} onClick={() => set({ dictLang: 'hi' })} />
            </div>
          )}
        </div>
      )}
      <div style={{ padding: '12px 24px calc(var(--sa-bottom) + 24px)', ...flex('column', 10) }}>
        <button role="switch" aria-checked={share} onClick={() => set({ jShare: !share })} style={{ ...flex('row', 14), alignItems: 'center', background: C.white, borderRadius: 24, padding: '12px 16px', border: 'none', textAlign: 'left' }}>
          <span style={{ flex: 1, ...flex('column', 2) }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{share ? `${compName} can learn from this` : 'Just for me'}</span>
            <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{share ? 'You’ll see what I noticed and choose what I remember.' : 'Saved privately. I won’t read it or remember it.'}</span>
          </span>
          <Switch on={share} />
        </button>
        <PrimaryButton onClick={() => void saveJournal()} style={text.trim() ? undefined : { background: C.tealSoft, color: C.tealDark }}>Save</PrimaryButton>
      </div>
    </>
  );
}

function Review() {
  const r = useStore(s => s.jResult) as JournalResult | null;
  const compName = useStore(s => s.compName);
  if (!r) return null;
  const m = MOODS[moodIndexFor(r.mood)];
  const flip = (id: number) => set(p => ({ jResult: p.jResult && { ...p.jResult, keep: p.jResult.keep.includes(id) ? p.jResult.keep.filter(k => k !== id) : [...p.jResult.keep, id] } }));
  const flipOpt = (k: 'hookOn' | 'stepOn') => set(p => ({ jResult: p.jResult && { ...p.jResult, [k]: !p.jResult[k] } }));
  return (
    <Scroll pad="20px 24px 40px">
      <h2 style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.2, fontWeight: 400, margin: 0 }}>What I noticed</h2>
      <div style={{ ...flex('row', 12), alignItems: 'flex-start' }}>
        <span aria-label={m.label} style={{ flex: 'none', width: 22, height: 22, marginTop: 4, borderRadius: m.radius, background: m.color }} />
        <span style={{ fontSize: 17, lineHeight: 1.55, textWrap: 'pretty' }}>{r.noticed}</span>
      </div>
      {r.careFlag && (
        <section aria-label="Support" style={{ background: C.amber, border: `1px solid ${C.amberLine}`, borderRadius: 24, padding: '16px 18px', ...flex('column', 10) }}>
          <span style={{ fontSize: 17, fontWeight: 600 }}>That sounds really heavy.</span>
          <span style={{ fontSize: 15, lineHeight: 1.45, color: C.amberText }}>Would it help to talk to a real person? It’s free, any time. I’m here too.</span>
          <div style={flex('row', 8)}>
            <button onClick={() => openSheet('helplines')} style={{ flex: 1, height: 48, borderRadius: 24, border: 'none', background: C.ink, color: C.white, fontSize: 15, fontWeight: 600 }}>See helplines</button>
            <button onClick={() => void startCall('voice')} style={{ flex: 1, height: 48, borderRadius: 24, border: `1.5px solid ${C.amberLine}`, background: C.white, color: C.ink, fontSize: 15, fontWeight: 600 }}>Talk with {compName}</button>
          </div>
        </section>
      )}
      <section style={{ background: C.white, borderRadius: 28, padding: '18px 20px', ...flex('column', 4), boxShadow: shadow.cardSoft }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Remember this?</h3>
        <span style={{ fontSize: 15, color: C.muted, marginBottom: 4 }}>Only what you pick is saved. Edit it later in Memory.</span>
        {r.memories.map(mm => {
          const keep = r.keep.includes(mm.id);
          return (
          <div key={mm.id} style={{ ...flex('row', 12), alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.rule}` }}>
            <div style={{ flex: 1, ...flex('column', 3) }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{mm.theme}</span>
              <span style={{ fontSize: 17, lineHeight: 1.45 }}>{mm.text}</span>
              {mm.sensitive && <span style={{ fontSize: 13, color: C.amberText }}>This feels personal, so it’s off unless you choose it.</span>}
            </div>
            <button aria-pressed={keep} onClick={() => flip(mm.id)} style={{ flex: 'none', height: 40, padding: '0 14px', borderRadius: 20, border: `1.5px solid ${keep ? C.teal : C.tealLine}`, background: keep ? C.teal : C.white, color: keep ? C.white : C.teal, fontSize: 15, fontWeight: 600 }}>{keep ? 'Saved' : 'Save'}</button>
          </div>
          );
        })}
        {r.memories.length === 0 && <span style={{ fontSize: 15, color: C.muted }}>Nothing to remember from this one.</span>}
      </section>
      <button role="switch" aria-checked={r.hookOn} onClick={() => flipOpt('hookOn')} style={{ background: C.white, borderRadius: 28, padding: '18px 20px', ...flex('row', 14), alignItems: 'center', boxShadow: shadow.cardSoft, border: 'none', textAlign: 'left' }}>
        <span style={{ flex: 1, ...flex('column', 4) }}><span style={{ fontSize: 17, fontWeight: 600 }}>Next time we talk</span><span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 17, lineHeight: 1.45 }}>“{r.hook}”</span></span>
        <Switch on={r.hookOn} />
      </button>
      <button role="switch" aria-checked={r.stepOn} onClick={() => flipOpt('stepOn')} style={{ background: C.white, borderRadius: 28, padding: '18px 20px', ...flex('row', 14), alignItems: 'center', boxShadow: shadow.cardSoft, border: 'none', textAlign: 'left' }}>
        <span style={{ flex: 1, ...flex('column', 4) }}><span style={{ fontSize: 17, fontWeight: 600 }}>A small step for tomorrow</span><span style={{ fontSize: 17, lineHeight: 1.45 }}>{r.step}</span></span>
        <Switch on={r.stepOn} />
      </button>
      <PrimaryButton onClick={() => void finishJournal()} style={{ marginTop: 4 }}>Done</PrimaryButton>
      <TextButton onClick={() => void keepPrivate()}>Keep it just for me</TextButton>
    </Scroll>
  );
}

// ---- Insights -------------------------------------------------------------------------------
const W = 302, H = 130;
function chartPaths(values: number[]) {
  if (values.length < 2) return null;
  const pts = values.map((v, i) => [(i * W) / (values.length - 1), H - 14 - (v / 4) * (H - 28)] as const);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2;
    d += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return { line: d, area: `${d} L${W},${H} L0,${H} Z` };
}

const weekdayLetter = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' });

export function Insights() {
  const day = useStore(s => s.day);
  const ins = useStore(s => s.insights);
  const letter = useStore(s => s.letter);
  useEffect(() => { void loadInsights(); }, []);

  const series = ins?.moodSeries ?? [];
  const chart = chartPaths(series.map(p => p.value));
  const last7 = series.slice(-7);
  const wins = ins?.wins ?? [];
  const enough = (ins?.daysOfData ?? 0) >= 3;

  return (
    <main aria-label="Insights" style={{ position: 'absolute', inset: 0, ...flex('column'), background: C.paper }}>
      <JournalTabs active="journey" />
      <Scroll pad="24px 24px var(--scroll-bottom)">
        <section style={{ background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.cardSoft, ...flex('column', 12) }}>
          <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>The last four weeks</h2>
          <span style={{ fontSize: 15, color: C.muted, marginTop: -8 }}>From your mood taps, check-ins and journal.</span>
          {chart ? (
            <div style={{ position: 'relative' }}>
              <svg width="100%" height="130" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }} role="img" aria-label="Your mood over the last four weeks">
                <defs><linearGradient id="sMoodFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#B7B1E6" stopOpacity=".75" /><stop offset="1" stopColor="#CFE3F0" stopOpacity=".15" /></linearGradient></defs>
                <path d={chart.area} fill="url(#sMoodFill)" />
                <path d={chart.line} fill="none" stroke="#5A5493" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ position: 'absolute', top: 0, right: 0, fontSize: 13, color: C.muted }}>lighter days</span>
              <span style={{ position: 'absolute', bottom: 0, right: 0, fontSize: 13, color: C.muted }}>heavier days</span>
            </div>
          ) : (
            <div role="status" style={{ fontSize: 15, lineHeight: 1.5, color: C.muted }}>Nothing to draw yet. A few mood taps over the next days and a picture will start to form. No pressure.</div>
          )}
          {last7.length > 0 && (
            <>
              <div role="group" aria-label="Recent days" style={{ display: 'grid', gridTemplateColumns: `repeat(${last7.length},minmax(0,1fr))`, gap: 4 }}>
                {last7.map((p, i) => (
                  <button key={p.day} aria-pressed={day === i} onClick={() => set({ day: i })} style={{ height: 44, borderRadius: 22, border: 'none', background: day === i ? C.nightMid : C.sand, color: day === i ? C.white : C.ink, fontSize: 15, fontWeight: 600 }}>{weekdayLetter(p.day)}</button>
                ))}
              </div>
              <div role="status" style={{ fontSize: 15, lineHeight: 1.5, color: C.muted, minHeight: 44, textWrap: 'pretty' }}>{day === null || !last7[day] ? 'Tap a day to read it.' : `${dayOf(last7[day].day)}: ${MOODS[last7[day].value].label.toLowerCase()}.`}</div>
            </>
          )}
        </section>

        <section style={{ background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.cardSoft, ...flex('column', 12) }}>
          <h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>Rhythms</h2>
          {enough && ins && ins.rhythms.length > 0
            ? ins.rhythms.map(r => <span key={r} style={{ fontSize: 17, lineHeight: 1.5 }}>{r}</span>)
            : <span style={{ fontSize: 15, color: C.muted, lineHeight: 1.5 }}>I only point out patterns once there are a few days to see them in. Nothing yet, and that’s fine.</span>}
        </section>

        <section style={{ background: C.white, borderRadius: 28, padding: 20, boxShadow: shadow.cardSoft, ...flex('column', 10) }}>
          <div style={{ ...flex('column', 2), marginBottom: 4 }}><h2 style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, margin: 0 }}>Wins</h2><span style={{ fontSize: 15, color: C.muted }}>Small things you did. They count.</span></div>
          {wins.map(w => (
            <div key={w.id} style={{ ...flex('row', 12), alignItems: 'baseline', fontSize: 17, lineHeight: 1.45 }}>
              <span aria-hidden style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: '#F1A56B', transform: 'translateY(-2px)' }} />
              <span style={{ flex: 1 }}>{w.label}</span><span style={{ fontSize: 15, color: C.muted }}>{dayOf(w.createdAt)}</span>
            </div>
          ))}
          {wins.length === 0 && <span style={{ fontSize: 15, color: C.muted }}>They’ll show up here as they happen.</span>}
        </section>

        {letter && (
          <button onClick={() => openSheet('letter')} style={{ textAlign: 'left', border: 'none', borderRadius: 28, padding: '22px 20px', background: C.sand, ...flex('column', 6), boxShadow: '0 4px 0 -1px #EAE0D1,0 8px 0 -2px #E2D7C6' }}>
            <span style={{ fontSize: 15, color: C.muted }}>Sunday letter · {dayOf(letter.createdAt)}</span>
            <span style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.3 }}>“{letter.body.split(/(?<=[.!?])\s/)[0]}…”</span>
          </button>
        )}
      </Scroll>
    </main>
  );
}
