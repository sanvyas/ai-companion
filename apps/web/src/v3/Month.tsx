import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FEELINGS, FEELING_LABEL, KIND_INFO, SONG_ROWS, futureYou, guideStats, letterBody, lyricFor, modeFor, monthWeeks, noticedFor,
  type Feeling, type MonthKind, type MonthMode,
} from '@saathi/domain';
import { stopSpeech, say } from '../audio/speech';
import { addPlanItem, loadToday, togglePlan } from '../state/actions';
import { useStore } from '../state/store';
import { logActivity } from './actions';
import { s } from './css';
import { I, Svg } from './icons';
import { loadMonthData, useMonthData } from './month-data';
import { NOTE_BG, NOTE_ROT } from './moods';
import { setV3, useV3 } from './ui';

const MODE_INFO: Record<MonthMode, { label: string; name: string; desc: string; bg: string; fg: string; dark: boolean }> = {
  song: { label: 'Song', name: 'Your month as a song', desc: 'Each day adds a sound and a lyric. Four weeks, one album.', bg: 'linear-gradient(180deg,#1C1838 0%,#2F2A5E 100%)', fg: '#FFFFFF', dark: true },
  letters: { label: 'Letters', name: 'Letters, day by day', desc: 'A stamp a day in a weekly envelope. A letter every Sunday.', bg: '#F4EEE3', fg: '#1E2430', dark: false },
  future: { label: 'Future you', name: 'Future you comes into focus', desc: 'A year-from-now you gets clearer with each small thing.', bg: '#FBF1E8', fg: '#1E2430', dark: false },
  guide: { label: 'What works', name: 'Your what-works guide', desc: 'Saathi learns what lifts your mood and writes it down.', bg: '#FAF6EF', fg: '#1E2430', dark: false },
};
const ORDER: MonthMode[] = ['song', 'letters', 'future', 'guide'];
const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STYLES = ['Lo-fi', 'Acoustic', 'Piano', 'Upbeat'] as const;
const COVERS = ['linear-gradient(135deg,#F2B33D,#E8896B)', 'linear-gradient(135deg,#7FD1C3,#3B8FC0)', 'linear-gradient(135deg,#D9708F,#6F6BB8)', 'linear-gradient(135deg,#93C48A,#3E7F4C)'];
const ADD: MonthKind[] = ['walk', 'friend', 'out', 'sleep', 'breathe', 'play'];

// What they edit in the song (its title, its style, a line they rewrote) stays on this phone: it is theirs, not data.
const KEY = 'saathi.v3.song';
interface Song { titles: Record<string, string>; styles: Record<string, string>; lines: Record<string, string>; turns: Record<string, number> }
const readSong = (): Song => { try { return { titles: {}, styles: {}, lines: {}, turns: {}, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Song>) }; } catch { return { titles: {}, styles: {}, lines: {}, turns: {} }; } };
const writeSong = (v: Song) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* blocked: they simply stay for this visit */ } };

export function MonthTab() {
  const month = useMonthData();
  const view = useV3(x => x.view);
  const plan = useStore(x => x.plan);
  const nick = useStore(x => x.nick);
  const letter = useStore(x => x.letter);
  const [newStep, setNewStep] = useState('');
  useEffect(() => { void loadMonthData(); void loadToday(); }, []);

  const today = month?.today ?? new Date().toLocaleDateString('en-CA');
  const weeks = useMemo(() => monthWeeks(today), [today]);
  const byDay = useMemo(() => new Map((month?.days ?? []).map(d => [d.day, d.kinds])), [month]);
  const kindsOn = (day: string) => byDay.get(day) ?? [];
  const mode = view ?? (month ? modeFor(month.signedUp, today) : 'song');
  const own = month ? modeFor(month.signedUp, today) : 'song';
  const info = MODE_INFO[mode];
  const total = weeks.flatMap(w => w.days).reduce((n, d) => n + kindsOn(d.day).length, 0);
  const todayKinds = kindsOn(today);
  const next = MODE_INFO[ORDER[(ORDER.indexOf(own) + 1) % 4]];

  return (
    <div className="screen" data-scroll="1" style={{ ...s(`overflow:auto;background:${info.bg};color:${info.fg};display:flex;flex-direction:column;padding:58px 20px 120px;gap:14px;transition:background 600ms`) }}>
      <header style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:10px')}>
        <div style={s('display:flex;flex-direction:column;gap:4px')}>
          <span style={s('font-size:13px;font-weight:700;opacity:.8;letter-spacing:.06em;text-transform:uppercase')}>{mode === own ? 'This month' : 'Another way to see it'} · {info.label}</span>
          <h1 className="serif" style={s('font-size:38px;line-height:1;margin:0')}>{info.name}</h1>
          <p style={s('font-size:15px;opacity:.85;line-height:1.4;margin:0')}>{info.desc}</p>
        </div>
      </header>

      <div role="tablist" aria-label="Ways to see this month" style={s('display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px')}>
        {ORDER.map(m => {
          const on = m === mode;
          return (
            <button key={m} role="tab" aria-selected={on} onClick={() => { stopSpeech(); setV3({ view: m === own ? null : m }); }} style={s(`border:none;border-radius:16px;padding:8px 4px;min-height:48px;background:${on ? (info.dark ? '#F2B33D' : '#2F2A5E') : (info.dark ? 'rgba(255,255,255,.12)' : '#FFFFFF')};color:${on ? (info.dark ? '#1C1838' : '#FFFFFF') : 'inherit'};display:flex;flex-direction:column;align-items:center;gap:2px`)}>
              <span style={s('font-size:11px;font-weight:700;opacity:.8')}>{m === own ? 'This month' : 'Try'}</span><span style={s('font-size:13px;font-weight:700')}>{MODE_INFO[m].label}</span>
            </button>
          );
        })}
      </div>

      {mode === 'song' && <SongView weeks={weeks} kindsOn={kindsOn} today={today} />}
      {mode === 'letters' && <LettersView weeks={weeks} kindsOn={kindsOn} today={today} nick={nick} letterText={letter?.body ?? null} />}
      {mode === 'future' && <FutureView points={total} />}
      {mode === 'guide' && <GuideView help={month?.help ?? []} />}

      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-top:6px')}><h2 style={s('font-size:12px;font-weight:700;opacity:.8;letter-spacing:.06em;text-transform:uppercase;margin:0')}>Add something you did today</h2></div>
      <div style={s('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px')}>
        {ADD.map(k => {
          const done = todayKinds.includes(k);
          return (
            <button key={k} disabled={done} onClick={() => { logActivity(k); void loadMonthData(); }} data-track={`month.add.${k}`} style={s(`min-height:48px;border-radius:14px;border:none;background:${info.dark ? 'rgba(255,255,255,.12)' : '#FFFFFF'};color:inherit;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;opacity:${done ? 0.6 : 1}`)}>
              <span aria-hidden="true" style={s(`width:10px;height:10px;border-radius:50%;background:${KIND_INFO[k].color}`)} />{done ? `${KIND_INFO[k].label} ✓` : KIND_INFO[k].label}
            </button>
          );
        })}
      </div>

      <div style={s(`border-radius:22px;padding:14px 16px;background:${info.dark ? 'rgba(255,255,255,.08)' : '#FFFFFF'}`)}>
        <span style={s('font-size:12px;font-weight:700;opacity:.8')}>COMING NEXT MONTH</span><br />
        <span style={s('font-size:16px;font-weight:700')}>{next.name}</span><br />
        <span style={s('font-size:13px;opacity:.85')}>Your month changes shape, so it never gets old.</span>
      </div>

      <h2 style={s('font-size:12px;font-weight:700;opacity:.8;letter-spacing:.06em;text-transform:uppercase;margin:6px 0 0')}>Tiny steps</h2>
      <form onSubmit={e => { e.preventDefault(); const t = newStep.trim(); if (t) { void addPlanItem(t); setNewStep(''); } }} style={s('display:flex;gap:8px')}>
        <input aria-label="A tiny step" value={newStep} onChange={e => setNewStep(e.target.value)} placeholder="Add a tiny step…" maxLength={120} style={s('flex:1;height:52px;border-radius:26px;border:none;background:#FFFFFF;color:#1E2430;padding:0 20px;font-size:16px;outline:none')} />
        <button type="submit" aria-label="Add step" style={s('flex:none;width:52px;height:52px;border-radius:50%;border:none;background:#F2B33D;display:grid;place-items:center')}><Svg d={I.plus} size={20} stroke="#1C1838" sw={2.2} /></button>
      </form>
      <div style={s('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding-top:4px;color:#1E2430')}>
        {[...plan].sort((a, b) => Number(a.done) - Number(b.done)).map((p, i) => (
          <button key={p.id} role="checkbox" aria-checked={p.done} onClick={() => void togglePlan(p.id)} style={{ ...s(`border:none;border-radius:6px 6px 18px 6px;background:${NOTE_BG[i % 4]};padding:14px;text-align:left;min-height:100px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;color:#1E2430`), transform: `rotate(${NOTE_ROT[i % 4]})` }}>
            <span style={s(`font-size:15px;font-weight:600;line-height:1.3;text-decoration:${p.done ? 'line-through' : 'none'};opacity:${p.done ? 0.65 : 1}`)}>{p.label}</span>
            <span style={s('display:flex;justify-content:space-between;align-items:center')}><span style={s('font-size:12px;color:#4A4F5A')}>{{ ai: 'Suggested', user: 'You added', journal: 'From journal', checkin: 'From a check-in' }[p.source]}</span><span aria-hidden="true" style={s(`width:26px;height:26px;border-radius:50%;border:2px solid #1E2430;background:${p.done ? '#1E2430' : 'transparent'};display:grid;place-items:center`)}><Svg d={I.check} size={13} stroke="#FFFFFF" sw={3} style={{ opacity: p.done ? 1 : 0 }} /></span></span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ a song
function SongView({ weeks, kindsOn, today }: { weeks: ReturnType<typeof monthWeeks>; kindsOn: (d: string) => MonthKind[]; today: string }) {
  const [wk, setWk] = useState(weeks.length - 1);
  const [song, setSong] = useState<Song>(readSong);
  const [playing, setPlaying] = useState(false);
  const [sing, setSing] = useState(true);
  const [step, setStep] = useState(-1);
  const ac = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setInterval | typeof setTimeout>[]>([]);
  useEffect(() => () => { stopAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (v: Song) => { setSong(v); writeSong(v); };
  const week = weeks[wk];
  const style = song.styles[week.start] ?? 'Lo-fi';
  const title = song.titles[week.start] ?? ['Finding my feet', 'Lighter', 'Small brave things', 'This week'][wk] ?? `Week ${wk + 1}`;
  const line = (day: string) => song.lines[day] ?? lyricFor(kindsOn(day), (song.turns[day] ?? 0) + new Date(day).getUTCDate());
  const sounds = week.days.reduce((n, d) => n + kindsOn(d.day).length, 0);

  function stopAll() { timers.current.forEach(t => { clearInterval(t as never); clearTimeout(t as never); }); timers.current = []; stopSpeech(); setPlaying(false); setStep(-1); }
  function play() {
    if (playing) { stopAll(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ac.current ??= new AC();
    if (ac.current.state === 'suspended') void ac.current.resume();
    const ctx = ac.current;
    const S = { 'Lo-fi': { mel: 'triangle', bar: 1.4, vol: .14 }, Acoustic: { mel: 'triangle', bar: 1.2, vol: .18 }, Piano: { mel: 'sine', bar: 1.5, vol: .2 }, Upbeat: { mel: 'square', bar: .9, vol: .06 } }[style as typeof STYLES[number]] as { mel: OscillatorType; bar: number; vol: number };
    const bar = sing ? Math.max(S.bar, 2.8) : S.bar;
    const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3], chords = [[130.8, 196, 329.6], [110, 164.8, 261.6], [146.8, 220, 349.2], [98, 146.8, 246.9]];
    const n = (type: OscillatorType, fq: number, t: number, dur: number, vol: number, kick?: boolean) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
      if (kick) { o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + .25); } else o.frequency.setValueAtTime(fq, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + .05);
    };
    const t0 = ctx.currentTime + .1, beats = Math.round(bar / .35);
    week.days.forEach((dd, d) => {
      const ks = kindsOn(dd.day), t = t0 + d * bar, has = (xs: MonthKind[]) => xs.some(k => ks.includes(k));
      if (!ks.length) return;
      for (let b = 0; b < beats; b++) if (has(['walk', 'step', 'show']) || b % 2 === 0) n('sine', 0, t + b * .35, .22, b % 2 ? .2 : .4, true);
      if (has(['friend', 'out'])) [0, .35, .7, 1.05].forEach((o, i) => { if (o < bar) n(S.mel, scale[(d * 2 + i) % 7], t + o, .4, S.vol); });
      if (has(['sleep'])) chords[d % 4].forEach(fq => n('sine', fq, t, bar * 1.1, .06));
      if (has(['talk'])) n('sawtooth', scale[(d + 3) % 7] / 2, t + .05, bar * .8, .04);
      if (has(['breathe'])) [1046.5, 1568].forEach((fq, i) => n('sine', fq, t + i * .5, 1.4, .05));
      if (has(['journal', 'play'])) [0, .7].forEach((o, i) => n('sine', scale[(d + i * 2) % 7] * 2, t + o, .5, .07));
    });
    setPlaying(true); setStep(0);
    let i = 0;
    timers.current.push(setInterval(() => { i++; if (i >= 70) { stopAll(); return; } setStep(i / 10); }, bar * 1000 / 10));
    if (sing) { const sayDay = (d: number) => { if (d > 6) return; const l = line(week.days[d].day); if (l && kindsOn(week.days[d].day).length) say(l, { rateMul: 1.02 }); timers.current.push(setTimeout(() => sayDay(d + 1), bar * 1000)); }; timers.current.push(setTimeout(() => sayDay(0), 150)); }
  }

  const nowIdx = weeks[wk].days.findIndex(d => d.today);
  return (
    <>
      <div role="group" aria-label="Weeks" style={s('display:flex;gap:6px')}>
        {weeks.map((w, i) => {
          const future = w.start > today;
          return <button key={w.start} aria-pressed={i === wk} onClick={() => { stopAll(); setWk(i); }} style={s(`flex:1;min-height:52px;border-radius:16px;border:${i === wk ? '1.5px solid #F2B33D' : '1.5px solid transparent'};background:${i === wk ? 'rgba(242,179,61,.25)' : 'rgba(255,255,255,.08)'};color:#FFFFFF;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;opacity:${future ? 0.45 : 1}`)}><span style={s('font-size:13px;font-weight:700')}>Week {i + 1}</span><span style={s('font-size:11px;opacity:.85')}>{i < weeks.length - 1 ? 'Done' : 'Now'}</span></button>;
        })}
      </div>
      <div style={s('background:rgba(255,255,255,.07);border-radius:24px;padding:16px 14px;display:flex;flex-direction:column;gap:12px')}>
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <input aria-label="Song title" value={title} onChange={e => save({ ...song, titles: { ...song.titles, [week.start]: e.target.value } })} style={s('flex:1;min-width:0;background:transparent;border:none;border-bottom:1px dashed rgba(255,255,255,.3);color:#FFFFFF;font-family:var(--serif);font-size:26px;padding:2px 0;outline:none')} />
          <span style={s('font-size:12px;font-weight:700;color:#D6D3F0')}>{sounds} sounds · {style}</span>
        </div>
        <div role="group" aria-label="Style" style={s('display:flex;gap:6px;overflow-x:auto;margin:0 -14px;padding:0 14px')}>
          {STYLES.map(st => <button key={st} aria-pressed={style === st} onClick={() => save({ ...song, styles: { ...song.styles, [week.start]: st } })} style={s(`flex:none;min-height:44px;padding:0 14px;border-radius:22px;border:none;background:${style === st ? '#F2B33D' : 'rgba(255,255,255,.1)'};color:${style === st ? '#1C1838' : '#FFFFFF'};font-size:13px;font-weight:700`)}>{st}</button>)}
        </div>
        <div role="img" aria-label={`This week’s score: ${sounds} sounds across the days`} style={s('position:relative;display:flex;flex-direction:column;gap:6px')}>
          {playing && <span aria-hidden="true" style={s(`position:absolute;top:-4px;bottom:16px;width:2px;background:#F2B33D;left:calc(55px + (100% - 55px) * ${(step / 7).toFixed(3)});box-shadow:0 0 10px #F2B33D;z-index:2`)} />}
          {SONG_ROWS.map(row => (
            <div key={row.label} style={s('display:flex;align-items:center;gap:5px')}>
              <span style={s('width:50px;font-size:11px;font-weight:700;color:#D6D3F0')}>{row.label}</span>
              {week.days.map((d, di) => { const on = kindsOn(d.day).some(k => row.kinds.includes(k)); const pl = playing && Math.floor(step) === di && on; return <span key={d.day} style={s(`flex:1;height:22px;border-radius:6px;background:${on ? row.color : 'rgba(255,255,255,.06)'};box-shadow:${pl ? `0 0 14px ${row.color}` : 'none'};border:${d.today ? '1.5px solid rgba(242,179,61,.7)' : '1.5px solid transparent'};transition:background 400ms`)} />; })}
            </div>
          ))}
          <div aria-hidden="true" style={s('display:flex;gap:5px;padding-left:55px')}>{DN.map((d, i) => <span key={d} style={s(`flex:1;text-align:center;font-size:11px;font-weight:700;color:${i === nowIdx ? '#F2B33D' : '#C8C5E8'}`)}>{d[0]}</span>)}</div>
        </div>
        <div style={s('display:flex;gap:8px')}>
          <button onClick={play} data-track="month.play" style={s('flex:1;height:52px;border-radius:26px;border:none;background:#F2B33D;color:#1C1838;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px')}><Svg d={playing ? I.pause : I.play} size={16} fill="#1C1838" stroke="#1C1838" sw={0} />{playing ? 'Stop' : `Play week ${wk + 1}`}</button>
          <button aria-pressed={sing} onClick={() => setSing(v => !v)} style={s(`height:52px;padding:0 16px;border-radius:26px;border:none;background:${sing ? '#6F6BB8' : 'rgba(255,255,255,.12)'};color:#FFFFFF;font-size:14px;font-weight:700`)}>{sing ? 'Sung' : 'Music only'}</button>
        </div>
      </div>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline')}>
        <h2 style={s('font-size:12px;font-weight:700;color:#D6D3F0;letter-spacing:.06em;text-transform:uppercase;margin:0')}>Lyrics · tap a line to rewrite</h2>
        <button onClick={() => { const turns = { ...song.turns }; const lines = { ...song.lines }; week.days.forEach(d => { turns[d.day] = (turns[d.day] ?? 0) + 1; delete lines[d.day]; }); save({ ...song, turns, lines }); }} style={s('border:none;background:none;color:#F2B33D;font-size:13px;font-weight:700;padding:0;min-height:44px')}>Rewrite all</button>
      </div>
      <div style={s('background:rgba(255,255,255,.07);border-radius:22px;padding:8px 14px;display:flex;flex-direction:column')}>
        {week.days.map((d, i) => {
          const has = kindsOn(d.day).length > 0, text = has ? line(d.day) : '';
          return (
            <div key={d.day} style={s(`display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:${i < 6 ? '1px solid rgba(255,255,255,.06)' : 'none'}`)}>
              <span style={s(`flex:none;width:30px;font-size:11px;font-weight:700;color:${d.today ? '#F2B33D' : '#C8C5E8'}`)}>{DN[i]}</span>
              <input aria-label={`Lyric for ${DN[i]}`} value={text} placeholder={d.future ? 'not yet' : has ? '' : 'a quiet day'} readOnly={!has} onChange={e => save({ ...song, lines: { ...song.lines, [d.day]: e.target.value } })} style={s(`flex:1;min-width:0;background:${playing && Math.floor(step) === i ? 'rgba(242,179,61,.25)' : 'transparent'};border:none;border-radius:8px;color:${has ? '#FFFFFF' : '#B5B1DA'};font-family:var(--serif);font-style:italic;font-size:18px;padding:4px 6px;outline:none;transition:background 300ms`)} />
              {has && <button aria-label={`Rewrite the line for ${DN[i]}`} onClick={() => { const lines = { ...song.lines }; delete lines[d.day]; save({ ...song, lines, turns: { ...song.turns, [d.day]: (song.turns[d.day] ?? 0) + 1 } }); }} style={s('flex:none;width:44px;height:44px;border-radius:50%;border:none;background:transparent;display:grid;place-items:center')}><Svg d={I.refresh} size={14} stroke="#FFFFFF" sw={2} /></button>}
            </div>
          );
        })}
      </div>
      <h2 style={s('font-size:12px;font-weight:700;color:#D6D3F0;letter-spacing:.06em;text-transform:uppercase;margin:0')}>This month’s album · {weeks.length} tracks</h2>
      <div style={s('display:flex;gap:8px;overflow-x:auto;margin:0 -20px;padding:0 20px')}>
        {weeks.map((w, i) => (
          <button key={w.start} onClick={() => { stopAll(); setWk(i); }} aria-label={`Track ${i + 1}, ${song.titles[w.start] ?? `Week ${i + 1}`}`} style={s('flex:none;width:104px;border:none;background:none;padding:0;color:#FFFFFF;text-align:left;display:flex;flex-direction:column;gap:6px')}>
            <span aria-hidden="true" style={s(`width:104px;height:104px;border-radius:14px;background:${COVERS[i % 4]};position:relative;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.25)`)}><span style={s('position:absolute;right:-18px;bottom:-18px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.18)')} /></span>
            <span style={s('font-size:13px;font-weight:700;line-height:1.2')}>{song.titles[w.start] ?? ['Finding my feet', 'Lighter', 'Small brave things', 'This week'][i] ?? `Week ${i + 1}`}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ letters
function LettersView({ weeks, kindsOn, today, nick, letterText }: { weeks: ReturnType<typeof monthWeeks>; kindsOn: (d: string) => MonthKind[]; today: string; nick: string; letterText: string | null }) {
  const week = weeks[weeks.length - 1];
  const kinds = week.days.flatMap(d => kindsOn(d.day));
  const none = kindsOn(today).length === 0;
  const sug = noticedFor(today);
  const isSunday = week.days[6].today;
  return (
    <>
      <div style={s('position:relative;background:#FFFFFF;border-radius:12px;padding:16px 14px 18px;box-shadow:0 12px 28px rgba(30,36,48,.1)')}>
        <span aria-hidden="true" style={s('position:absolute;left:0;right:0;top:0;height:60px;background:#F3E6D2;clip-path:polygon(0 0,100% 0,50% 100%);border-radius:12px 12px 0 0')} />
        <div role="list" aria-label="This week’s stamps" style={s('position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-top:52px')}>
          {week.days.map((d, i) => { const ks = kindsOn(d.day), v = ks[0]; return (
            <div key={d.day} role="listitem" aria-label={`${DN[i]}: ${v ? KIND_INFO[v].label : d.future ? 'not yet' : 'a quiet day'}`} style={s('display:flex;flex-direction:column;align-items:center;gap:4px')}>
              <span style={s('font-size:10px;font-weight:700;color:#7A6648')}>{DN[i]}</span>
              <span style={s(`width:100%;height:58px;border-radius:3px;background:${v ? KIND_INFO[v].color : d.today ? '#FCEFCF' : '#F4EEE3'};border:2px dashed ${v ? '#FFFFFF' : d.today ? '#F2B33D' : '#E0D6C4'};box-shadow:${d.today && !v ? '0 0 10px rgba(242,179,61,.5)' : 'none'};display:grid;place-items:center;font-size:8.5px;font-weight:700;color:#FFFFFF;text-align:center;line-height:1.1;padding:2px;overflow:hidden;word-break:break-word`)}>{v ? (ks.length > 1 ? `${KIND_INFO[v].label} +${ks.length - 1}` : KIND_INFO[v].label) : ''}</span>
            </div>
          ); })}
        </div>
      </div>
      {none && (
        <div style={s('background:#2F2A5E;color:#FFFFFF;border-radius:22px;padding:14px 16px;display:flex;flex-direction:column;gap:10px')}>
          <span style={s('font-size:12px;font-weight:700;color:#D6D3F0')}>Saathi wondered</span>
          <span style={s('font-size:16px;line-height:1.4')}>{sug.text}</span>
          <div style={s('display:flex;gap:8px')}>
            <button onClick={() => { logActivity(sug.kind); void loadMonthData(); }} style={s('flex:1;min-height:44px;border-radius:22px;border:none;background:#FFFFFF;color:#2F2A5E;font-size:14px;font-weight:700')}>Yes, add it</button>
            <button onClick={() => { logActivity('show'); void loadMonthData(); }} style={s('flex:1;min-height:44px;border-radius:22px;border:none;background:rgba(255,255,255,.14);color:#FFFFFF;font-size:14px;font-weight:700')}>Just showed up</button>
          </div>
        </div>
      )}
      {kinds.includes('friend') && (
        <div style={s('background:#FFFDF8;border-radius:6px;padding:14px 16px;transform:rotate(-1.5deg);box-shadow:0 8px 18px rgba(30,36,48,.12);border-left:6px solid #C9654A;display:flex;flex-direction:column;gap:4px')}>
          <span style={s('font-size:12px;font-weight:700;color:#9A4A33')}>A postcard</span>
          <span className="serif" style={s('font-size:19px;line-height:1.3')}>You reached out to a friend. I know that isn’t always easy. Proud of you.</span>
        </div>
      )}
      <div style={s('background:#FFFFFF;border-radius:22px;padding:16px;display:flex;flex-direction:column;gap:6px')}>
        <span style={s('font-size:12px;font-weight:700;color:#636B78')}>{isSunday && letterText ? 'Sunday · from Saathi' : 'A preview of Sunday’s letter'}</span>
        <span className="serif" style={s('font-size:20px;line-height:1.35;white-space:pre-wrap')}>{isSunday && letterText ? letterText : letterBody(nick || 'friend', kinds)}</span>
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ future you
function FutureView({ points }: { points: number }) {
  const f = futureYou(points);
  return (
    <>
      <div style={s('position:relative;height:330px;border-radius:28px;overflow:hidden;background:linear-gradient(180deg,#F6D9B8 0%,#F4C7B8 45%,#B7B1E6 100%)')}>
        <span aria-hidden="true" style={s(`position:absolute;left:50%;top:70px;width:220px;height:220px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(circle,rgba(255,248,230,${f.glow}) 0%,rgba(255,248,230,0) 70%)`)} />
        <div aria-hidden="true" style={s(`position:absolute;left:50%;bottom:0;width:180px;height:270px;transform:translateX(-50%);filter:blur(${f.blur}px) saturate(${f.sat});opacity:${f.op};transition:filter 1200ms,opacity 1200ms`)}>
          <span style={s('position:absolute;left:58px;top:20px;width:64px;height:76px;border-radius:50% 50% 46% 46%;background:#B07A55')} />
          <span style={s('position:absolute;left:54px;top:12px;width:72px;height:36px;border-radius:36px 36px 10px 14px;background:#2B1E18')} />
          <span style={s('position:absolute;left:76px;top:56px;width:6px;height:7px;border-radius:50%;background:#1E1A1C')} /><span style={s('position:absolute;left:98px;top:56px;width:6px;height:7px;border-radius:50%;background:#1E1A1C')} />
          <span style={s('position:absolute;left:78px;top:74px;width:24px;height:10px;border-radius:0 0 12px 12px;background:#6E2E33')} />
          <span style={s('position:absolute;left:78px;top:92px;width:24px;height:24px;background:#9C6A48')} />
          <span style={s('position:absolute;left:14px;top:110px;width:152px;height:170px;border-radius:76px 76px 0 0;background:#3E7F4C')} />
        </div>
        <div style={s('position:absolute;left:16px;right:16px;top:16px;background:rgba(255,253,248,.94);border-radius:18px;padding:12px 14px;color:#1E2430')}><span style={s('font-size:12px;font-weight:700;color:#7A5A00')}>Future you says</span><div className="serif" style={s('font-size:19px;line-height:1.3')}>{f.message}</div></div>
      </div>
      <div role="progressbar" aria-label="How clearly you can see them" aria-valuenow={f.clarity} aria-valuemin={0} aria-valuemax={100} style={s('height:8px;border-radius:4px;background:#EEE8DE;overflow:hidden')}><div style={s(`height:100%;width:${f.clarity}%;background:linear-gradient(90deg,#F2B33D,#3E7F4C);transition:width 800ms`)} /></div>
      <span style={s('font-size:14px;opacity:.85')}>{f.clarity}% clear · {f.points} small thing{f.points === 1 ? '' : 's'} in these four weeks</span>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ what works
function GuideView({ help }: { help: { feeling: Feeling; kind: MonthKind; helped: boolean }[] }) {
  const [feel, setFeel] = useState<Feeling>('anxious');
  const st = guideStats(help, feel);
  const top = st[0];
  return (
    <>
      <div role="group" aria-label="When you feel" style={s('display:flex;gap:6px;flex-wrap:wrap')}>
        {FEELINGS.filter(f => f !== 'okay').map(f => <button key={f} aria-pressed={feel === f} onClick={() => setFeel(f)} style={s(`min-height:44px;padding:0 14px;border-radius:22px;border:none;background:${feel === f ? '#1E2430' : '#FFFFFF'};color:${feel === f ? '#FFFFFF' : '#1E2430'};font-size:14px;font-weight:700`)}>{FEELING_LABEL[f]}</button>)}
      </div>
      <div style={s('background:#2F2A5E;color:#FFFFFF;border-radius:24px;padding:18px;display:flex;flex-direction:column;gap:6px')}>
        <span style={s('font-size:12px;font-weight:700;color:#D6D3F0;letter-spacing:.06em;text-transform:uppercase')}>When you feel {FEELING_LABEL[feel].toLowerCase()}, this helps most</span>
        <span className="serif" style={s('font-size:30px;line-height:1.05')}>{top ? KIND_INFO[top.kind].label : 'Still learning'}</span>
        <span style={s('font-size:14px;color:#DAD7F2')}>{top ? `Helped ${top.helped} of ${top.tried} time${top.tried === 1 ? '' : 's'}` : 'Try something when you feel this way, and tell me if it helped. I’ll write it down.'}</span>
      </div>
      {st.length > 0 && (
        <div style={s('background:#FFFFFF;border-radius:22px;padding:6px 16px;display:flex;flex-direction:column')}>
          {st.map((r, i) => (
            <div key={r.kind} style={s(`display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:${i < st.length - 1 ? '1px solid #F1EDE6' : 'none'}`)}>
              <span aria-hidden="true" style={s(`width:12px;height:12px;border-radius:50%;background:${KIND_INFO[r.kind].color}`)} /><span style={s('flex:1;font-size:15px;font-weight:600')}>{KIND_INFO[r.kind].label}</span><span style={s('font-size:13px;font-weight:700;color:#636B78')}>{r.helped}/{r.tried}</span>
            </div>
          ))}
        </div>
      )}
      <span style={s('font-size:13px;color:#636B78;line-height:1.45')}>This is only what you told me helped. It is a guide, not advice.</span>
    </>
  );
}
