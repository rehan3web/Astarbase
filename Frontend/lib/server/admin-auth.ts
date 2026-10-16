import { request } from 'node:http'
import { adminToken } from './session'

// The browser never gets the service secret or contacts the private backend.
// Authentication uses the same shared Unix socket as the other admin traffic.
export async function adminAuth(path: '/auth/status' | '/auth/login', body?: { identifier: string; password: string }) {
  const socketPath = process.env.ADMIN_SOCKET_PATH || '/var/run/astarbase/admin.sock'
  if (!socketPath.startsWith('/') || adminToken().length < 32) throw new Error('Admin login needs server-side setup.')
  const data = body ? JSON.stringify(body) : undefined
  return new Promise<{ status: number; data: { configured?: boolean; authenticated?: boolean; subject?: string; error?: string } }>((resolve, reject) => {
    const req = request({
      socketPath, path: `/api${path}`, method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, response => {
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > 65536) { response.destroy(); reject(new Error('Unable to reach admin login.')); return }
        chunks.push(chunk)
      })
      response.on('error', () => reject(new Error('Unable to reach admin login.')))
      response.on('end', () => {
        try { resolve({ status: response.statusCode ?? 503, data: JSON.parse(Buffer.concat(chunks).toString()) }) }
        catch { reject(new Error('Unable to reach admin login.')) }
      })
    })
    req.setTimeout(10000, () => req.destroy(new Error('Admin login timed out.')))
    req.on('error', () => reject(new Error('Unable to reach admin login.')))
    req.end(data)
  })
}
