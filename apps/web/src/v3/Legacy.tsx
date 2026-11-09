import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '../v2/v2.css';
import { useEffect } from 'react';
import { CrisisOverlay, PaywallOverlay } from '../v2/Overlays';
import { Sheets } from '../v2/Sheets';
import { LanguageScreen, MemoryScreen, NotifScreen, PrivacyScreen, StudioScreen } from '../v2/You';
import { go } from '../state/actions';
import type { Screen } from '../state/store';

// Screens the third design does not redraw (what Saathi remembers, privacy, voices, the safety plan) are shown as the
// second design draws them, over this one. They load only when asked for, so nobody downloads them to look at Home.
// They are the older screens, doing the same jobs against the same app, so nothing about safety or privacy is lost.

const OVER: Partial<Record<Screen, () => JSX.Element | null>> = { memory: MemoryScreen, privacy: PrivacyScreen, notifs: NotifScreen, studio: StudioScreen };

export type LegacyKind = 'screen' | 'sheets' | 'crisis' | 'paywall' | 'language';

export default function Legacy({ kind, screen }: { kind: LegacyKind; screen: Screen }) {
  useEffect(() => { document.documentElement.dataset.legacy = 'on'; return () => { delete document.documentElement.dataset.legacy; }; }, []);
  const Pane = kind === 'screen' ? OVER[screen] : null;
  return (
    <div className="v2 legacy" style={{ height: 'auto' }}>
      {Pane && <Pane />}
      {kind === 'language' && <LanguageScreen onBack={() => go('you')} />}
      {kind === 'sheets' && <Sheets />}
      {kind === 'crisis' && <CrisisOverlay />}
      {kind === 'paywall' && <PaywallOverlay />}
    </div>
  );
}
