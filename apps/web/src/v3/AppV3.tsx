import { Suspense, lazy, useEffect, useRef } from 'react';
import { startCheckin, dismissCard, go, loadToday, closeSheet as closeStoreSheet } from '../state/actions';
import { useAppLifecycle } from '../state/lifecycle';
import { getState, useStore, type Screen } from '../state/store';
import { getV3, moodSkipped, setV3, useV3 } from './ui';
import { setV2, useV2 } from '../v2/ui';
import { BannerView, HelpSheet, TabBar, Toast } from './Chrome';
import { Home } from './Home';
import { MoodScreen, WhyScreen } from './Mood';
import { V3Sheets, EventSheet } from './Sheets';
import { BreatheScreen, GameScreen, MonthTab, PlayerScreen, Relax } from './stubs';
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

  useEffect(() => { document.documentElement.dataset.reduce = reduce ? 'true' : ''; }, [reduce]);
  useEffect(() => { document.title = discreet ? 'Calm' : 'Saathi'; }, [discreet]);

  // The first thing, once a day: how are you? Skipping is fine, and it is not asked again until tomorrow.
  useEffect(() => {
    if (phase !== 'in') { asked.current = false; return; }
    if (asked.current) return;
    asked.current = true;
    void loadToday().then(() => { if (getState().mood === null && !moodSkipped()) setV3({ over: 'mood' }); });
  }, [phase]);

  // A real card from the app (a quiet check-in the person asked for) arrives as a banner, never a pop-up that blocks anything.
  useEffect(() => {
    const c = cards.find(x => x.kind === 'checkin');
    if (phase === 'in' && c && !getV3().bannerShown && !getState().crisis) setV3({ bannerShown: true, banner: { text: 'A quiet moment for you? Your check-in is here whenever you are.', go: 'checkin' } });
  }, [cards, phase]);

  // The last step of sign-up leaves the screen where it was, and the older design then shows its own next step. Here, they arrive.
  // (The older sign-up marks that moment by asking for a first seed, which this design does not have.)
  const signedUpJustNow = useV2(x => x.seed);
  useEffect(() => { if (signedUpJustNow) { setV2({ seed: false }); go('today'); } }, [signedUpJustNow]);

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
    <div className="v3">
      <div className="stage">
        <div className="app">
          <div style={{ position: 'absolute', inset: 0 }} {...(behind ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}>
            {phase === 'booting' && <Splash />}
            {onboarding && phase !== 'booting' && lazyLegacy('onboarding', screen)}
            {inApp && Tab && <Tab key={screen} />}
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
