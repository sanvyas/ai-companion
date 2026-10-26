import { DemoApi } from './demo';
import { HttpApi } from './http';
import type { Api } from './types';

export * from './types';

const demo = typeof location !== 'undefined' && (new URLSearchParams(location.search).has('demo') || import.meta.env.VITE_DEMO === '1');

/** `?demo` swaps in the in-memory stand-in for design review. Everything else talks to the real API. */
export const api: Api = demo ? new DemoApi() : new HttpApi();
export const isDemo = demo;
