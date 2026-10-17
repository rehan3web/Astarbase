import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import request from 'supertest';
import { config } from './helpers.js';
import { createApp, createServices } from '../src/index.js';
import { DatabaseMaintenanceService } from '../src/services/connection/maintenance.service.js';
import type { BranchService } from '../src/services/branches/branches.service.js';
import type { withDatabase } from '../src/db/socket.js';

test('maintenance endpoints require auth, an exact managed database, and explicit confirmation', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorabase-maintenance-api-'));
  const options = { ...config, ADMIN_DATA_DIR: directory };
  const services = createServices(options);
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  services.catalog.store.addBranch('dev', 'branch_dev', 'main');
  services.catalog.store.addBranch('child', 'branch_child', 'dev');
  const calls: string[] = [];
  services.maintenance.reset = async database => {
    calls.push(`reset:${database}`); return { reset: true, database, cleanupWarning: null };
  };
  services.maintenance.terminate = async database => {
    calls.push(`terminate:${database}`); return { terminated: true, database, directConnections: 2, unixAdminPreserved: true };
  };
  const app = createApp(options, services), auth = { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` };
  for (const endpoint of ['reset-database', 'terminate']) {
    const url = `/api/databases/branch_dev/connection/${endpoint}`;
    await request(app).post(url).send({ confirmDatabase: 'branch_dev' }).expect(401);
    await request(app).get(url).set(auth).expect(404);
    for (const body of [{}, { confirmDatabase: config.DB_NAME }, { confirmDatabase: 'branch_dev', all: true }]) {
      await request(app).post(url).set(auth).send(body).expect(400);
    }
    await request(app).post(`/api/databases/postgres/connection/${endpoint}`).set(auth)
      .send({ confirmDatabase: 'postgres' }).expect(404);
    for (const database of [config.DB_NAME, 'branch_dev', 'branch_child']) {
      const response = await request(app).post(`/api/databases/${database}/connection/${endpoint}`).set(auth)
        .send({ confirmDatabase: database }).expect(200);
      assert.equal(response.body.database, database);
      assert.match(response.headers['cache-control'], /no-store/);
    }
  }
  assert.deepEqual(calls, [
    `reset:${config.DB_NAME}`, 'reset:branch_dev', 'reset:branch_child',
    `terminate:${config.DB_NAME}`, 'terminate:branch_dev', 'terminate:branch_child',
  ]);
});

test('maintenance targets only the selected database; preserves Unix clients and propagates failures', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorabase-maintenance-service-'));
  const services = createServices({ ...config, ADMIN_DATA_DIR: directory });
  t.after(async () => { services.close(); await rm(directory, { recursive: true, force: true }); });
  services.catalog.store.addBranch('dev', 'branch_dev', 'main');
  services.catalog.exclusive = async operation => operation();
  const calls: string[] = [];
  let failedTermination = false;
  const branches = { async replace(database: string, dump: string | null) {
    assert.equal(dump, null); calls.push(`replace:${database}`); return { cleanupWarning: null };
  } } as BranchService;
  const pooler = { async withDisconnected<T>(database: string, operation: () => Promise<T>) {
    calls.push(`kill:${database}`);
    try { return await operation(); }
    finally { calls.push(`resume:${database}`); }
  } };
  const run = (async (_config, database, operation) => {
    assert.equal(database, 'postgres');
    return operation({ async query(sql: string, values: string[]) {
      assert.match(sql, /client_addr IS NOT NULL/);
      assert.match(sql, /backend_type = 'client backend'/);
      assert.match(sql, /datname = \$1/);
      assert.match(sql, /pid <> pg_backend_pid\(\)/);
      assert.deepEqual(values, ['branch_dev']);
      return { rows: [{ terminated: !failedTermination }] };
    } } as unknown as pg.Client);
  }) as typeof withDatabase;
  const maintenance = new DatabaseMaintenanceService(config, services.catalog, branches, pooler, run);
  assert.equal((await maintenance.reset('branch_dev')).reset, true);
  assert.equal((await maintenance.terminate('branch_dev')).unixAdminPreserved, true);
  assert.deepEqual(calls, ['kill:branch_dev', 'replace:branch_dev', 'resume:branch_dev', 'kill:branch_dev', 'resume:branch_dev']);
  failedTermination = true;
  await assert.rejects(maintenance.terminate('branch_dev'), /Some direct connections/);
  assert.equal(calls.at(-1), 'resume:branch_dev');
  await assert.rejects(maintenance.reset('postgres'), /Managed database not found/);
});
