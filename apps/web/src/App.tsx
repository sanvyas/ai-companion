import { useEffect } from 'react';
import { getState, saveUi, subscribe, useStore, type Screen } from './state/store';
import { bindUi, handleNotificationOpen, startTicker, teardownAll } from './state/actions';
import { boot } from './state/session';
import { listenForNotificationOpens, registerServiceWorker } from './state/push';
import { loadVoices } from './audio/speech';
import { Age, CompanionPicker, Consent, Intro, Language, NameScreen, OtpScreen, Under, Welcome } from './screens/Onboarding';
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

const SCREENS: Record<Screen, () => JSX.Element | null> = {
  welcome: Welcome, intro: Intro, age: Age, under: Under, lang: Language, name: NameScreen, otp: OtpScreen, companion: CompanionPicker, consent: Consent,
  today: Today, talk: Talk, call: Call, chat: Chat, outside: Outside, walk: Walk, journey: Insights, you: You, memory: Memory,
  privacy: Privacy, journal: JournalList, jcompose: JournalCompose, lock: LockScreen, incoming: IncomingCall, notifs: NotifSettings,
  studio: Studio, calm: Calm,
};

function Splash() {
  return (
    <div className="screen" style={{ display: 'grid', placeItems: 'center' }} role="status" aria-live="polite">
      <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
        <div className="serif" style={{ fontSize: 28 }}>Saathi</div>
        <div style={{ fontSize: 14, marginTop: 6 }}>One moment…</div>
      </div>
    </div>
  );
}

export function App() {
  const phase = useStore(s => s.phase);
  const screen = useStore(s => s.screen);
  const sheet = useStore(s => s.sheet);
  const paywall = useStore(s => s.paywall);
  const breathe = useStore(s => s.breathe);
  const crisis = useStore(s => s.crisis);
  const player = useStore(s => s.player);
  const demo = useStore(s => s.demo);
  const reduce = useStore(s => s.reduceMotion);
  const discreet = useStore(s => s.me?.privacy.discreetMode ?? false);

  useEffect(() => {
    bindUi();
    loadVoices();
    const stopTicker = startTicker();
    const stopPush = listenForNotificationOpens(handleNotificationOpen);
    void registerServiceWorker();
    void boot();
    return () => { stopTicker(); stopPush(); teardownAll(); };
  }, []);

  // Persist display preferences only. Everything personal stays on the server (see store.ts).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const unsub = subscribe(() => { clearTimeout(t); t = setTimeout(() => saveUi(getState()), 300); });
    return () => { unsub(); clearTimeout(t); };
  }, []);

  useEffect(() => { document.documentElement.dataset.reduce = reduce ? 'true' : ''; }, [reduce]);
  useEffect(() => { document.title = discreet ? 'Calm' : 'Saathi'; }, [discreet]);

  const Current = SCREENS[screen];
  const showNav = phase === 'in' && NAV_SCREENS.includes(screen);
  const behind = !!(sheet || paywall || breathe || crisis || player);

  return (
    <>
      {demo && <DemoPanel />}
      <div className="shell">
        {/* Background content is inert while a modal overlay is up so assistive tech and Tab stay inside it. */}
        <div style={{ position: 'absolute', inset: 0 }} {...(behind ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}>
          {phase === 'booting' ? <Splash /> : <Current />}
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
