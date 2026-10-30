import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/figtree/wght.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { AppV3 } from '../v3/AppV3';
import '../v3/v3.css';

export function mountV3(el: HTMLElement) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FAF6EF');
  createRoot(el).render(<StrictMode><AppV3 /></StrictMode>);
}
