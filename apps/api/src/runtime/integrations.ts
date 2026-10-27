import Anthropic from '@anthropic-ai/sdk';

// Every outside service the platform can use. The portal lists these, stores the credentials sealed in the database,
// and the live app reads them from there (falling back to the environment variable if none is saved).
// `live` means the app already uses the credential. `pending` means the key can be stored now, but the adapter
// that uses it has not been built yet, so saving it changes nothing for users.

export interface IntegrationField {
  name: string;
  label: string;
  /** Secret fields are write-only: the portal never gets them back. Public ones (a client id) can be shown. */
  secret: boolean;
  env?: string;
  pattern?: RegExp;
  hint?: string;
}

export interface TestResult { ok: boolean; note: string }

export interface IntegrationDef {
  id: string;
  label: string;
  category: 'AI' | 'Voice' | 'Messaging' | 'Sign-in' | 'Notifications' | 'Developer';
  purpose: string;
  status: 'live' | 'pending';
  statusNote: string;
  docsUrl: string;
  fields: IntegrationField[];
  /** Hosts to allow in a locked-down environment. */
  hosts: string[];
  test?: (v: Record<string, string>, fetchImpl: typeof fetch) => Promise<TestResult>;
}

async function testAnthropic(v: Record<string, string>): Promise<TestResult> {
  try {
    const page = await new Anthropic({ apiKey: v.api_key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
    return { ok: true, note: `Key accepted (${page.data.length ? 'models listed' : 'no models listed'}).` };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, note: 'Anthropic rejected this key.' };
    return { ok: false, note: `Couldn’t reach Anthropic: ${(e as Error).message}` };
  }
}

async function testGithub(v: Record<string, string>, f: typeof fetch): Promise<TestResult> {
  try {
    const r = await f('https://api.github.com/user', { headers: { Authorization: `Bearer ${v.token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'saathi-admin' }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 401) return { ok: false, note: 'GitHub rejected this token.' };
    if (!r.ok) return { ok: false, note: `GitHub answered ${r.status}.` };
    const j = (await r.json()) as { login?: string };
    return { ok: true, note: `Signed in as ${j.login ?? 'unknown'}.` };
  } catch (e) {
    return { ok: false, note: `Couldn’t reach GitHub: ${(e as Error).message}` };
  }
}

const key = (name = 'api_key', env?: string, extra: Partial<IntegrationField> = {}): IntegrationField => ({ name, label: 'API key', secret: true, env, ...extra });

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'anthropic', label: 'Anthropic (Claude)', category: 'AI', purpose: 'Conversations, the safety classifier, journal reading, summaries and the weekly letter.',
    status: 'live', statusNote: 'Used immediately. Change it and the next message uses the new key.', docsUrl: 'https://console.anthropic.com/settings/keys', hosts: ['api.anthropic.com'],
    fields: [key('api_key', 'ANTHROPIC_API_KEY', { pattern: /^sk-ant-[\w-]{20,}$/, hint: 'Starts with sk-ant-' })], test: testAnthropic,
  },
  {
    id: 'sarvam', label: 'Sarvam', category: 'Voice', purpose: 'Indic speech-to-text and text-to-speech (Hindi, Hinglish, English voices).',
    status: 'pending', statusNote: 'Key is stored. The voice adapter isn’t built yet; it comes after the vendor test.', docsUrl: 'https://dashboard.sarvam.ai', hosts: ['api.sarvam.ai'],
    fields: [key('api_key', 'SARVAM_API_KEY')],
  },
  {
    id: 'soniox', label: 'Soniox', category: 'Voice', purpose: 'Low-cost streaming speech-to-text (challenger in the vendor test).',
    status: 'pending', statusNote: 'Key is stored. The adapter isn’t built yet.', docsUrl: 'https://console.soniox.com', hosts: ['api.soniox.com', 'stt-rt.soniox.com'],
    fields: [key('api_key', 'SONIOX_API_KEY')],
  },
  {
    id: 'elevenlabs', label: 'ElevenLabs', category: 'Voice', purpose: 'Expressive text-to-speech, strongest for English.',
    status: 'pending', statusNote: 'Key is stored. The adapter isn’t built yet.', docsUrl: 'https://elevenlabs.io/app/settings/api-keys', hosts: ['api.elevenlabs.io'],
    fields: [key('api_key', 'ELEVENLABS_API_KEY')],
  },
  {
    id: 'assemblyai', label: 'AssemblyAI', category: 'Voice', purpose: 'Optional speech-to-text fallback with strong code-switching claims.',
    status: 'pending', statusNote: 'Key is stored. The adapter isn’t built yet.', docsUrl: 'https://www.assemblyai.com/dashboard', hosts: ['api.assemblyai.com', 'streaming.assemblyai.com'],
    fields: [key('api_key', 'ASSEMBLYAI_API_KEY')],
  },
  {
    id: 'msg91', label: 'MSG91', category: 'Messaging', purpose: 'Sign-in codes by SMS. Needs DLT registration first.',
    status: 'pending', statusNote: 'Credentials are stored. The SMS adapter isn’t built yet, so sign-in codes are not sent.', docsUrl: 'https://control.msg91.com', hosts: ['control.msg91.com', 'api.msg91.com'],
    fields: [key('auth_key', 'MSG91_AUTH_KEY', { label: 'Auth key' }), { name: 'sender_id', label: 'Sender ID (DLT header)', secret: false, env: 'MSG91_SENDER_ID' }, { name: 'template_id', label: 'OTP template ID', secret: false, env: 'MSG91_TEMPLATE_ID' }],
  },
  {
    id: 'google', label: 'Google sign-in', category: 'Sign-in', purpose: 'The “Continue with Google” button.',
    status: 'live', statusNote: 'Used immediately by the sign-in screen.', docsUrl: 'https://console.cloud.google.com/apis/credentials', hosts: ['accounts.google.com', 'www.googleapis.com'],
    fields: [{ name: 'client_id', label: 'OAuth client ID', secret: false, env: 'GOOGLE_CLIENT_ID', pattern: /^[\w.-]+\.apps\.googleusercontent\.com$/, hint: 'Ends with .apps.googleusercontent.com' }],
  },
  {
    id: 'webpush', label: 'Web push (VAPID)', category: 'Notifications', purpose: 'Notifications to browsers and the installed app.',
    status: 'live', statusNote: 'Used immediately. Changing the public key means people must re-enable notifications.', docsUrl: 'https://www.npmjs.com/package/web-push#command-line', hosts: [],
    fields: [{ name: 'public_key', label: 'Public key', secret: false, env: 'VAPID_PUBLIC_KEY' }, { name: 'private_key', label: 'Private key', secret: true, env: 'VAPID_PRIVATE_KEY' }, { name: 'subject', label: 'Contact (mailto:)', secret: false, env: 'VAPID_SUBJECT', pattern: /^(mailto:|https:\/\/).+/ }],
  },
  {
    id: 'github', label: 'GitHub', category: 'Developer', purpose: 'The Developer page: commits, pull requests, CI runs and deploy buttons.',
    status: 'live', statusNote: 'Used immediately by the Developer page.', docsUrl: 'https://github.com/settings/personal-access-tokens/new', hosts: ['api.github.com'],
    fields: [key('token', 'GITHUB_TOKEN', { label: 'Access token', hint: 'Fine-grained: Contents read, Pull requests read, Actions read and write, Metadata read.' })], test: testGithub,
  },
];

export const INTEGRATION_BY_ID = new Map(INTEGRATIONS.map(i => [i.id, i]));
