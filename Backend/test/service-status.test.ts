import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, createServices } from '../src/index.js';
import { ServiceStatusService } from '../src/services/metrics/service-status.js';
import { config } from './helpers.js';

test('service status uses fresh database and pooler probes, with branch-scoped RLS and safe failures', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sorabase-service-status-'));
  const options = { ...config, ADMIN_DATA_DIR: dir };
  const services = createServices(options);
  t.after(() => { services.close(); rmSync(dir, { recursive: true, force: true }); });
  services.catalog.store.addBranch('dev', 'status_dev', 'main');
  let postgresDown = false, poolerDown = false, calls = 0;
  const status = new ServiceStatusService(options, services.catalog, services.pooler, {
    database: async database => {
      calls++;
      if (postgresDown) throw new Error('secret-database-detail');
      return database === 'status_dev';
    },
    pooler: async () => { if (poolerDown) throw new Error('secret-pooler-detail'); },
  });
  const app = createApp(options, { ...services, serviceStatus: status });
  const endpoint = `/api/databases/${config.DB_NAME}/metrics/status`;
  const auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  await request(app).get(endpoint).expect(401);
  const main = await request(app).get(endpoint).set(auth).expect(200);
  assert.match(main.headers['cache-control'], /no-store/);
  assert.equal(main.body.postgres.active, true);
  assert.equal(main.body.pgbouncer.active, true);
  assert.equal(main.body.rls.active, false);
  assert.ok(Number.isFinite(Date.parse(main.body.checkedAt)));
  const branch = await request(app).get('/api/databases/status_dev/metrics/status').set(auth).expect(200);
  assert.equal(branch.body.rls.active, true);
  assert.equal(branch.body.database, 'status_dev');
  postgresDown = true; poolerDown = true;
  const offline = await request(app).get(endpoint).set(auth).expect(200);
  assert.equal(offline.body.postgres.active, false);
  assert.equal(offline.body.pgbouncer.active, false);
  assert.equal(offline.body.rls.active, null);
  assert.ok(offline.body.postgres.error);
  assert.ok(offline.body.rls.error);
  assert.ok(offline.body.pgbouncer.error);
  assert.equal(JSON.stringify(offline.body).includes('secret-'), false);
  assert.equal(calls, 3);
  await request(app).get('/api/databases/not_managed/metrics/status').set(auth).expect(404);
  assert.equal(calls, 3);
});
