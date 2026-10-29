import { describe, expect, it } from 'vitest';
import { inAppBrowser } from './GoogleButton';

describe('browsers Google refuses to sign people in with', () => {
  it('spots the browsers built into WhatsApp, Instagram and Facebook', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Instagram 300.0')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/430.0]')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 12; SM-A525F; wv) AppleWebKit/537.36 Version/4.0 Chrome/110 Mobile Safari/537.36')).toBe(true);
  });
  it('leaves ordinary Chrome and Safari alone', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36')).toBe(false);
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(inAppBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36')).toBe(false);
  });
});
