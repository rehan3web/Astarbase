import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, createServices } from '../src/index.js';
import { config } from './helpers.js';

test('RLS APIs authenticate, scope managed databases and validate policy command/predicates and partial state', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'astarbase-rls-api-'));
  const services = createServices({ ...config, ADMIN_DATA_DIR: directory });
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  services.catalog.store.addBranch('dev', 'branch_dev', 'main');
  const calls: unknown[][] = [];
  services.policies.list = async database => { calls.push(['list', database]); return { database, tables: [], roles: [] }; };
  services.policies.state = async (...args) => { calls.push(['state', ...args]); return { updated: true }; };
  services.policies.save = async (...args) => { calls.push(['save', ...args]); return { saved: true }; };
  services.policies.remove = async (...args) => { calls.push(['remove', ...args]); return { deleted: true }; };
  const app = createApp(config, services);
  const auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  const root = '/api/databases/branch_dev/rls';
  const table = `${root}/public/users`;
  const body = { name: 'my policy', command: 'SELECT', mode: 'PERMISSIVE', roles: ['public'], usingExpression: 'id > 0', checkExpression: null };
  await request(app).get(root).expect(401);
  await request(app).post(`${table}/policies`).send(body).expect(401);
  await request(app).patch(table).send({ enabled: true }).expect(401);
  await request(app).put(`${table}/policies/old`).send(body).expect(401);
  await request(app).delete(`${table}/policies/old`).expect(401);
  await request(app).get('/api/databases/postgres/rls').set(auth).expect(404);
  const list = await request(app).get(root).set(auth).expect(200);
  assert.match(list.headers['cache-control'], /no-store/);
  for (const invalid of [{}, { ...body, command: 'TRUNCATE' }, { ...body, mode: 'invalid' },
    { ...body, roles: [] }, { ...body, roles: ['x'.repeat(64)] }, { ...body, name: '\0' },
    { ...body, command: 'INSERT' }, { ...body, checkExpression: 'true' },
    { ...body, unexpected: true }]) {
    await request(app).post(`${table}/policies`).set(auth).send(invalid).expect(400);
  }
  for (const invalid of [{}, { enabled: 'true' }, { enabled: true, allDatabases: true }]) {
    await request(app).patch(table).set(auth).send(invalid).expect(400);
  }
  await request(app).patch(table).set(auth).send({ forced: true }).expect(200);
  await request(app).post(`${table}/policies`).set(auth).send(body).expect(201);
  await request(app).put(`${table}/policies/${encodeURIComponent('old "policy"')}`).set(auth).send({ ...body, command: 'ALL' }).expect(200);
  await request(app).delete(`${table}/policies/${encodeURIComponent('my policy')}`).set(auth).expect(200);
  assert.deepEqual(calls, [
    ['list', 'branch_dev'], ['state', 'branch_dev', 'public', 'users', { forced: true }],
    ['save', 'branch_dev', 'public', 'users', body, undefined],
    ['save', 'branch_dev', 'public', 'users', { ...body, command: 'ALL' }, 'old "policy"'],
    ['remove', 'branch_dev', 'public', 'users', 'my policy'],
  ]);
});
