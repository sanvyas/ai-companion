import { isDemo } from '../api';
import { getState, set } from '../state/store';

// Dictation into the journal (PRD 8.5.2): live transcript into the text area, editable afterwards, audio never kept.
// Uses the browser's recognition. Without it the person is told plainly, rather than shown a made-up transcript.
// The scripted transcript is demo-mode only.
// TODO(stt-adapter): stream through the server STT vendor via POST /stt/token once one is connected.
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

  const fallback = (why: string) => {
    if (!isDemo) { stopDictation(); notify(why); return; }
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
  let fin = '';
  try {
    const r = new SR();
    rec = r;
    r.lang = getState().me?.language === 'hi' ? 'hi-IN' : 'en-IN';
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
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) { rec = null; if (on) fallback('I can’t reach the microphone. Check the browser’s permission, or type instead.'); }
    };
    r.onend = () => { if (rec === r) { rec = null; if (on && !sim) set({ dictating: false }); } };
    r.start();
  } catch { fallback('Dictation couldn’t start. You can type instead.'); }
}
