import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppV2 } from '../v2/AppV2';
import '../v2/v2.css';

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap';

export function mountV2(el: HTMLElement) {
  if (!document.querySelector('link[data-v2-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = FONTS; l.dataset.v2Fonts = '1';
    document.head.appendChild(l);
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FFF9EE');
  createRoot(el).render(<StrictMode><AppV2 /></StrictMode>);
}
