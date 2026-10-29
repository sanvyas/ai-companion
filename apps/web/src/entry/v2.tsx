import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import { AppV2 } from '../v2/AppV2';
import '../v2/v2.css';

export function mountV2(el: HTMLElement) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FAF7F2');
  createRoot(el).render(<StrictMode><AppV2 /></StrictMode>);
}
