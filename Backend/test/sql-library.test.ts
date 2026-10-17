import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, createServices } from '../src/index.js';
import { AdminStore } from '../src/db/admin-store.js';
import { config } from './helpers.js';

test('SQL library persists documents, folders and favorites across SQLite reopen without Postgres', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sorabase-library-'));
  const options = { ...config, ADMIN_DATA_DIR: dir };
  const services = createServices(options);
  t.after(() => { services.close(); rmSync(dir, { recursive: true, force: true }); });
  const app = createApp(options, services);
  const auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  await request(app).get('/api/sql/library').expect(401);
  await request(app).post('/api/sql/snippets').send({ name: 'Denied', sql: '' }).expect(401);
  const call = (method: 'get' | 'post' | 'patch' | 'delete', url: string, body?: object) =>
    request(app)[method]('/api/sql/' + url).set(auth).send(body);
  await call('get', 'library').expect(200, { folders: [], snippets: [] });
  let result = await call('post', 'folders', { name: 'Private SQL', visibility: 'private' }).expect(201);
  const privateId = result.body.folders[0].id;
  result = await call('post', 'folders', { name: 'Team SQL', visibility: 'shared' }).expect(201);
  const sharedId = result.body.folders.find((f: { name: string }) => f.name === 'Team SQL').id;
  result = await call('patch', `folders/${sharedId}`, { name: 'Shared renamed' }).expect(200);
  assert.equal(result.body.folders.find((f: { id: string }) => f.id === sharedId).visibility, 'shared');
  result = await call('post', 'snippets', {
    name: 'My query', sql: "SELECT 'saved, not executed';", folderId: privateId, isFavorite: true,
  }).expect(201);
  const id = result.body.snippets[0].id;
  assert.equal(result.body.snippets[0].isFavorite, true);
  result = await call('patch', `snippets/${id}`, { name: 'Renamed SQL', sql: 'SELECT 42;', folderId: sharedId }).expect(200);
  assert.equal(result.body.snippets[0].visibility, 'shared');
  assert.equal(result.body.snippets[0].isFavorite, true);
  result = await call('patch', `snippets/${id}`, { name: 'Renamed SQL' }).expect(200);
  assert.equal(result.body.snippets[0].folderId, sharedId);
  assert.equal(result.body.snippets[0].visibility, 'shared');
  assert.equal(result.body.snippets[0].sql, 'SELECT 42;');
  result = await call('patch', `folders/${sharedId}`, { name: 'Renamed folder', visibility: 'private' }).expect(200);
  assert.equal(result.body.snippets[0].visibility, 'private');
  result = await call('patch', `snippets/${id}`, { visibility: 'shared', isFavorite: false }).expect(200);
  assert.equal(result.body.snippets[0].folderId, null);
  result = await call('patch', `snippets/${id}`, { folderId: privateId }).expect(200);
  await call('delete', `folders/${privateId}`).expect(200);
  const reopened = new AdminStore(options);
  try {
    const saved = reopened.sqlLibrary.list().snippets[0];
    assert.equal(saved.name, 'Renamed SQL');
    assert.equal(saved.sql, 'SELECT 42;');
    assert.equal(saved.folderId, null);
    assert.equal(saved.isFavorite, false);
  } finally { reopened.close(); }
  await call('patch', `snippets/${id}`, { sql: 'x'.repeat(60001) }).expect(400);
  await call('patch', `snippets/${id}`, { unexpected: true }).expect(400);
  await call('patch', `snippets/${id}`, {}).expect(400);
  await call('post', 'folders', { name: '   ', visibility: 'public' }).expect(400);
  await call('post', 'snippets', { name: 'Missing folder', sql: '', folderId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }).expect(404);
  await call('delete', `snippets/${id}`).expect(200);
  await call('delete', `snippets/${id}`).expect(404);
  await call('delete', `folders/${privateId}`).expect(404);
  await call('get', 'library').expect(res => assert.equal(res.body.snippets.length, 0));
});
