import { useEffect } from 'react';
import { getState, savePrefs, subscribePrefs, useStore, type Screen } from './state/store';
import { startTicker, teardownAll } from './state/actions';
import { loadVoices } from './audio/speech';
import { Age, CompanionPicker, Consent, Intro, Language, NameScreen, Under, Welcome } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Talk } from './screens/Talk';
import { Call } from './screens/Call';
import { Chat } from './screens/Chat';
import { Outside, Walk } from './screens/Outside';
import { Insights, JournalCompose, JournalList } from './screens/Journal';
import { Memory, NotifSettings, Privacy, You } from './screens/You';
import { IncomingCall, LockScreen } from './screens/Lock';
import { Studio } from './screens/Studio';
import { Calm } from './screens/Calm';
import { Nav, NAV_SCREENS, SoundBar, Toast } from './overlays/Chrome';
import { Sheets } from './overlays/Sheets';
import { Breathe, Crisis, Paywall, Player } from './overlays/Full';
import { DemoPanel } from './demo/DemoPanel';

const SCREENS: Record<Screen, () => JSX.Element> = {
  welcome: Welcome, intro: Intro, age: Age, under: Under, lang: Language, name: NameScreen, companion: CompanionPicker, consent: Consent,
  today: Today, talk: Talk, call: Call, chat: Chat, outside: Outside, walk: Walk, journey: Insights, you: You, memory: Memory,
  privacy: Privacy, journal: JournalList, jcompose: JournalCompose, lock: LockScreen, incoming: IncomingCall, notifs: NotifSettings,
  studio: Studio, calm: Calm,
};

export function App() {
  const screen = useStore(s => s.screen);
  const sheet = useStore(s => s.sheet);
  const paywall = useStore(s => s.paywall);
  const breathe = useStore(s => s.breathe);
  const crisis = useStore(s => s.crisis);
  const player = useStore(s => s.player);
  const demo = useStore(s => s.demo);
  const reduce = useStore(s => s.reduceMotion);
  const discreet = useStore(s => s.priv.discreet);

  useEffect(() => { loadVoices(); const stop = startTicker(); return () => { stop(); teardownAll(); }; }, []);

  // Persist low-sensitivity preferences only (see store.ts).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const unsub = subscribePrefs(() => { clearTimeout(t); t = setTimeout(() => savePrefs(getState()), 300); });
    return () => { unsub(); clearTimeout(t); };
  }, []);

  useEffect(() => { document.documentElement.dataset.reduce = reduce ? 'true' : ''; }, [reduce]);
  useEffect(() => { document.title = discreet ? 'Calm' : 'Saathi'; }, [discreet]);

  const Current = SCREENS[screen];
  const showNav = NAV_SCREENS.includes(screen);
  const behind = !!(sheet || paywall || breathe || crisis || player);

  return (
    <>
      {demo && <DemoPanel />}
      <div className="shell">
        {/* Background content is inert while a modal overlay is up so assistive tech and Tab stay inside it. */}
        <div style={{ position: 'absolute', inset: 0 }} {...(behind ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}>
          <Current />
          <SoundBar />
          {showNav && <Nav />}
        </div>
        <Sheets />
        {paywall && <Paywall />}
        {player && <Player />}
        {crisis && <Crisis />}
        {breathe && <Breathe />}
        <Toast />
      </div>
    </>
  );
}

