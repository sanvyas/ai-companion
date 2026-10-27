import { lazy, Suspense } from 'react';
import { Layout } from './Layout';
import { Login } from './pages/Login';
import { useRoute } from './lib/router';
import { SessionProvider, useSession } from './lib/session';
import { Empty, Loading, ToastProvider } from './lib/ui';
import { Overview } from './pages/Overview';

const pages: Record<string, ReturnType<typeof lazy>> = {
  users: lazy(() => import('./pages/Users').then(m => ({ default: m.Users }))),
  cost: lazy(() => import('./pages/Cost').then(m => ({ default: m.Cost }))),
  prompts: lazy(() => import('./pages/Prompts').then(m => ({ default: m.Prompts }))),
  evals: lazy(() => import('./pages/Evals').then(m => ({ default: m.Evals }))),
  safety: lazy(() => import('./pages/Safety').then(m => ({ default: m.Safety }))),
  settings: lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings }))),
  content: lazy(() => import('./pages/Content').then(m => ({ default: m.Content }))),
  analytics: lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics }))),
  integrations: lazy(() => import('./pages/Integrations').then(m => ({ default: m.Integrations }))),
  infra: lazy(() => import('./pages/Infra').then(m => ({ default: m.Infra }))),
  developer: lazy(() => import('./pages/Developer').then(m => ({ default: m.Developer }))),
  audit: lazy(() => import('./pages/Audit').then(m => ({ default: m.Audit }))),
  admins: lazy(() => import('./pages/Admins').then(m => ({ default: m.Admins }))),
};

function Routes() {
  const route = useRoute();
  const Page = pages[route[0]];
  if (route[0] === 'overview') return <Overview />;
  if (!Page) return <Empty>That page doesn’t exist.</Empty>;
  return <Suspense fallback={<Loading />}><Page /></Suspense>;
}

function Gate() {
  const { me, ready } = useSession();
  if (!ready) return <Loading />;
  if (!me) return <Login />;
  return <Layout><Routes /></Layout>;
}

export function App() {
  return <ToastProvider><SessionProvider><Gate /></SessionProvider></ToastProvider>;
}
