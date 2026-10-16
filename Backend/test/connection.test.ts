import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, createServices } from '../src/index.js';
import { config } from './helpers.js';
import { loadConfig } from '../src/config.js';

test('connection metadata and explicit password reveal require admin auth and managed databases', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-connection-'));
  const options = { ...config, ADMIN_DATA_DIR: dir, DATABASE_PUBLIC_HOST: 'db.example.com',
    POSTGRES_PUBLIC_PORT: 15432, PGBOUNCER_PUBLIC_PORT: 16432 };
  const services = createServices(options);
  t.after(() => { services.close(); rmSync(dir, { recursive: true, force: true }); });
  services.catalog.store.addBranch('dev', 'branch_dev', 'main');
  const app = createApp(options, services), auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  const url = `/api/databases/${config.DB_NAME}/connection`;
  await request(app).get(url).expect(401);
  await request(app).post(url + '/reveal').send({}).expect(401);
  await request(app).get(url + '/reveal').set(auth).expect(404);
  await request(app).post(url + '/reveal').set(auth).send({ unexpected: true }).expect(400);
  const metadata = await request(app).get(url).set(auth).expect(200);
  assert.match(metadata.headers['cache-control'], /no-store/);
  assert.deepEqual(metadata.body, { database: config.DB_NAME, user: config.DB_USER,
    host: 'db.example.com', directPort: 15432, poolerPort: 16432, sslMode: 'disable' });
  assert.equal(JSON.stringify(metadata.body).includes(config.DB_PASSWORD), false);
  const revealed = await request(app).post(url + '/reveal').set(auth).send({}).expect(200);
  assert.match(revealed.headers['cache-control'], /no-store/);
  assert.deepEqual(revealed.body, { password: config.DB_PASSWORD });
  const branch = await request(app).get('/api/databases/branch_dev/connection').set(auth).expect(200);
  assert.equal(branch.body.database, 'branch_dev');
  await request(app).get('/api/databases/postgres/connection').set(auth).expect(404);
  await request(app).post('/api/databases/not_managed/connection/reveal').set(auth).send({}).expect(404);
  assert.equal(JSON.stringify(services.catalog.store.settings()).includes(config.DB_PASSWORD), false);
});

test('public connection configuration defaults, IPv6 and safe host/port validation', () => {
  assert.equal(config.DATABASE_PUBLIC_HOST, '');
  assert.equal(config.POSTGRES_PUBLIC_PORT, 5432);
  assert.equal(config.PGBOUNCER_PUBLIC_PORT, 6432);
  const env = { DB_NAME: config.DB_NAME, DB_USER: config.DB_USER, DB_PASSWORD: config.DB_PASSWORD,
    ADMIN_API_TOKEN: config.ADMIN_API_TOKEN };
  assert.equal(loadConfig({ ...env, DATABASE_PUBLIC_HOST: '2001:db8::10' }).DATABASE_PUBLIC_HOST, '2001:db8::10');
  for (const host of ['https://db.example.com', 'db.example.com:5432', 'host/path', '$(bad)', '0.0.0.0/0']) {
    assert.throws(() => loadConfig({ ...env, DATABASE_PUBLIC_HOST: host }), /DATABASE_PUBLIC_HOST/);
  }
  assert.throws(() => loadConfig({ ...env, POSTGRES_PUBLIC_PORT: '0' }), /POSTGRES_PUBLIC_PORT/);
});
