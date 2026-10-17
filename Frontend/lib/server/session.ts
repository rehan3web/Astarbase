import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const COOKIE = 'sorabase_session'
export function adminToken() { return process.env.ADMIN_API_TOKEN ?? '' }
export function sessionSecret() {
  const secret = process.env.SESSION_SECRET ?? ''
  // The old human-facing token is already known to former token-login users.
  // Reusing it would let them forge password-login cookies without a password.
  return secret !== adminToken() ? secret : ''
}
const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(`studio-session:${payload}`).digest('base64url')
export function issueSession(secret: string) {
  const payload = Buffer.from(JSON.stringify({ kind: 'admin-password-v1', subject: 'admin', expires: Date.now() + 8 * 60 * 60 * 1000, nonce: randomBytes(24).toString('hex') })).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}
export function verifySession(value: string | undefined, secret: string) {
  if (!value || secret.length < 32) return false
  try {
    const [payload, signature, extra] = value.split('.')
    if (extra || !payload || !signature) return false
    const expected = Buffer.from(sign(payload, secret))
    const submitted = Buffer.from(signature)
    if (expected.length !== submitted.length || !timingSafeEqual(expected, submitted)) return false
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return session.kind === 'admin-password-v1' && session.subject === 'admin' &&
      Number.isSafeInteger(session.expires) && session.expires > Date.now()
  } catch { return false }
}
export function validOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  try {
    const host = new URL(origin).host
    return host === request.headers.get('host') || host === request.headers.get('x-forwarded-host')
  } catch { return false }
}
