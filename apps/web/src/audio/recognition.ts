// Browser speech recognition used for turn-taking when no server STT vendor is connected. The finished transcript
// is sent as an ordinary turn, so safety, memory and the model behave exactly as they would with server audio.

export interface RecognitionHandlers {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onFatal(reason: 'denied' | 'unsupported'): void;
}

export function recognitionSupported(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class Recognizer {
  private rec: SpeechRecognition | null = null;
  private want = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** What was heard but not yet marked final. If the browser ends the session first, it is still said, not dropped. */
  private tail = '';

  constructor(private lang: string, private readonly h: RecognitionHandlers) {}

  start() {
    if (this.want) return;
    this.want = true;
    this.open();
  }

  private open() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognition; webkitSpeechRecognition?: new () => SpeechRecognition };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { this.want = false; this.h.onFatal('unsupported'); return; }
    const r = new SR();
    this.rec = r;
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript.trim();
        if (!t) continue;
        if (e.results[i].isFinal) { this.tail = ''; this.h.onFinal(t); } else { this.tail = t; this.h.onInterim(t); }
      }
    };
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.want = false; this.h.onFatal('denied'); }
    };
    // Browsers end recognition after silence; keep it going while the call is live.
    r.onend = () => {
      if (this.rec !== r) return;
      this.rec = null;
      if (this.tail) { const t = this.tail; this.tail = ''; this.h.onFinal(t); }
      if (this.want) this.timer = setTimeout(() => this.want && this.open(), 60);
    };
    try { r.start(); } catch { /* already started */ }
  }

  stop() {
    this.want = false;
    clearTimeout(this.timer);
    const r = this.rec;
    this.rec = null;
    if (r) { r.onend = null; try { r.stop(); } catch { /* not started */ } }
  }
}
