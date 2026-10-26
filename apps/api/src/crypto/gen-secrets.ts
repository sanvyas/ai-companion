import { randomBytes } from 'node:crypto';

const b64 = () => randomBytes(32).toString('base64');
console.log('# Paste into apps/api/.env (never commit, never share). Losing DATA_KEK makes all personal data unreadable.');
console.log(`JWT_SECRET=${randomBytes(48).toString('base64url')}`);
console.log(`DATA_KEK=${b64()}`);
console.log(`PHONE_HASH_KEY=${b64()}`);
console.log(`OTP_PEPPER=${randomBytes(24).toString('base64url')}`);
