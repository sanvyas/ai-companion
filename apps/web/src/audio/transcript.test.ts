import { describe, expect, it } from 'vitest';
import { appendSpeech, mergeTranscripts } from './transcript';

describe('joining what was heard', () => {
  it('keeps every phrase, in order', () => {
    expect(mergeTranscripts(['work was a lot', 'my manager moved the deadline', 'I did not say anything'])).toBe('work was a lot my manager moved the deadline I did not say anything');
  });

  it('does not repeat itself when a browser sends growing versions of the same phrase', () => {
    expect(mergeTranscripts(['hello', 'hello how', 'hello how are you'])).toBe('hello how are you');
    expect(mergeTranscripts(['hello how are you', 'hello how'])).toBe('hello how are you');
    expect(mergeTranscripts(['yes', 'yes'])).toBe('yes');
  });

  it('keeps a real repeat that is not just an extension', () => {
    expect(mergeTranscripts(['I said no', 'no I said no'])).toBe('I said no no I said no');
  });

  it('ignores empty pieces and tidies spaces', () => {
    expect(mergeTranscripts(['  ', ' a  b ', '', 'c'])).toBe('a b c');
  });

  it('adds speech after what is already written with a single space', () => {
    expect(appendSpeech('I started typing  ', 'then I spoke')).toBe('I started typing then I spoke');
    expect(appendSpeech('', 'hello')).toBe('hello');
    expect(appendSpeech('kept', '  ')).toBe('kept');
  });
});
