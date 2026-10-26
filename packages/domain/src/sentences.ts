// Incremental sentence splitter for streamed model output. Voice needs whole sentences (one TTS call each)
// and the output check needs a unit to judge. Handles English full stops, the Devanagari danda, ? and !,
// and avoids splitting after short abbreviations and numbers like "Dr." or "3.5".

const ABBREV = /(?:\b(?:dr|mr|mrs|ms|st|vs|etc|e\.g|i\.e)|\b\d)\.$/i;

export class SentenceSplitter {
  private buf = '';

  /** Feed a text delta; returns any sentences that are now complete. */
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    for (;;) {
      const m = /[.!?।…]+["”’)]*(\s+|$)|\n+/.exec(this.buf);
      if (!m) break;
      const end = m.index + m[0].length;
      // A terminator at the very end of the buffer may still grow ("3." then "5"), wait for more text.
      if (end === this.buf.length && !/\s$|\n$/.test(m[0])) break;
      const candidate = this.buf.slice(0, end).trim();
      if (ABBREV.test(candidate.replace(/\s+$/, '')) || candidate.length < 3) {
        // Not a real boundary yet: look for the next one by temporarily skipping this terminator.
        const next = this.buf.slice(end).search(/[.!?।…]+["”’)]*(\s+|$)|\n+/);
        if (next === -1) break;
        const cut = end + next + (/[.!?।…]+["”’)]*(\s+|$)|\n+/.exec(this.buf.slice(end))![0].length);
        out.push(this.buf.slice(0, cut).trim());
        this.buf = this.buf.slice(cut);
        continue;
      }
      out.push(candidate);
      this.buf = this.buf.slice(end);
    }
    return out.filter(Boolean);
  }

  /** Flush whatever is left when the stream ends. */
  end(): string[] {
    const rest = this.buf.trim();
    this.buf = '';
    return rest ? [rest] : [];
  }
}

export function splitSentences(text: string): string[] {
  const s = new SentenceSplitter();
  return [...s.push(text + ' '), ...s.end()];
}

/** Strip an optional leading <emotion>tag</emotion> (video mode) and return both parts. */
export function takeEmotion(text: string): { emotion: string | null; rest: string } {
  const m = /^\s*<emotion>\s*(idle|listening|thinking|concerned|smiling)\s*<\/emotion>\s*/i.exec(text);
  return m ? { emotion: m[1].toLowerCase(), rest: text.slice(m[0].length) } : { emotion: null, rest: text };
}
