import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Config } from '../config.js';
import { unauthorized, unavailable } from '../errors.js';

const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Verify a Google Sign-In ID token (signature, issuer, audience, expiry). Returns the stable subject. */
export async function verifyGoogleIdToken(cfg: Pick<Config, 'GOOGLE_CLIENT_ID'>, idToken: string): Promise<{ sub: string; emailVerified: boolean }> {
  if (!cfg.GOOGLE_CLIENT_ID) throw unavailable('google_unavailable', 'Sign-in with Google isn’t set up yet.');
  try {
    const { payload } = await jwtVerify(idToken, jwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: cfg.GOOGLE_CLIENT_ID });
    if (!payload.sub) throw new Error('no subject');
    return { sub: payload.sub, emailVerified: payload.email_verified === true };
  } catch {
    throw unauthorized('That Google sign-in didn’t check out. Please try again.');
  }
}
