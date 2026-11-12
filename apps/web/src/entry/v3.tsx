import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import { AppV3 } from '../v3/AppV3';
import '../v3/v3.css';

export function mountV3(el: HTMLElement) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FBF7F0');
  createRoot(el).render(<StrictMode><AppV3 /></StrictMode>);
}
