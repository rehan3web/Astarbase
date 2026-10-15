import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { adminToken, COOKIE, issueSession, validOrigin, verifySession } from '@/lib/server/session'

export const runtime = 'nodejs'
const attempts = new Map<string, { count: number; until: number }>()
export async function GET(req: NextRequest) {
  return NextResponse.json({ authenticated: verifySession(req.cookies.get(COOKIE)?.value, adminToken()), configured: adminToken().length >= 32 }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const secret = adminToken()
  if (secret.length < 32) return NextResponse.json({ error: 'Set the same ADMIN_API_TOKEN on the Studio server and backend first.' }, { status: 503 })
  const key = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local'
  const now = Date.now()
  for (const [ip, row] of attempts) if (row.until < now) attempts.delete(ip)
  if (attempts.size > 10000) return NextResponse.json({ error: 'Try again later' }, { status: 429 })
  const row = attempts.get(key) ?? { count: 0, until: now + 15 * 60 * 1000 }
  if (row.count >= 10) return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
  row.count++
  attempts.set(key, row)
  let token: unknown
  try { token = (await req.json()).token } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const digest = (value: string) => createHash('sha256').update(value).digest()
  if (typeof token !== 'string' || !timingSafeEqual(digest(token), digest(secret))) {
    return NextResponse.json({ error: 'Invalid admin token' }, { status: 401 })
  }
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
