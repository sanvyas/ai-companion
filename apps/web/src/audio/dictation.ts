import { getState, set } from '../state/store';

// Dictation into the journal (PRD §8.5.2). Uses the browser SpeechRecognition where it exists and
// falls back to a clearly-labelled demo transcript. Audio is never stored.
// TODO(stt-adapter): streaming STT via POST /stt/token (en-IN / hi-IN, code-mix).
let on = false;
let rec: SpeechRecognition | null = null;
let sim: ReturnType<typeof setInterval> | null = null;

const DEMO = 'Work was a lot today. My manager moved the deadline again and I didn’t say anything. I keep thinking I should have. Priya texted, that helped a bit. I want to sleep before one tonight.'.split(' ');

export function stopDictation() {
  on = false;
  if (sim) clearInterval(sim);
  sim = null;
  if (rec) { try { rec.stop(); } catch { /* not started */ } rec = null; }
  if (getState().dictating) set({ dictating: false });
}

export function startDictation(notify: (msg: string) => void) {
  const base = getState().jText ? getState().jText.replace(/\s*$/, ' ') : '';
  on = true;
  set({ dictating: true });

  const simulate = () => {
    let i = 0;
    if (sim) clearInterval(sim);
    notify('Microphone isn’t available here, so this is demo dictation.');
    sim = setInterval(() => {
      if (!on || i >= DEMO.length) { if (sim) clearInterval(sim); sim = null; if (on) stopDictation(); return; }
      set(p => ({ jText: (i === 0 ? base : p.jText + ' ') + DEMO[i++] }));
    }, 220);
  };

  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) { simulate(); return; }
  let fin = '';
  try {
    const r = new SR();
    rec = r;
    r.lang = 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t.trim() + ' '; else interim += t;
      }
      set({ jText: base + fin + interim });
    };
    r.onerror = e => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) { rec = null; if (on) simulate(); }
    };
    r.onend = () => { if (rec === r) { rec = null; if (on && !sim) set({ dictating: false }); } };
    r.start();
  } catch { simulate(); }
}
