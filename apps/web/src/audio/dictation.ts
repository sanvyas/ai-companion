import { isDemo } from '../api';
import { getState, set } from '../state/store';
import { api, ApiError } from '../api';
import { Chunker, wavOf } from './chunker';
import { startMic, type Mic } from './mic';
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
let on = false;
let rec: SpeechRecognition | null = null;
let sim: ReturnType<typeof setInterval> | null = null;
let restart: ReturnType<typeof setTimeout> | undefined;
let mic: Mic | null = null;
let chunker: Chunker | null = null;
let queue: Promise<void> = Promise.resolve();
let pending = 0;
let settled: (() => void)[] = [];
/** Set once the server's speech service has refused a piece, so the rest of the session (and the next) use the browser. */
let serverRefused = false;

const DEMO = 'Work was a lot today. My manager moved the deadline again and I didn’t say anything. I keep thinking I should have. Priya texted, that helped a bit. I want to sleep before one tonight.'.split(' ');

/** Resolves when every piece of speech already heard has been written into the text. Save waits for this. */
export const dictationSettled = (): Promise<void> => (pending === 0 ? Promise.resolve() : new Promise(res => { settled.push(res); }));
const done = () => { set({ dictBusy: pending }); if (pending === 0) { const w = settled; settled = []; w.forEach(r => r()); } };

export function stopDictation() {
  on = false;
  clearTimeout(restart);
  if (sim) clearInterval(sim);
  sim = null;
  // The recording ends, but the last piece is still sent: what was said just before tapping stop is not thrown away.
  if (mic) { mic.stop(); mic = null; }
  if (chunker) { chunker.flush(); chunker = null; }
  // stop() (not abort()) lets the browser engine deliver the words it is still working on; the handlers stay attached until it ends.
  if (rec) { try { rec.stop(); } catch { /* not started */ } rec = null; }
  if (getState().dictating) set({ dictating: false });
}

/** The locale to listen for. Hinglish speakers talk mostly in Hindi with English words, which the Hindi model hears best. */
export function speechLocale(): 'en-IN' | 'hi-IN' {
  const s = getState();
  if (s.dictLang === 'en') return 'en-IN';
  if (s.dictLang === 'hi') return 'hi-IN';
  return s.me?.language === 'hi' || s.me?.language === 'hinglish' ? 'hi-IN' : 'en-IN';
}

/** The language the server is asked to write in. Hinglish is written in Latin script, Hindi in Devanagari. */
const serverLanguage = (): 'en' | 'hinglish' | 'hi' => (speechLocale() === 'en-IN' ? 'en' : getState().me?.language === 'hinglish' ? 'hinglish' : 'hi');

export function startDictation(notify: (msg: string) => void) {
  on = true;
  set({ dictating: true });
  if (!isDemo && getState().cfg?.dictation && !serverRefused) void listenToServer(notify); else listenInBrowser(notify);
}

// ------------------------------------------------------------------------------------------------ server speech-to-text
/**
 * One unbroken recording, cut into pieces at the pauses between phrases and written down as each piece comes back.
 * Nothing is lost to a recogniser restarting, and Hindi, English and a mix of the two are all heard by the same model.
 */
async function listenToServer(notify: (msg: string) => void) {
  const language = serverLanguage();
  const c = new Chunker((pcm, seconds) => {
    pending++; set({ dictBusy: pending });
    queue = queue.then(async () => {
      try {
        let text = '';
        for (let attempt = 0; ; attempt++) {
          try { text = (await api.transcribe(wavOf(pcm), language)).text; break; }
          catch (e) { if (attempt >= 1 || (e instanceof ApiError && e.code === 'stt_unavailable')) throw e; await new Promise(r => setTimeout(r, 500)); }
        }
        if (text) set(st => ({ jText: appendSpeech(st.jText, text) }));
      } catch (e) {
        if (e instanceof ApiError && e.code === 'stt_unavailable') {
          // The speech service refused: carry on with the browser's recogniser from here, and say what was missed.
          serverRefused = true;
          if (on) { stopServerCapture(); listenInBrowser(notify); }
          notify('Switched to your browser’s dictation. If the last few seconds are missing, please say them again.');
        } else notify(`I couldn’t write down about ${Math.round(seconds)} seconds just now. Please say it again.`);
      } finally { pending--; done(); }
    });
  });
  chunker = c;
  try {
    mic = await startMic(buf => chunker?.push(new Int16Array(buf)));
    if (!on) { stopServerCapture(); return; }
  } catch {
    chunker = null; on = false; set({ dictating: false });
    notify('I can’t reach the microphone. Check the browser’s permission, or type instead.');
  }
}

function stopServerCapture() {
  if (mic) { mic.stop(); mic = null; }
  chunker?.flush();
  chunker = null;
}

// ------------------------------------------------------------------------------------------------ browser speech recognition
function listenInBrowser(notify: (msg: string) => void) {
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
