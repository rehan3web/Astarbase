import { NextRequest, NextResponse } from 'next/server'
import { request as socketRequest } from 'node:http'
import { Readable } from 'node:stream'
import { adminToken, COOKIE, validOrigin, verifySession } from '@/lib/server/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = adminToken()
  if (!verifySession(req.cookies.get(COOKIE)?.value, token)) return NextResponse.json({ error: 'Sign in to Studio first' }, { status: 401 })
  if (!['GET', 'HEAD'].includes(req.method) && !validOrigin(req)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const { path } = await context.params
  if (!path.length || path.some(p => p === '..' || p.includes('/') || p.includes('\\')) ||
      !['databases', 'branches', 'backups', 'sql', 'settings'].includes(path[0])) {
    return NextResponse.json({ error: 'Endpoint not allowed' }, { status: 404 })
  }
  const socketPath = process.env.ADMIN_SOCKET_PATH || '/var/run/astarbase/admin.sock'
  if (!socketPath.startsWith('/')) return NextResponse.json({ error: 'ADMIN_SOCKET_PATH must be an absolute Unix socket path' }, { status: 503 })
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.from(await req.arrayBuffer())
  if (body && body.length > 1024 * 1024) return NextResponse.json({ error: 'Request exceeds 1 MiB' }, { status: 413 })
  return new Promise<Response>(resolve => {
    const upstream = socketRequest({
      socketPath, path: `/api/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`,
      method: req.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(body ? { 'Content-Length': body.length } : {}) },
    }, response => {
      const headers = new Headers({ 'Cache-Control': 'no-store' })
      for (const name of ['content-type', 'content-disposition']) {
        const value = response.headers[name]
        if (typeof value === 'string') headers.set(name, value)
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream, { status: response.statusCode ?? 502, headers }))
    })
    upstream.setTimeout(65 * 60 * 1000, () => upstream.destroy(new Error('timeout')))
    upstream.on('error', () => resolve(NextResponse.json({
      error: 'Backend unavailable. Start the Docker stack and check the shared Admin Unix socket.',
    }, { status: 503 })))
    req.signal.addEventListener('abort', () => upstream.destroy(), { once: true })
    upstream.end(body)
  })
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE }
