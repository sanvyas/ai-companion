import { describe, expect, it } from 'vitest';
import { s } from './css';

describe('the style string parser', () => {
  it('turns declarations into the object React wants', () => {
    expect(s('display:flex;gap:8px;font-size:15px')).toEqual({ display: 'flex', gap: '8px', fontSize: '15px' });
  });
  it('keeps semicolons and colons inside functions and urls together', () => {
    expect(s('background:linear-gradient(180deg,#fff 0%,#000 100%);box-shadow:0 8px 22px rgba(30,36,48,.05)')).toEqual({ background: 'linear-gradient(180deg,#fff 0%,#000 100%)', boxShadow: '0 8px 22px rgba(30,36,48,.05)' });
    expect(s('background:url(data:image/svg+xml;utf8,<svg/>)')).toEqual({ background: 'url(data:image/svg+xml;utf8,<svg/>)' });
  });
  it('handles custom properties, vendor prefixes, spaces and stray separators', () => {
    expect(s(' --x : 3px ;; -webkit-backdrop-filter:blur(4px); ')).toEqual({ '--x': '3px', WebkitBackdropFilter: 'blur(4px)' });
  });
  it('hands back the same object for the same string', () => {
    expect(s('color:red')).toBe(s('color:red'));
  });
});
