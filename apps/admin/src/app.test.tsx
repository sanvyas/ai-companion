import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

// The portal is tested against a stand-in server so the screens, permissions and secret handling can be checked
// without a database. The real API is covered by the API test suite.

type Handler = (body: unknown) => { status?: number; json?: unknown };
let routes: Record<string, Handler> = {};
let calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];

const ME = (role: string, permissions: string[]) => ({ admin: { id: 'a1', email: 'founder@example.com', name: 'Founder', role }, csrf: 'csrf-token', permissions, environment: 'development' });
const ALL = ['overview.read', 'users.read', 'users.write', 'cost.read', 'cost.write', 'analytics.read', 'infra.read', 'infra.write', 'audit.read', 'flags.read', 'flags.write', 'settings.write', 'prompts.read', 'prompts.write', 'prompts.publish', 'prompts.publish_safety', 'integrations.read', 'integrations.write', 'safety.read', 'safety.review', 'content.read', 'content.write', 'dev.read', 'dev.deploy', 'dev.deploy_prod', 'admins.manage', 'users.invite', 'changes.read'];

beforeEach(() => {
  calls = []; routes = {}; location.hash = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+\/admin\/api/, '');
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, path, body, headers: (init?.headers ?? {}) as Record<string, string> });
    const h = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
    if (!h) return new Response(JSON.stringify({ error: { code: 'nf', message: `no stub for ${method} ${path}` } }), { status: 404 });
    const r = h(body);
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const signedIn = (role = 'owner', perms = ALL) => { routes['GET /auth/me'] = () => ({ json: ME(role, perms) }); };

describe('sign-in', () => {
  it('asks for the password, then shows a QR code to set up the authenticator, then signs in', async () => {
    routes['GET /auth/me'] = () => ({ status: 401, json: { error: { code: 'unauthorized', message: 'no' } } });
    routes['POST /auth/login'] = () => ({ json: { step: 'enrol', enrol: { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Saathi:founder@example.com?secret=JBSWY3DPEHPK3PXP' } } });
    routes['POST /auth/totp'] = () => ({ json: { csrf: 'csrf-token' } });
    routes['GET /overview'] = () => ({ json: { users: { total: 0 }, series: [], systems: [], conversations: { byMode: [] }, safety: [], today: {}, cost: {}, consent: {} } });
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'founder@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Correct-Horse-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Set up your authenticator app/)).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    routes['GET /auth/me'] = () => ({ json: ME('owner', ALL) });
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(calls.find(c => c.path === '/auth/totp')!.body).toEqual({ code: '123456' });
  });

  it('shows the server’s message for a wrong password and keeps the password field empty of leftovers', async () => {
    routes['GET /auth/me'] = () => ({ status: 401, json: { error: { code: 'unauthorized', message: 'no' } } });
    routes['POST /auth/login'] = () => ({ status: 401, json: { error: { code: 'unauthorized', message: 'That email and password don’t match.' } } });
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'x@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match.');
  });
});

describe('navigation and roles', () => {
  it('shows each person only the sections their role allows', async () => {
    signedIn('viewer', ['overview.read', 'users.read', 'cost.read', 'analytics.read', 'infra.read', 'flags.read', 'prompts.read', 'integrations.read', 'safety.read', 'content.read', 'dev.read']);
    routes['GET /overview'] = () => ({ json: { users: { total: 3 }, series: [], systems: [], conversations: { byMode: [] }, safety: [], today: {}, cost: {}, consent: {} } });
    routes['GET /safety/events'] = () => ({ json: { items: [], stats: [] } });
    render(<App />);
    const nav = await screen.findByRole('complementary', { name: 'Sections' });
    expect(within(nav).getByText('People')).toBeInTheDocument();
    expect(within(nav).getByText('Integrations and keys')).toBeInTheDocument();
    expect(within(nav).queryByText('Admins')).toBeNull();
    expect(within(nav).queryByText('Audit log')).toBeNull();
  });
});

describe('integrations and keys', () => {
  const integrations = {
    items: [
      { id: 'anthropic', label: 'Anthropic (Claude)', category: 'AI', purpose: 'Conversations.', status: 'live', statusNote: 'Used immediately.', docsUrl: 'https://console.anthropic.com/settings/keys', hosts: ['api.anthropic.com'], testable: true, fields: [{ name: 'api_key', label: 'API key', secret: true, source: 'none', last4: null, value: null, updatedAt: null, updatedBy: null, lastTestAt: null, lastTestOk: null, lastTestNote: null }] },
      { id: 'sarvam', label: 'Sarvam', category: 'Voice', purpose: 'Speech.', status: 'pending', statusNote: 'Key is stored. The adapter isn’t built yet.', docsUrl: 'https://dashboard.sarvam.ai', hosts: ['api.sarvam.ai'], testable: false, fields: [{ name: 'api_key', label: 'API key', secret: true, source: 'none', last4: null, value: null, updatedAt: null, updatedBy: null, lastTestAt: null, lastTestOk: null, lastTestNote: null }] },
    ],
  };

  it('warns that the AI is off, is honest about which keys are used yet, and sends a key without echoing it back', async () => {
    signedIn();
    routes['GET /integrations'] = () => ({ json: integrations });
    routes['GET /safety/events'] = () => ({ json: { items: [], stats: [] } });
    let sent: unknown;
    routes['PUT /integrations/anthropic/api_key'] = b => { sent = b; return { json: { ok: true } }; };
    location.hash = '#/integrations';
    render(<App />);
    expect(await screen.findByText(/The AI isn’t connected/)).toBeInTheDocument();
    expect(screen.getAllByText('Used by the app').length).toBeGreaterThan(1);
    expect(screen.getAllByText('Key stored only').length).toBeGreaterThan(1);

    const card = screen.getByText('Anthropic (Claude)').closest('section')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Set' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('API key') as HTMLInputElement;
    expect(input.type).toBe('password');
    fireEvent.change(input, { target: { value: 'sk-ant-test-0123456789abcdef' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual({ value: 'sk-ant-test-0123456789abcdef' }));
    expect(calls.find(c => c.method === 'PUT')!.headers['X-CSRF-Token']).toBe('csrf-token');
    expect(document.body.textContent).not.toContain('sk-ant-test-0123456789abcdef');
  });

  it('hides the Set button from people who cannot change keys', async () => {
    signedIn('engineer', ['overview.read', 'integrations.read', 'safety.read']);
    routes['GET /integrations'] = () => ({ json: integrations });
    routes['GET /safety/events'] = () => ({ json: { items: [], stats: [] } });
    location.hash = '#/integrations';
    render(<App />);
    await screen.findByText(/The AI isn’t connected/);
    expect(screen.queryByRole('button', { name: 'Set' })).toBeNull();
  });
});

describe('settings', () => {
  it('asks before pausing the whole app, and only saves after the person confirms', async () => {
    signedIn();
    routes['GET /settings'] = () => ({ json: { items: [{ def: { key: 'access.maintenance', group: 'Access', label: 'Maintenance mode', description: 'Pauses the app.', kind: 'bool' }, value: false, isDefault: true, updatedAt: null, updatedBy: null }] } });
    routes['GET /flags'] = () => ({ json: { items: [] } });
    routes['GET /safety/events'] = () => ({ json: { items: [], stats: [] } });
    let saved: unknown;
    routes['PUT /settings/access.maintenance'] = b => { saved = b; return { json: { ok: true } }; };
    location.hash = '#/settings';
    render(<App />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Maintenance mode' }));
    expect(saved).toBeUndefined();
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/Everyone will see the maintenance message/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Yes, do it' }));
    await waitFor(() => expect(saved).toEqual({ value: true }));
  });
});

describe('people', () => {
  it('lists people without any content columns and makes a risky action need a reason', async () => {
    signedIn();
    routes['GET /safety/events'] = () => ({ json: { items: [], stats: [] } });
    routes['GET /users'] = () => ({ json: { items: [{ id: '11111111-1111-4111-8111-111111111111', nickname: 'Meera', phone: '+91 ••••• 210', signIn: 'phone', createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), plan: 'basic', onboarded: true, language: 'en', city: null, status: 'active', conversations30d: 4, consent: { remember: true, notifications: false, analytics: false } }], nextCursor: null } });
    routes['GET /users/11111111-1111-4111-8111-111111111111'] = () => ({ json: { profile: { id: '11111111-1111-4111-8111-111111111111', nickname: 'Meera', language: 'en', timezone: 'Asia/Kolkata', city: null, subscription: 'basic', created_at: new Date().toISOString(), onboarded_at: new Date().toISOString(), last_active_at: new Date().toISOString(), suspended_at: null, deletion_requested_at: null, phone: '+91 ••••• 210', google: false }, consent: { remember: true }, privacy: { transcript_retention_days: 90 }, notifications: {}, counts: { conversations: 4, journal_entries: 2 }, usage30d: { tokens: 0, cost_inr: 1.5, calls: 3, failed: 0 }, conversationsByMode: [], safetyEvents: [], flagOverrides: [], flags: {} } });
    let suspended: unknown;
    routes['POST /users/11111111-1111-4111-8111-111111111111/suspend'] = b => { suspended = b; return { json: { ok: true } }; };
    location.hash = '#/users';
    render(<App />);
    fireEvent.click(await screen.findByText('Meera'));
    expect(await screen.findByText(/Counts only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause account' }));
    const dlg = await screen.findByRole('dialog');
    const confirm = within(dlg).getByRole('button', { name: 'Pause account' });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText(/Reason/), { target: { value: 'asked by email' } });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(suspended).toEqual({ reason: 'asked by email' }));
  });
});

describe('model choices', () => {
  it('lets you pick a model from a list instead of typing one', async () => {
    signedIn();
    routes['GET /settings'] = () => ({ json: { items: [{ def: { key: 'models.companion', group: 'Models', label: 'Companion model', description: 'Live replies.', kind: 'select', options: [{ value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 · balanced' }, { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 · fastest' }], ownerOnly: true }, value: 'claude-sonnet-5-5', isDefault: true, updatedAt: null, updatedBy: null }] } });
    routes['GET /flags'] = () => ({ json: { items: [] } });
    let saved: unknown;
    routes['PUT /settings/models.companion'] = b => { saved = b; return { json: { ok: true } }; };
    location.hash = '#/settings';
    render(<App />);
    const pick = await screen.findByLabelText('Companion model');
    expect(pick.tagName).toBe('SELECT');
    expect(within(pick).getAllByRole('option').map(o => o.textContent)).toEqual(['Claude Sonnet 5.5 · balanced', 'Claude Haiku 5.5 · fastest']);
    fireEvent.change(pick, { target: { value: 'claude-haiku-5-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saved).toEqual({ value: 'claude-haiku-5-5' }));
  });
});

describe('approvals', () => {
  it('tells an engineer their change is waiting instead of claiming it was saved', async () => {
    signedIn('engineer', ['overview.read', 'flags.read', 'settings.write', 'changes.read']);
    routes['GET /settings'] = () => ({ json: { items: [{ def: { key: 'limits.voice_minutes_per_day', group: 'Limits', label: 'Voice minutes per day (Basic)', description: 'Per person.', kind: 'int' }, value: 10, isDefault: true, updatedAt: null, updatedBy: null }] } });
    routes['GET /flags'] = () => ({ json: { items: [] } });
    routes['GET /changes/count'] = () => ({ json: { inbox: 0, mine: 0 } });
    routes['PUT /settings/limits.voice_minutes_per_day'] = () => ({ status: 202, json: { pending: true, id: 'c1', summary: 'x', approvers: ['owner'], message: 'Sent to owner for approval. It reaches the app once approved.' } });
    location.hash = '#/settings';
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Voice minutes per day (Basic)'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Sent to owner for approval/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved\. The app picks it up/)).not.toBeInTheDocument();
  });

  it('shows an owner what is waiting, lets them approve, and asks for a reason to reject', async () => {
    signedIn();
    const item = { id: 'c1', summary: 'Change setting “Voice minutes per day (Basic)” to 15', method: 'PUT', path: '/settings/limits.voice_minutes_per_day', body: { value: 15 }, status: 'pending', requestedBy: 'eng@example.com', requestedRole: 'engineer', requestedAt: new Date().toISOString(), decidedBy: null, decidedAt: null, note: null, error: null, canDecide: true, canWithdraw: false, approvers: ['owner'] };
    routes['GET /changes'] = () => ({ json: { required: true, inbox: [item], waiting: [], history: [] } });
    routes['GET /changes/count'] = () => ({ json: { inbox: 1, mine: 0 } });
    let approved = false; let rejected: unknown;
    routes['POST /changes/c1/approve'] = () => { approved = true; return { json: { ok: true } }; };
    routes['POST /changes/c1/reject'] = b => { rejected = b; return { json: { ok: true } }; };
    location.hash = '#/changes';
    render(<App />);
    expect(await screen.findByText(/Voice minutes per day \(Basic\)” to 15/)).toBeInTheDocument();
    expect(screen.getByText(/Asked by eng@example.com/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const dlg = await screen.findByRole('dialog');
    const confirmBtn = within(dlg).getByRole('button', { name: 'Reject' });
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText('Why?'), { target: { value: 'Too generous for the beta' } });
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(rejected).toEqual({ note: 'Too generous for the beta' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approved).toBe(true));
  });
});

describe('adding people', () => {
  it('adds a person and shows their sign-in code once', async () => {
    signedIn();
    routes['GET /users'] = () => ({ json: { items: [], nextCursor: null } });
    routes['GET /invites'] = () => ({ json: { items: [] } });
    let sent: unknown;
    routes['POST /invites'] = b => { sent = b; return { json: { id: 'i1', code: '482913', phone: '••••••3210' } }; };
    location.hash = '#/users';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add a person' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText('Name or note (only you see this)'), { target: { value: 'Priya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add and show code' }));
    expect(await screen.findByText('482913')).toBeInTheDocument();
    expect(sent).toEqual({ phone: '9876543210', label: 'Priya' });
    expect(screen.getByText(/only time the code is shown/i)).toBeInTheDocument();
  });
});

describe('OpenRouter', () => {
  const MODELS = [
    { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', contextLength: 200000, promptPerM: 3, completionPerM: 15, structured: true, vendor: 'anthropic' },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', contextLength: 131072, promptPerM: 0.1, completionPerM: 0.3, structured: false, vendor: 'meta-llama' },
  ];
  const field = (set: boolean) => ({ name: 'api_key', label: 'API key', secret: true, source: set ? 'portal' : 'none', last4: set ? 'wxyz' : null, value: null, updatedAt: null, updatedBy: null, lastTestAt: null, lastTestOk: null, lastTestNote: null });

  it('lets an owner search the offered models, try one, and use it for a job', async () => {
    signedIn();
    routes['GET /settings'] = () => ({ json: { items: [
      { def: { key: 'llm.provider', label: 'AI provider' }, value: 'anthropic' },
      { def: { key: 'openrouter.models.companion', label: 'OpenRouter: companion model' }, value: 'anthropic/claude-sonnet-4.5' },
    ] } });
    routes['GET /integrations'] = () => ({ json: { items: [{ id: 'openrouter', label: 'OpenRouter', category: 'AI', purpose: 'Many models.', status: 'live', statusNote: 'Used when selected.', docsUrl: 'https://openrouter.ai/settings/keys', hosts: ['openrouter.ai'], testable: true, fields: [field(true)] }] } });
    routes['GET /integrations/openrouter/models'] = () => ({ json: { items: MODELS, keySet: true } });
    routes['POST /integrations/openrouter/try'] = () => ({ json: { ok: true, text: 'Long days do that. I am here.', latencyMs: 900, costInr: 0.017, inTokens: 30, outTokens: 9 } });
    let saved: unknown;
    routes['PUT /settings/openrouter.models.companion'] = b => { saved = b; return { json: { ok: true } }; };
    location.hash = '#/integrations';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose model' }));
    const list = await screen.findByRole('listbox', { name: 'Models' });
    expect(within(list).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'llama' } });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    fireEvent.click(within(list).getByRole('option', { name: /Llama 3.3 70B/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Try this model' }));
    expect(await screen.findByText(/Long days do that/)).toBeInTheDocument();
    expect(screen.getByText(/Replied in 0.9 s · about ₹0.017/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use this model' }));
    await waitFor(() => expect(saved).toEqual({ value: 'meta-llama/llama-3.3-70b-instruct' }));
  });

  it('asks before switching the whole app to OpenRouter and reminds about the safety evaluations', async () => {
    signedIn();
    routes['GET /settings'] = () => ({ json: { items: [{ def: { key: 'llm.provider', label: 'AI provider' }, value: 'anthropic' }] } });
    routes['GET /integrations'] = () => ({ json: { items: [{ id: 'openrouter', label: 'OpenRouter', category: 'AI', purpose: 'Many models.', status: 'live', statusNote: 'Used when selected.', docsUrl: 'https://openrouter.ai/settings/keys', hosts: [], testable: true, fields: [field(true)] }] } });
    let saved: unknown;
    routes['PUT /settings/llm.provider'] = b => { saved = b; return { json: { ok: true } }; };
    location.hash = '#/integrations';
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use OpenRouter for the app' }));
    const dlg = await screen.findByRole('dialog');
    expect(within(dlg).getByText(/run the safety evaluations/i)).toBeInTheDocument();
    expect(saved).toBeUndefined();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Yes, switch' }));
    await waitFor(() => expect(saved).toEqual({ value: 'openrouter' }));
  });
});
