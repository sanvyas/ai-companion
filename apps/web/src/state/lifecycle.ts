import { useEffect } from 'react';
import { getState, saveUi, subscribe } from './store';
import { bindUi, handleNotificationOpen, startTicker, teardownAll } from './actions';
import { boot } from './session';
import { startAnalytics } from './analytics';
import { listenForNotificationOpens, registerServiceWorker } from './push';
import { loadVoices } from '../audio/speech';

/** Everything that has to run once when either design starts: wiring, speech voices, the ticker, push, analytics, boot. */
export function useAppLifecycle() {
  useEffect(() => {
    bindUi();
    loadVoices();
    const stopTicker = startTicker();
    const stopPush = listenForNotificationOpens(handleNotificationOpen);
    const stopAnalytics = startAnalytics();
    void registerServiceWorker();
    void boot();
    return () => { stopTicker(); stopPush(); stopAnalytics(); teardownAll(); };
  }, []);

  // Persist display preferences only. Everything personal stays on the server (see store.ts).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const unsub = subscribe(() => { clearTimeout(t); t = setTimeout(() => saveUi(getState()), 300); });
    return () => { unsub(); clearTimeout(t); };
  }, []);
}
