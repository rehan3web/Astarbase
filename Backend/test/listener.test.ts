import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, stat, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { startAdminListeners } from '../src/services/system/listener.service.js';

test('production listener exposes the shared Unix API before HTTP health becomes ready', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sorabase-listener-'));
  const socketPath = path.join(dir, 'admin.sock');
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const listeners = await startAdminListeners(app, 0, socketPath);
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = request({ socketPath, path: '/health' }, res => {
        let result = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { result += chunk; });
        res.on('end', () => resolve(result));
      });
      req.once('error', reject); req.end();
    });
    assert.deepEqual(JSON.parse(body), { status: 'ok' });
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    const address = listeners.http.address();
    assert.ok(address && typeof address === 'object');
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/health`)).status, 200);
    assert.equal(listeners.unix.requestTimeout, 65 * 60 * 1000);
  } finally {
    await listeners.close();
    await assert.rejects(stat(socketPath), { code: 'ENOENT' });
    await rm(dir, { recursive: true, force: true });
  }
});

test('startup never overwrites a non-socket file at the socket path', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sorabase-listener-'));
  const socketPath = path.join(dir, 'admin.sock');
  try {
    await writeFile(socketPath, 'keep me');
    await assert.rejects(startAdminListeners(express(), 0, socketPath), /non-socket/);
    assert.equal(await readFile(socketPath, 'utf8'), 'keep me');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
