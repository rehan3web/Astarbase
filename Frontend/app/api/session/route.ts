import { NextRequest, NextResponse } from 'next/server'
import { sessionSecret, COOKIE, issueSession, validOrigin, verifySession } from '@/lib/server/session'
import { adminAuth } from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const attempts = new Map<string, { count: number; until: number }>()
async function readLogin(req: NextRequest) {
  const reader = req.body?.getReader()
  if (!reader) throw new Error('Invalid request')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 4096) { await reader.cancel(); throw new Error('Invalid request') }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString())
  } finally { reader.releaseLock() }
}
export async function GET(req: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  const secret = sessionSecret()
  if (secret.length < 32) return NextResponse.json({ authenticated: false, configured: false }, { headers })
  const authenticated = verifySession(req.cookies.get(COOKIE)?.value, secret)
  if (authenticated) return NextResponse.json({ authenticated: true, configured: true }, { headers })
  try {
    const result = await adminAuth('/auth/status')
    return NextResponse.json({ authenticated: false, configured: result.status === 200 && result.data.configured === true }, { headers })
  } catch { return NextResponse.json({ authenticated: false, configured: false }, { headers }) }
}
export async function POST(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const secret = sessionSecret()
  if (secret.length < 32) return NextResponse.json({ error: 'Admin login needs server-side setup.' }, { status: 503 })
  const key = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local'
  const now = Date.now()
  for (const [ip, row] of attempts) if (row.until < now) attempts.delete(ip)
  if (!attempts.has(key) && attempts.size >= 10000) return NextResponse.json({ error: 'Try again later' }, { status: 429 })
  const row = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 }
  if (row.count >= 10) return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
  row.count++
  attempts.set(key, row)
  let input: { identifier?: unknown; password?: unknown; token?: unknown }
  if (Number(req.headers.get('content-length') ?? 0) > 4096) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try { input = await readLogin(req) } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!input || typeof input.identifier !== 'string' || !input.identifier.trim() || input.identifier.length > 254 ||
      typeof input.password !== 'string' || !input.password || input.password.length > 256 || input.token !== undefined) {
    return NextResponse.json({ error: 'Enter your username or email and password.' }, { status: 400 })
  }
  try {
    const result = await adminAuth('/auth/login', { identifier: input.identifier.trim(), password: input.password })
    if (result.status !== 200 || result.data.authenticated !== true || result.data.subject !== 'admin') {
      const status = [400, 401, 429, 503].includes(result.status) ? result.status : 503
      const error = status === 401 ? 'Invalid username/email or password' :
        status === 429 ? 'Too many login attempts. Try again in 15 minutes.' :
        status === 400 ? 'Enter your username or email and password.' : 'Admin login needs server-side setup.'
      return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
    }
  } catch { return NextResponse.json({ error: 'Unable to reach admin login. Try again later.' }, { status: 503 }) }
  attempts.delete(key)
  const response = NextResponse.json({ authenticated: true })
  response.cookies.set(COOKIE, issueSession(secret), {
    httpOnly: true, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60,
    secure: process.env.STUDIO_COOKIE_SECURE === 'true' || req.nextUrl.protocol === 'https:',
  })
  return response
}
export async function DELETE(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const response = NextResponse.json({ authenticated: false })
  response.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 })
  return response
}
