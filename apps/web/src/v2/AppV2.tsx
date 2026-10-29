import { useEffect, useRef } from 'react';
import { useAppLifecycle } from '../state/lifecycle';
import { go } from '../state/actions';
import { getState, subscribe, useStore, type Screen } from '../state/store';
import { BirdDefs } from './Bird';
import { Ribbon, TabBar, Toast } from './Chrome';
import { gardenMayHaveChanged, resetGarden } from './garden';
import { useSkyPhase } from './hooks';
import { Home } from './Home';
import { AboutV2, CompanionV2, ConsentV2, IntroV2, OtpV2, SignInV2, UnderV2, WelcomeV2 } from './Onboarding';
import { BreatheOverlay, CrisisOverlay, LevelUpOverlay, PaywallOverlay, PlayerOverlay, SeedScreen, Tour } from './Overlays';
import { Sheets } from './Sheets';
import { Soon } from './Soon';
import { clearStack, setV2, useV2, type Tab } from './ui';

const ONBOARDING: Partial<Record<Screen, () => JSX.Element>> = {
  welcome: WelcomeV2, intro: IntroV2, age: AboutV2, lang: AboutV2, under: UnderV2, name: SignInV2, otp: OtpV2, companion: CompanionV2, consent: ConsentV2,
};

const TAB_OF: Partial<Record<Screen, Tab>> = { today: 'today', journal: 'journal', talk: 'talk', calm: 'calm', you: 'you' };

// Tab panes. Screens that are not in the new design yet say so plainly (only people previewing it see this: it is off for everyone else).
const PANES: Record<Tab, () => JSX.Element> = {
  today: Home,
  journal: () => <Soon name="Journal" />,
  talk: () => <Soon name="Talk" />,
  calm: () => <Soon name="Calm" />,
  you: () => <Soon name="You" />,
};

function Splash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div><div className="h1">Saathi</div><div className="muted" style={{ marginTop: 6 }}>One moment…</div></div>
    </div>
  );
}

/** The garden grows from what the person does, which the server counts. Whenever something it counts may have just happened, look again. */
function useGardenSync(signedIn: boolean) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn) { resetGarden(); last.current = null; return; }
    return subscribe(() => {
      const s = getState();
      const sig = [s.mood, s.plan.filter(p => p.done).length, s.jEntries.length, s.recent.length, s.walkEnded ? 1 : 0, s.callEnded ? 1 : 0].join('|');
      if (last.current !== null && sig !== last.current) gardenMayHaveChanged();
      last.current = sig;
    });
  }, [signedIn]);
}

export function AppV2() {
  useAppLifecycle();
  const phase = useStore(s => s.phase);
  const screen = useStore(s => s.screen);
  const paywall = useStore(s => s.paywall);
  const breathe = useStore(s => s.breathe);
  const crisis = useStore(s => s.crisis);
  const player = useStore(s => s.player);
  const sheet = useStore(s => s.sheet);
  const v2Sheet = useV2(s => s.sheet);
  const reduce = useStore(s => s.reduceMotion);
  const discreet = useStore(s => s.me?.privacy.discreetMode ?? false);
  const seed = useV2(s => s.seed);
  const tour = useV2(s => s.tour);
  const stack = useV2(s => s.stack);
  const phaseOfDay = useSkyPhase();

  useGardenSync(phase === 'in');
  useEffect(() => { document.documentElement.dataset.reduce = reduce ? 'true' : ''; }, [reduce]);
  useEffect(() => { document.title = discreet ? 'Calm' : 'Saathi'; }, [discreet]);
  // Screens pushed on top of the tabs belong to the tab they were opened from: leaving for anywhere else closes them.
  useEffect(() => { clearStack(); }, [screen]);
  useEffect(() => { const t = TAB_OF[screen]; if (t) setV2({ lastTab: t }); }, [screen]);

  const tab = TAB_OF[screen] ?? null;
  const Onboard = ONBOARDING[screen];
  const inApp = phase === 'in' && !seed && !Onboard;
  const behind = !!(sheet || v2Sheet || paywall || breathe || crisis || player || tour !== null);
  const pushed = inApp && !tab;
  const noTabs = !inApp || pushed || stack.length > 0;

  return (
    <div className={'v2' + (phaseOfDay === 'night' ? ' night' : '')}>
      <BirdDefs />
      <div className="shell">
        <div className="device">
          <div className={'app' + (noTabs ? ' noTabs' : '')}>
            <div style={{ position: 'absolute', inset: 0 }} {...(behind ? { inert: '' as unknown as boolean, 'aria-hidden': true } : {})}>
              {phase === 'booting' && <Splash />}
              {phase !== 'booting' && Onboard && !seed && <Onboard />}
              {phase === 'in' && seed && <SeedScreen />}
              {inApp && (
                <>
                  {PANES[tab ?? 'today'] && <TabPane tab={tab ?? 'today'} />}
                  {!noTabs || tab ? <TabBar current={tab} /> : null}
                  {pushed && <Soon name={screen} pushed />}
                  {stack.map(p => <Soon key={p.id} name={p.id} pushed />)}
                </>
              )}
            </div>
            <Sheets />
            {inApp && <Ribbon />}
            {inApp && <LevelUpOverlay />}
            {paywall && <PaywallOverlay />}
            {player && <PlayerOverlay />}
            {breathe && <BreatheOverlay />}
            {crisis && <CrisisOverlay />}
            {inApp && <Tour />}
            <Toast />
          </div>
        </div>
      </div>
    </div>
  );
}

function TabPane({ tab }: { tab: Tab }) {
  const Pane = PANES[tab];
  return <section className="pane on" aria-label={tab} key={tab}><Pane /></section>;
}

void go;
