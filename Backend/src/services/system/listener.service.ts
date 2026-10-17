import { createServer, type Server } from 'node:http';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Express } from 'express';

export const adminSocketPath = '/var/run/sorabase/admin.sock';

function listen(server: Server, target: number | string): Promise<void> {
  return new Promise((resolve, reject) => {
    const error = (cause: Error) => { server.off('listening', ready); reject(cause); };
    const ready = () => { server.off('error', error); resolve(); };
    server.once('error', error);
    server.once('listening', ready);
    if (typeof target === 'number') server.listen(target, '0.0.0.0');
    else server.listen(target);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) { resolve(); return; }
    server.close(error => error ? reject(error) : resolve());
  });
}

/** The frontend uses Unix exclusively; TCP remains for container healthchecks. */
export async function startAdminListeners(app: Express, port: number, socketPath = adminSocketPath) {
  await mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  try {
    const existing = await lstat(socketPath);
    if (!existing.isSocket()) throw new Error('Admin socket path already contains a non-socket file');
    await unlink(socketPath); // A crashed container may leave a stale socket inode.
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const unix = createServer(app);
  const http = createServer(app);
  for (const server of [unix, http]) {
    server.requestTimeout = 65 * 60 * 1000;
    server.headersTimeout = 60000;
  }
  try {
    await listen(unix, socketPath);
    await chmod(socketPath, 0o600);
    // Health must not report ready before the shared Unix socket is usable.
    await listen(http, port);
  } catch (error) {
    await Promise.all([close(unix), close(http)]);
    throw error;
  }
  return { unix, http, close: () => Promise.all([close(unix), close(http)]).then(() => undefined) };
}
