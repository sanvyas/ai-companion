import { useEffect, useState } from 'react';
import { go, openSheet } from '../state/actions';
import { useStore } from '../state/store';
import { Ic, type IconName } from './icons';
import { setV2, TABS, useV2, type Tab } from './ui';

const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  today: { label: 'Home', icon: 'home' },
  journal: { label: 'Journal', icon: 'book' },
  talk: { label: 'Talk', icon: 'mic' },
  calm: { label: 'Calm', icon: 'lotus' },
  you: { label: 'You', icon: 'user' },
};

export function TabBar({ current }: { current: Tab | null }) {
  return (
    <nav className="tabbar" aria-label="Main" data-tour="tabbar">
      {TABS.map(t => {
        const m = TAB_META[t];
        const talk = t === 'talk';
        return (
          <button key={t} className={talk ? 'tt' : undefined} aria-current={current === t ? 'true' : undefined} data-track={`nav.${t}`} onClick={() => go(t)}>
            {talk ? <i><Ic n="mic" /></i> : <Ic n={m.icon} />}
            {m.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The always-available way to get to people who can help. A labelled pill, so nobody has to guess what the icon means. */
export function HelpPill({ tour }: { tour?: boolean }) {
  return (
    <button className="helpbtn" aria-label="Help, if you need someone now" data-tour={tour ? 'help' : undefined} data-track="help" onClick={() => openSheet('support')}>
      <Ic n="life" />Help
    </button>
  );
}

export function Toast() {
  const msg = useStore(s => s.toast);
  return <div className={'toast' + (msg ? ' on' : '')} role="status" aria-live="polite">{msg ?? ''}</div>;
}

/** The little banner that says what just grew, one line at a time, then gets out of the way. */
export function Ribbon() {
  const r = useV2(s => s.reward);
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (!r) return;
    setI(0); setOut(false);
    let n = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = () => {
      timers.push(setTimeout(() => {
        setOut(true);
        timers.push(setTimeout(() => {
          n++;
          if (n >= r.lines.length) { setV2({ reward: null, say: null }); return; }
          setI(n); setOut(false); setV2({ say: r.lines[n] });
          step();
        }, 420));
      }, n === 0 ? 3000 : 2500));
    };
    step();
    return () => timers.forEach(clearTimeout);
  }, [r]);
  if (!r) return null;
  return <div className={'ribbon' + (out ? ' out' : '')} role="status"><span>{r.lines[i]}</span>{i === 0 && r.gain > 0 && <b>+{r.gain} sunlight</b>}</div>;
}
