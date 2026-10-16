import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Config } from '../../config.js';
import type { AdminStore } from '../../db/admin-store.js';
import { HttpError } from '../../errors.js';

const accountSchema = z.object({
  username: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,47}$/),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(256),
});
export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
}).strict();

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [version, salt, key, extra] = encoded.split('$');
  if (version !== 'scrypt-v1' || extra !== undefined || !/^[a-f0-9]{32}$/.test(salt ?? '') ||
      !/^[a-f0-9]{128}$/.test(key ?? '')) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, 'hex'));
}

export class AuthService {
  private failures = 0;
  private until = 0;
  // Unknown identifiers do the same password work, preventing account probing.
  private readonly dummy = `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
  constructor(private readonly config: Config, private readonly store: AdminStore) {}

  async initialize() {
    if (this.store.adminAccount()) return;
    const { ADMIN_USERNAME: username, ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = this.config;
    if (!username && !email && !password) return;
    const result = accountSchema.safeParse({ username, email, password });
    if (!result.success) throw new Error('Set ADMIN_USERNAME (3–48 letters/numbers/._-), a valid ADMIN_EMAIL and ADMIN_PASSWORD (12–256 characters) to initialize admin login.');
    const account = result.data;
    this.store.createAdminAccount(account.username, account.email, await hashPassword(account.password));
  }
  configured() { return Boolean(this.store.adminAccount()); }

  async login(identifier: string, password: string) {
    if (!this.configured()) throw new HttpError(503, 'Admin login needs server-side setup.');
    const now = Date.now();
    if (this.until <= now) { this.failures = 0; this.until = now + 15 * 60 * 1000; }
    if (this.failures >= 10) throw new HttpError(429, 'Too many login attempts. Try again in 15 minutes.');
    // Increment before asynchronous hashing so concurrent attempts are bounded.
    this.failures++;
    const account = this.store.adminAccount()!;
    const name = identifier.trim().toLowerCase();
    const matches = name === account.username.toLowerCase() || name === account.email.toLowerCase();
    const valid = await verifyPassword(password, matches ? account.password_hash : this.dummy);
    if (!matches || !valid) throw new HttpError(401, 'Invalid username/email or password');
    this.failures = 0;
    return { authenticated: true, subject: 'admin' };
  }
}
