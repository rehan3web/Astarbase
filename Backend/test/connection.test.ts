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
  const mainCredential = { user: 'astarbase_main', password: 'main-client-fixture-password' };
  const branchCredential = { user: 'dev', password: 'branch-client-fixture-password' };
  await services.clientRoles.credentials.set(config.DB_NAME, mainCredential);
  await services.clientRoles.credentials.set('branch_dev', branchCredential);
  const app = createApp(options, services), auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  const url = `/api/databases/${config.DB_NAME}/connection`;
  await request(app).get(url).expect(401);
  await request(app).post(url + '/reveal').send({}).expect(401);
  await request(app).get(url + '/reveal').set(auth).expect(404);
  await request(app).post(url + '/reveal').set(auth).send({ unexpected: true }).expect(400);
  const metadata = await request(app).get(url).set(auth).expect(200);
  assert.match(metadata.headers['cache-control'], /no-store/);
  assert.deepEqual(metadata.body, { database: config.DB_NAME, user: mainCredential.user,
    host: 'db.example.com', directPort: 15432, poolerPort: 16432, sslMode: 'disable' });
  assert.equal(JSON.stringify(metadata.body).includes(config.DB_PASSWORD), false);
  const revealed = await request(app).post(url + '/reveal').set(auth).send({}).expect(200);
  assert.match(revealed.headers['cache-control'], /no-store/);
  assert.deepEqual(revealed.body, { password: mainCredential.password });
  const branch = await request(app).get('/api/databases/branch_dev/connection').set(auth).expect(200);
  assert.equal(branch.body.database, 'branch_dev');
  assert.equal(branch.body.user, 'dev');
  const branchPassword = await request(app).post('/api/databases/branch_dev/connection/reveal').set(auth).send({}).expect(200);
  assert.equal(branchPassword.body.password, branchCredential.password);
  await request(app).post(url + '/reset').send({ confirmDatabase: config.DB_NAME }).expect(401);
  await request(app).post(url + '/reset').set(auth).send({ confirmDatabase: 'wrong' }).expect(400);
  await request(app).post(url + '/reset').set(auth).send({ confirmDatabase: config.DB_NAME, password: 'custom' }).expect(400);
  const chosenPassword = 'chosen-client-password-fixture';
  await request(app).post(url + '/reset').set(auth).send({ confirmDatabase: 'wrong', password: chosenPassword }).expect(400);
  for (const password of [undefined, '', 'short', 'x'.repeat(257), 'invalid-control-password\n']) {
    const rejected = await request(app).post(url + '/reset').set(auth)
      .send({ confirmDatabase: config.DB_NAME, password }).expect(400);
    if (password && password.length >= 16) assert.equal(JSON.stringify(rejected.body).includes(password), false);
  }
  await request(app).post('/api/databases/unmanaged/connection/reset').set(auth)
    .send({ confirmDatabase: 'unmanaged', password: chosenPassword }).expect(404);
  let rotatedDatabase = '';
  let receivedPassword = '';
  services.clientRoles.reset = async (database, password) => {
    rotatedDatabase = database; receivedPassword = password; return { user: 'dev', rotated: true };
  };
  const rotated = await request(app).post('/api/databases/branch_dev/connection/reset').set(auth)
    .send({ confirmDatabase: 'branch_dev', password: chosenPassword }).expect(200);
  assert.equal(rotatedDatabase, 'branch_dev');
  assert.equal(receivedPassword, chosenPassword);
  assert.equal(JSON.stringify(rotated.body).includes(chosenPassword), false);
  assert.equal(rotated.body.rotated, true);
  assert.match(rotated.headers['cache-control'], /no-store/);
  await request(app).post(url + '/reset').set(auth)
    .send({ confirmDatabase: config.DB_NAME, password: chosenPassword }).expect(200);
  assert.equal(rotatedDatabase, config.DB_NAME);
  await request(app).get('/api/databases/branch_dev/connection/pool').set(auth).expect(403);
  await request(app).patch(url + '/pool').set(auth).send({ poolSize: 20, maxClientConnections: 300 }).expect(400);
  for (const poolSize of [0, 81, 1.5, '20']) {
    await request(app).patch(url + '/pool').set(auth).send({ poolSize }).expect(400);
  }
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
