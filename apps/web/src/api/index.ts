import { DemoApi } from './demo';
import { HttpApi } from './http';
import type { Api } from './types';

export * from './types';

// `?demo` is a design-review switch for development builds only. In a production build, adding it to the address does nothing:
// the real app can never be flipped onto fake data by editing the link. The shareable demo is a separate build (VITE_DEMO=1).
const demo = typeof location !== 'undefined' && ((import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) || import.meta.env.VITE_DEMO === '1');

/** `?demo` swaps in the in-memory stand-in for design review. Everything else talks to the real API. */
export const api: Api = demo ? new DemoApi() : new HttpApi();
export const isDemo = demo;
