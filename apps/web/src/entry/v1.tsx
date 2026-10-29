import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '../App';
import '../styles/global.css';

export function mountV1(el: HTMLElement) {
  createRoot(el).render(<StrictMode><App /></StrictMode>);
}
