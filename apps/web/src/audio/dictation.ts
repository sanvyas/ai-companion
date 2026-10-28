import { isDemo } from '../api';
import { getState, set } from '../state/store';
import { appendSpeech, mergeTranscripts } from './transcript';

// Dictation into the journal (PRD 8.5.2): live transcript into the text area, editable afterwards, audio never kept.
// Uses the browser's recognition. Without it the person is told plainly, rather than shown a made-up transcript.
// The scripted transcript is demo-mode only.
//
// Browsers stop listening on their own after a pause or a minute or so, even in continuous mode. A person talking a
// journal entry out loud will pause, so the recogniser is restarted every time it ends while dictation is on, and what
// it heard so far is kept. Every result of a listening session is rebuilt into the text each time (not only the newest),
// so a final result is never dropped, and words still in flight are kept when the person stops.
// TODO(stt-adapter): stream through the server STT vendor via POST /stt/token once one is connected.
/** The locale to listen for. Hinglish speakers talk mostly in Hindi with English words, which the Hindi model hears best. */
export function speechLocale(): 'en-IN' | 'hi-IN' {
  const s = getState();
  if (s.dictLang === 'en') return 'en-IN';
  if (s.dictLang === 'hi') return 'hi-IN';
  return s.me?.language === 'hi' || s.me?.language === 'hinglish' ? 'hi-IN' : 'en-IN';
}

let on = false;
let rec: SpeechRecognition | null = null;
let sim: ReturnType<typeof setInterval> | null = null;
let restart: ReturnType<typeof setTimeout> | undefined;

const DEMO = 'Work was a lot today. My manager moved the deadline again and I didn’t say anything. I keep thinking I should have. Priya texted, that helped a bit. I want to sleep before one tonight.'.split(' ');

export function stopDictation() {
  on = false;
  clearTimeout(restart);
  if (sim) clearInterval(sim);
  sim = null;
  // stop() (not abort()) lets the engine deliver the words it is still working on; the handlers stay attached until it ends.
  if (rec) { try { rec.stop(); } catch { /* not started */ } rec = null; }
  if (getState().dictating) set({ dictating: false });
}

export function startDictation(notify: (msg: string) => void) {
  on = true;
  set({ dictating: true });

  const fallback = (why: string) => {
    if (!isDemo) { stopDictation(); notify(why); return; }
    const base = getState().jText ? getState().jText.replace(/\s*$/, ' ') : '';
    let i = 0;
    if (sim) clearInterval(sim);
    notify('Demo mode: this is a scripted transcript.');
    sim = setInterval(() => {
      if (!on || i >= DEMO.length) { if (sim) clearInterval(sim); sim = null; if (on) stopDictation(); return; }
      set(p => ({ jText: (i === 0 ? base : p.jText + ' ') + DEMO[i++] }));
    }, 220);
  };

  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) { fallback('Dictation isn’t available in this browser. You can type instead.'); return; }

  let quick = 0; // sessions that ended almost at once: the engine is refusing to run
  let told = false;

  const listen = () => {
    if (!on) return;
    // What was written before this listening session. Anything heard in it is added after this, rebuilt on every result.
    const before = getState().jText;
    const opened = Date.now();
    try {
      const r = new SR();
      rec = r;
      r.lang = speechLocale();
      r.continuous = true;
      r.interimResults = true;
      r.onresult = e => {
        const heard: string[] = [];
        for (let i = 0; i < e.results.length; i++) heard.push(e.results[i][0].transcript);
        set({ jText: appendSpeech(before, mergeTranscripts(heard)) });
      };
      r.onerror = e => {
        if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) { rec = null; if (on) fallback('I can’t reach the microphone. Check the browser’s permission, or type instead.'); }
        else if (e.error === 'network' && !told) { told = true; notify('Dictation needs a connection. Whatever you said so far is kept.'); }
      };
      r.onend = () => {
        if (rec === r) rec = null;
        if (!on) { if (getState().dictating) set({ dictating: false }); return; }
        quick = Date.now() - opened < 1200 ? quick + 1 : 0;
        if (quick >= 4) { stopDictation(); notify('Dictation stopped listening. Tap the microphone to start again, or type.'); return; }
        restart = setTimeout(listen, 150);
      };
      r.start();
    } catch { fallback('Dictation couldn’t start. You can type instead.'); }
  };

  listen();
}
