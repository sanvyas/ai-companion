import type { FastifyBaseLogger } from 'fastify';
import { unavailable } from '../errors.js';

// Adapter for sending the sign-in code. No SMS vendor is chosen yet (Twilio Verify, MSG91, ...): add a class
// implementing OtpProvider, return it from createOtp, and set OTP_PROVIDER. Until then production refuses
// phone sign-in with a clear error instead of pretending to send.
export interface OtpProvider {
  readonly name: string;
  readonly canSend: boolean;
  send(e164: string, code: string): Promise<void>;
}

class UnconfiguredOtp implements OtpProvider {
  readonly name = 'none';
  readonly canSend = false;
  async send(): Promise<void> {
    throw unavailable('otp_unavailable', 'Sign-in by phone isn’t set up yet.');
  }
}

/** Development only: writes the code to the server log. The API also echoes it as devCode. */
class ConsoleOtp implements OtpProvider {
  readonly name = 'console';
  readonly canSend = true;
  constructor(private readonly log: FastifyBaseLogger) {}
  async send(e164: string, code: string): Promise<void> {
    this.log.warn({ to: e164.slice(0, 3) + '*******' + e164.slice(-2) }, `DEV OTP ${code}`);
  }
}

export function createOtp(kind: 'none' | 'console', log: FastifyBaseLogger): OtpProvider {
  return kind === 'console' ? new ConsoleOtp(log) : new UnconfiguredOtp();
}
