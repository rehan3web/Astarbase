import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp, type Services } from '../src/index.js';
import { HttpError } from '../src/errors.js';
import { config } from './helpers.js';

function fixture() {
  const calls: unknown[][] = [];
  const capture = (name: string, result: unknown) => async (...args: unknown[]) => { calls.push([name, ...args]); return result; };
  const branch = { name: 'dev', database_name: 'branch_dev', parent_name: 'main' };
  let settings = { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' };
  const services = {
    health: capture('health', undefined),
    catalog: {
      store: {
        settings: () => settings,
        updateSettings: (changes: object) => { settings = { ...settings, ...changes }; return settings; },
      },
      branches: capture('branches', [branch]),
      branch: capture('branch', branch),
      assertDatabase: async (db: string) => { if (!['test_project', 'branch_dev'].includes(db)) throw new HttpError(404, 'Managed database not found'); },
    },
    postgres: { query: capture('sql', { stdout: 'answer\n42\n', format: 'csv' }) },
    tables: {
      list: capture('tables', [{ schema: 'public', name: 'items' }]),
      rows: capture('rows', { rows: [{ id: 1 }], total: '1' }),
      insert: capture('insert', { id: 2 }),
      update: capture('update', { id: 2, name: 'edited' }),
      delete: capture('delete', { id: 2 }),
    },
    branches: { create: capture('createBranch', branch), refresh: capture('refresh', { branch }) },
    backups: {
      list: capture('backups', []), create: capture('createBackup', { id: 'backup-id' }),
      restore: capture('restore', { restored: true }),
    },
    schema: { diagram: capture('schema', { nodes: [], edges: [] }) },
  } as unknown as Services;
  const app = createApp(config, services);
  const auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  return { app, services, auth, calls };
}

test('API is protected, health is public, CORS is not open', async () => {
  const { app, auth } = fixture();
  await request(app).get('/health').expect(200, { status: 'ok' });
  await request(app).get('/api/branches').expect(401);
  await request(app).get('/api/branches').set('Authorization', 'Bearer wrong').expect(401);
  await request(app).get('/api/branches').set(auth).expect(200);
  await request(app).get('/api/branches').set(auth).set('Origin', 'https://untrusted.example').expect(403);
});

test('SQL executes only against managed databases, with validation', async () => {
  const { app, auth, calls } = fixture();
  const result = await request(app).post('/api/sql').set(auth).send({ database: 'test_project', sql: 'SELECT 42' }).expect(200);
  assert.equal(result.body.format, 'csv');
  assert.deepEqual(calls.at(-1), ['sql', 'test_project', 'SELECT 42']);
  await request(app).post('/api/sql').set(auth).send({ database: config.LEGACY_CONTROL_DB, sql: 'SELECT 1' }).expect(404);
  await request(app).post('/api/sql').set(auth).send({ database: 'test_project', sql: '' }).expect(400);
  await request(app).post('/api/sql').set(auth).set('Content-Type', 'application/json').send('{').expect(400);
});

test('table routes list, page, create, edit and delete rows', async () => {
  const { app, auth, calls } = fixture();
  const base = '/api/databases/test_project/tables';
  await request(app).get(base).set(auth).expect(200);
  await request(app).get(base + '/public/items/rows?limit=50&offset=100').set(auth).expect(200);
  assert.deepEqual(calls.at(-1), ['rows', 'test_project', 'public', 'items', 50, 100]);
  await request(app).get(base + '/public/items/rows?limit=1001').set(auth).expect(400);
  await request(app).post(base + '/public/items/rows').set(auth).send({ values: { id: 2 } }).expect(201);
  await request(app).patch(base + '/public/items/rows').set(auth).send({ key: { id: 2 }, changes: { name: 'edited' } }).expect(200);
  assert.deepEqual(calls.at(-1), ['update', 'test_project', 'public', 'items', { id: 2 }, { name: 'edited' }]);
  await request(app).delete(base + '/public/items/rows').set(auth).send({ key: { id: 2 } }).expect(200);
  await request(app).get('/api/databases/postgres/tables').set(auth).expect(404);
});

test('branches support parent selection and explicit refresh confirmation', async () => {
  const { app, auth, calls } = fixture();
  await request(app).post('/api/branches').set(auth).send({ name: 'dev', parent: 'main' }).expect(201);
  assert.deepEqual(calls.at(-1), ['createBranch', 'dev', 'main']);
  for (const name of ['main', '../bad', 'a'.repeat(49)]) {
    await request(app).post('/api/branches').set(auth).send({ name }).expect(400);
  }
  await request(app).post('/api/branches/dev/refresh').set(auth).send({}).expect(400);
  await request(app).post('/api/branches/dev/refresh').set(auth).send({ confirmDatabase: 'test_project' }).expect(400);
  await request(app).post('/api/branches/dev/refresh').set(auth).send({ confirmDatabase: 'branch_dev' }).expect(200);
  assert.deepEqual(calls.at(-1), ['refresh', 'dev']);
});

test('schema and backup endpoints validate creation, listing and restore', async () => {
  const { app, auth, calls } = fixture();
  await request(app).get('/api/databases/test_project/schema').set(auth).expect(200, { nodes: [], edges: [] });
  await request(app).get('/api/backups?database=test_project').set(auth).expect(200);
  await request(app).post('/api/backups').set(auth).send({ database: 'test_project', label: 'Before migration' }).expect(201);
  const id = '01234567-1234-4567-8901-012345678901';
  await request(app).post(`/api/backups/${id}/restore`).set(auth).send({ database: 'test_project', confirmDatabase: 'wrong' }).expect(400);
  await request(app).post(`/api/backups/${id}/restore`).set(auth).send({ database: 'test_project', confirmDatabase: 'test_project' }).expect(200);
  assert.deepEqual(calls.at(-1), ['restore', id, 'test_project']);
  await request(app).post('/api/backups/bad/restore').set(auth).send({ database: 'test_project', confirmDatabase: 'test_project' }).expect(400);
});

test('errors redact credentials and unhealthy dependencies return 503', async () => {
  const { app, services, auth } = fixture();
  services.postgres.query = async () => { throw new Error(`failed ${config.DB_PASSWORD} ${config.ADMIN_API_TOKEN}`); };
  const result = await request(app).post('/api/sql').set(auth).send({ database: 'test_project', sql: 'SELECT 1' }).expect(500);
  assert.equal(result.body.error, 'failed [redacted] [redacted]');
  services.health = async () => { throw new Error('socket unavailable'); };
  await request(app).get('/health').expect(503, { status: 'unavailable' });
});

test('numeric process error codes still produce JSON error responses', async () => {
  const { app, services, auth } = fixture();
  services.postgres.query = async () => { throw Object.assign(new Error('SQL process failed'), { code: 1 }); };
  const response = await request(app).post('/api/sql').set(auth).send({ database: 'test_project', sql: 'SELECT 1' }).expect(500);
  assert.equal(response.body.error, 'SQL process failed');
});

test('admin settings routes validate allowlisted settings and apply default row limit', async () => {
  const { app, auth, calls } = fixture();
  await request(app).get('/api/settings').expect(401);
  await request(app).get('/api/settings').set(auth).expect(200, { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' });
  await request(app).patch('/api/settings').set(auth).send({ defaultRowLimit: 25, theme: 'dark' }).expect(200);
  await request(app).get('/api/databases/test_project/tables/public/items/rows').set(auth).expect(200);
  assert.deepEqual(calls.at(-1), ['rows', 'test_project', 'public', 'items', 25, 0]);
  await request(app).patch('/api/settings').set(auth).send({ defaultRowLimit: 1001 }).expect(400);
  await request(app).patch('/api/settings').set(auth).send({ DB_PASSWORD: 'must-not-be-saved' }).expect(400);
});
