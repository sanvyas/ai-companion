import { describe, expect, it } from 'vitest';
import { inAppBrowser, iosStandalone, openInBrowserHref } from './GoogleButton';

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

describe('getting out of a browser Google refuses', () => {
  const page = 'https://saathi-api-mpdh.onrender.com/?ui=3';
  it('sends Android to Chrome, and falls back to the address if Chrome is missing', () => {
    const h = openInBrowserHref(page, 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Instagram 300.0')!;
    expect(h).toMatch(/^intent:\/\/saathi-api-mpdh\.onrender\.com\/\?ui=3#Intent;scheme=https;package=com\.android\.chrome;/);
    expect(h).toContain(`S.browser_fallback_url=${encodeURIComponent(page)}`);
  });
  it('has no such link on iPhone, where the address is copied instead', () => {
    expect(openInBrowserHref(page, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) [LinkedInApp]')).toBeNull();
  });
});

describe('an iPhone app on the Home Screen', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  it('is told apart from Safari itself and from Android', () => {
    expect(iosStandalone(iphone, true)).toBe(true);
    expect(iosStandalone(iphone, false)).toBe(false);
    expect(iosStandalone('Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120', true)).toBe(false);
  });
});
