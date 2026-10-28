// Joins what a browser's speech recognition has heard so far into one text.
//
// Browsers differ: most return each phrase as its own result, but some Android builds return results that repeat or
// extend the one before ("hello", "hello how", "hello how are you"). Appending those blindly says everything several times,
// so a result that merely extends the previous one replaces it instead.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function mergeTranscripts(parts: string[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined) {
      if (same(prev, t)) continue;
      if (t.toLowerCase().startsWith(prev.toLowerCase() + ' ')) { out[out.length - 1] = t; continue; }
      if (prev.toLowerCase().startsWith(t.toLowerCase() + ' ')) continue;
    }
    out.push(t);
  }
  return out.join(' ');
}

/** Puts new speech after what is already written, with exactly one space between. */
export const appendSpeech = (written: string, spoken: string) => {
  const w = written.replace(/\s+$/, '');
  const s = spoken.trim();
  if (!s) return written;
  return w ? `${w} ${s}` : s;
};
