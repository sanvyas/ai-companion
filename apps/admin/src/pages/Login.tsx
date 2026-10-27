import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, setCsrf } from '../lib/api';
import { useSession } from '../lib/session';
import { Button, Field } from '../lib/ui';

type Step = { kind: 'password' } | { kind: 'totp' } | { kind: 'enrol'; secret: string; uri: string };

export function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');

  useEffect(() => { if (step.kind === 'enrol') void QRCode.toDataURL(step.uri, { margin: 1, width: 168 }).then(setQr); }, [step]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submitPassword = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await api.post<{ step: 'totp' | 'enrol'; enrol?: { secret: string; uri: string } }>('/auth/login', { email, password });
    setPassword('');
    setStep(r.step === 'enrol' && r.enrol ? { kind: 'enrol', ...r.enrol } : { kind: 'totp' });
  }); };

  const submitCode = (e: React.FormEvent) => { e.preventDefault(); void run(async () => {
    const r = await api.post<{ csrf: string }>('/auth/totp', { code });
    setCsrf(r.csrf);
    await refresh();
  }); };

  return (
    <main className="login">
      <div className="card">
        <div className="row"><span className="logo" style={{ width: 32, height: 32, borderRadius: 9, background: '#2F6F66', display: 'grid', placeItems: 'center' }}><svg width="18" height="18" viewBox="0 0 64 64" aria-hidden><circle cx="32" cy="32" r="18" fill="#FBF7F0" /><circle cx="32" cy="32" r="7" fill="#2F6F66" /></svg></span><div><h1>Saathi Control Room</h1></div></div>

        {step.kind === 'password' && (
          <form className="stack" onSubmit={submitPassword}>
            <p className="muted">Sign in to manage the app, its AI and its costs.</p>
            <Field label="Email">{id => <input id={id} className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus />}</Field>
            <Field label="Password">{id => <input id={id} className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />}</Field>
            {error && <div className="banner bad" role="alert">{error}</div>}
            <Button variant="primary" type="submit" busy={busy}>Continue</Button>
          </form>
        )}

        {step.kind !== 'password' && (
          <form className="stack" onSubmit={submitCode}>
            {step.kind === 'enrol' ? (
              <>
                <p>Set up your authenticator app. Scan this code with Google Authenticator, 1Password or Authy, then enter the 6-digit code it shows.</p>
                {qr && <img className="qr" src={qr} width={168} height={168} alt="QR code for your authenticator app" />}
                <details><summary className="muted">Can’t scan? Enter the key by hand</summary><code className="mono" style={{ wordBreak: 'break-all' }}>{step.secret}</code></details>
              </>
            ) : <p>Enter the 6-digit code from your authenticator app.</p>}
            <Field label="6-digit code">{id => <input id={id} className="input mono" inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus required />}</Field>
            {error && <div className="banner bad" role="alert">{error}</div>}
            <Button variant="primary" type="submit" busy={busy}>Sign in</Button>
            <Button variant="ghost" onClick={() => { setStep({ kind: 'password' }); setCode(''); setError(null); }}>Back</Button>
          </form>
        )}
      </div>
    </main>
  );
}
