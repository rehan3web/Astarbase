import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, createServices } from '../src/index.js';
import { hashPassword, verifyPassword } from '../src/services/auth/auth.service.js';
import { config } from './helpers.js';

const password = 'Test-password-only-not-for-use-2026';
function fixture(t: TestContext, bootstrap = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sorabase-auth-test-'));
  const options = { ...config, ADMIN_DATA_DIR: dir,
    ADMIN_USERNAME: bootstrap ? 'studio_owner' : '',
    ADMIN_EMAIL: bootstrap ? 'owner@example.test' : '',
    ADMIN_PASSWORD: bootstrap ? password : '' };
  const services = createServices(options);
  t.after(() => { services.close(); rmSync(dir, { recursive: true, force: true }); });
  return { options, services, app: createApp(options, services), auth: { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` } };
}

test('passwords use salted scrypt, not plaintext, and malformed hashes never authenticate', async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password + 'wrong', first), false);
  assert.equal(await verifyPassword(password, 'broken'), false);
});

test('admin signs in with username or email, with protected internal routes and generic failures', async t => {
  const { services, app, auth } = fixture(t);
  await services.auth.initialize();
  const account = services.catalog.store.adminAccount()!;
  assert.notEqual(account.password_hash, password);
  await request(app).get('/api/auth/status').expect(401);
  await request(app).get('/api/auth/status').set(auth).expect(200, { configured: true });
  for (const identifier of ['studio_owner', ' STUDIO_OWNER ', 'OWNER@EXAMPLE.TEST']) {
    const response = await request(app).post('/api/auth/login').set(auth).send({ identifier, password }).expect(200);
    assert.deepEqual(response.body, { authenticated: true, subject: 'admin' });
    assert.equal(JSON.stringify(response.body).includes(account.password_hash), false);
  }
  for (const [identifier, candidate] of [['studio_owner', 'wrong-password'], ['unknown', password]]) {
    await request(app).post('/api/auth/login').set(auth).send({ identifier, password: candidate })
      .expect(401, { error: 'Invalid username/email or password' });
  }
  await request(app).post('/api/auth/login').set(auth).send({ token: config.ADMIN_API_TOKEN }).expect(400);
  await request(app).post('/api/auth/login').set(auth).send({ identifier: 'studio_owner', password: 'x'.repeat(257) }).expect(400);
  assert.equal(services.catalog.store.settings().projectName, 'Sorabase');
});

test('no account means setup required, never default credentials or open registration', async t => {
  const { services, app, auth } = fixture(t, false);
  await services.auth.initialize();
  await request(app).get('/api/auth/status').set(auth).expect(200, { configured: false });
  await request(app).post('/api/auth/login').set(auth).send({ identifier: 'admin', password }).expect(503);
  await request(app).post('/api/auth/register').set(auth).send({ identifier: 'admin', password }).expect(404);
});

test('restarting or changing bootstrap variables never overwrites the SQLite account', async t => {
  const { services, options } = fixture(t);
  await services.auth.initialize();
  const original = services.catalog.store.adminAccount();
  const reopened = createServices({ ...options, ADMIN_USERNAME: 'different', ADMIN_EMAIL: 'other@example.test', ADMIN_PASSWORD: '' });
  try {
    await reopened.auth.initialize();
    assert.deepEqual(reopened.catalog.store.adminAccount(), original);
    assert.equal((await reopened.auth.login('studio_owner', password)).authenticated, true);
  } finally { reopened.close(); }
});

test('consecutive failed logins are rate limited even if the caller changes identifiers', async t => {
  const { services } = fixture(t);
  await services.auth.initialize();
  for (let i = 0; i < 10; i++) await assert.rejects(services.auth.login(`unknown-${i}`, 'wrong'), { status: 401 });
  await assert.rejects(services.auth.login('studio_owner', password), { status: 429 });
});
