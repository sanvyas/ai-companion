import { Suspense, lazy, useEffect, useRef } from 'react';
import { startCheckin, dismissCard, go, loadToday, closeSheet as closeStoreSheet } from '../state/actions';
import { useAppLifecycle } from '../state/lifecycle';
import { getState, useStore, type Screen } from '../state/store';
import { getV3, setV3, shouldAskMood, useV3 } from './ui';
import { useTheme } from './theme';
import { BannerView, HelpSheet, TabBar, Toast } from './Chrome';
import { Home } from './Home';
import { AgeV3, CompanionV3, ConsentV3, SignInV3, UnderV3, WelcomeV3 } from './Onboard';
import { MoodScreen, WhyScreen } from './Mood';
import { V3Sheets, EventSheet } from './Sheets';
import { MonthTab } from './Month';
import { GameScreen } from './Games';
import { BreatheScreen, PlayerScreen } from './Play';
import { Relax } from './Relax';
import { CallScreen, ChatScreen, TalkTab, WalkScreen } from './Talk';
import { Compose, JournalTab } from './Journal';
import { YouTab } from './You';
import { s } from './css';
import { openHelp } from './ui';
import type { LegacyKind } from './Legacy';

const Legacy = lazy(() => import('./Legacy'));
const lazyLegacy = (kind: LegacyKind, screen: Screen) => <Suspense fallback={null}><Legacy kind={kind} screen={screen} /></Suspense>;

const ONBOARDING: Screen[] = ['welcome', 'intro', 'age', 'lang', 'under', 'name', 'otp', 'companion', 'consent'];
const LEGACY_SCREENS: Screen[] = ['memory', 'privacy', 'notifs', 'studio'];
/** The sheets the third design draws itself are not in this list; the rest are the older ones, still doing their jobs. */
const LEGACY_SHEETS = ['plan', 'planedit', 'trusted', 'letter', 'jread', 'mic', 'delete', 'helplines'] as const;

const TAB_SCREENS: Partial<Record<Screen, () => JSX.Element>> = { today: Home, calm: Relax, talk: TalkTab, journal: JournalTab, journey: MonthTab, you: YouTab };
const FULL_SCREENS: Partial<Record<Screen, () => JSX.Element>> = { call: CallScreen, chat: ChatScreen, walk: WalkScreen, jcompose: Compose };

/** One component for name and otp, so the code box opens on the same screen the number was typed on. */
function OnboardingV3({ screen }: { screen: Screen }) {
  if (screen === 'welcome') return <WelcomeV3 />;
  if (screen === 'under') return <UnderV3 />;
  if (screen === 'companion') return <CompanionV3 />;
  if (screen === 'consent') return <ConsentV3 />;
  if (screen === 'name' || screen === 'otp' || screen === 'lang') return <SignInV3 step={screen === 'otp' ? 'otp' : 'name'} />;
  return <AgeV3 />;
}

function Splash() {
  return <div role="status" aria-live="polite" style={s('position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:#FAF6EF')}><div><div className="serif" style={s('font-size:44px')}>Saathi</div><div style={s('color:#636B78;margin-top:6px')}>One moment…</div></div></div>;
}

export function AppV3() {
  useAppLifecycle();
  const phase = useStore(x => x.phase);
  const screen = useStore(x => x.screen);
  const storeSheet = useStore(x => x.sheet);
  const eventId = useStore(x => x.eventId);
  const breathe = useStore(x => x.breathe);
  const crisis = useStore(x => x.crisis);
  const paywall = useStore(x => x.paywall);
  const player = useStore(x => x.player);
  const reduce = useStore(x => x.reduceMotion);
  const discreet = useStore(x => x.me?.privacy.discreetMode ?? false);
  const cards = useStore(x => x.cards);
  const over = useV3(x => x.over);
  const sheet = useV3(x => x.sheet);
  const banner = useV3(x => x.banner);
  const asked = useRef(false);
  const theme = useTheme();

  useEffect(() => { document.documentElement.dataset.reduce = reduce ? 'true' : ''; }, [reduce]);
  useEffect(() => { document.title = discreet ? 'Calm' : 'Saathi'; }, [discreet]);

  // The first thing when they come back after a few hours away: how are you? Skipping is fine, and it is not asked again until the next time.
  // It waits for a quiet moment (a tab, nothing open over it), so it never lands in the middle of a call or a breath.
  const askIfAway = () => {
    const g = getState(), v = getV3();
    if (g.phase !== 'in' || v.over || v.sheet || g.crisis || g.breathe || g.player || g.sheet || !(g.screen in TAB_SCREENS) || !shouldAskMood()) return;
    setV3({ over: 'mood', banner: null, bannerShown: true });
  };
  useEffect(() => {
    if (phase !== 'in') { asked.current = false; return; }
    if (!asked.current) { asked.current = true; void loadToday(); }
    askIfAway();
  }, [phase, screen]);
  useEffect(() => {
    const on = () => { if (document.visibilityState === 'visible') askIfAway(); };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // A real card from the app (a quiet check-in the person asked for) arrives as a banner, never a pop-up that blocks anything.
  useEffect(() => {
    const c = cards.find(x => x.kind === 'checkin');
    if (phase === 'in' && c && !over && !getV3().bannerShown && !getState().crisis) setV3({ bannerShown: true, banner: { text: 'A quiet moment for you? Your check-in is here whenever you are.', go: 'checkin' } });
  }, [cards, phase, over]);

  const onboarding = ONBOARDING.includes(screen);
  const inApp = phase === 'in' && !onboarding;
  const Tab = TAB_SCREENS[screen];
  const Full = FULL_SCREENS[screen];
  const legacyScreen = LEGACY_SCREENS.includes(screen);
  const showHelp = !!(storeSheet === 'support' || sheet?.id === 'help');
  const showEvent = storeSheet === 'event' && !!eventId;
  const legacySheet = storeSheet && (LEGACY_SHEETS as readonly string[]).includes(storeSheet);
  const showTabs = inApp && !!Tab && screen !== 'you' && !over && !Full && !breathe && !player && !legacyScreen;
  const behind = !!(showHelp || showEvent || sheet || legacySheet || breathe || crisis || paywall || player);

  const bannerGo = (b: NonNullable<typeof banner>) => {
    setV3({ banner: null });
    if (b.go === 'checkin') { const c = cards.find(x => x.kind === 'checkin'); if (c) void dismissCard(c.id); void startCheckin(); }
    else if (b.go === 'event' && b.eventId) setV3({ sheet: { id: 'event', eventId: b.eventId } });
  };

  return (
    <div className="v3" style={{ '--tint': theme.tint, '--wash': theme.wash } as React.CSSProperties}>
      <div className="stage">
        <div className="app">
          <div style={{ position: 'absolute', inset: 0 }} {...(behind ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}>
            {phase === 'booting' && <Splash />}
            {onboarding && phase !== 'booting' && <OnboardingV3 screen={screen} />}
            {/* While the first question is up, Home is not behind it: there is one screen, one heading, nothing to land on by mistake. */}
            {inApp && Tab && over !== 'mood' && over !== 'why' && <Tab key={screen} />}
            {inApp && !Tab && !Full && !legacyScreen && screen === 'outside' && <Redirect to="today" />}
            {inApp && Full && <Full />}
            {inApp && legacyScreen && lazyLegacy('screen', screen)}
            {inApp && over === 'mood' && <MoodScreen />}
            {inApp && over === 'why' && <WhyScreen onDone={() => { setV3({ over: null }); go('today'); }} />}
            {inApp && over === 'game' && <GameScreen />}
            {inApp && over === 'language' && <Suspense fallback={null}><Legacy kind="language" screen={screen} /></Suspense>}
            {showTabs && <TabBar />}
          </div>
          {inApp && <BannerView onGo={bannerGo} />}
          {inApp && !!legacySheet && lazyLegacy('sheets', screen)}
          {showHelp && <HelpSheet />}
          {showEvent && <EventSheet id={eventId!} />}
          {inApp && <V3Sheets />}
          {inApp && breathe && <BreatheScreen />}
          {inApp && player && <PlayerScreen />}
          {crisis && lazyLegacy('crisis', screen)}
          {paywall && lazyLegacy('paywall', screen)}
          <Toast />
        </div>
      </div>
    </div>
  );
}

function Redirect({ to }: { to: Screen }) { useEffect(() => { go(to); }, [to]); return null; }
export { openHelp, closeStoreSheet };
