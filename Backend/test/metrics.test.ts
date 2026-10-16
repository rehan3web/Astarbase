import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import request from 'supertest';
import { createApp, createServices } from '../src/index.js';
import { AdminStore } from '../src/db/admin-store.js';
import { MetricsService } from '../src/services/metrics/metrics.service.js';
import { readCompute, activityRates } from '../src/services/metrics/readings.js';
import { DockerService } from '../src/services/docker/docker.js';
import type { DatabaseReading } from '../src/services/metrics/types.js';
import { config } from './helpers.js';

const reading: DatabaseReading = {
  databaseSizeBytes: 8388608, connections: 3, activeConnections: 1, maxConnections: 100,
  commits: 100, rollbacks: 2, rowsInserted: 10, rowsUpdated: 5, rowsDeleted: 0,
  databaseOid: '16384', statsResetAt: null,
};
function fixture(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-metrics-'));
  const options = { ...config, ADMIN_DATA_DIR: dir };
  const services = createServices(options);
  let now = Date.now(), failDatabase = false, failCompute = false, calls = 0;
  let db = { ...reading };
  const metrics = new MetricsService(options, services.catalog, services.postgres, {
    now: () => now,
    database: async () => { calls++; if (failDatabase) throw new Error('private-credential'); return { ...db }; },
    compute: async () => { if (failCompute) throw new Error('private-credential'); return { cpuPercent: 125, memoryUsageBytes: 104857600, memoryLimitBytes: 1073741824 }; },
  });
  t.after(() => { metrics.stop(); services.close(); rmSync(dir, { recursive: true, force: true }); });
  return { options, services, metrics, app: createApp(options, { ...services, metrics }),
    auth: { Authorization: `Bearer ${config.ADMIN_API_TOKEN}` },
    advance(ms = 30000) { now += ms; },
    database(value: Partial<DatabaseReading>) { db = { ...db, ...value }; },
    fail(database: boolean, compute: boolean) { failDatabase = database; failCompute = compute; },
    calls: () => calls, now: () => now,
  };
}

test('metrics API is protected, validates ranges, coalesces reads, and persists genuine branch-isolated history', async t => {
  const f = fixture(t), url = `/api/databases/${config.DB_NAME}/metrics`;
  await request(f.app).get(url).expect(401);
  await request(f.app).get(url + '?hours=169').set(f.auth).expect(400);
  await request(f.app).get(url + '?limit=0').set(f.auth).expect(400);
  await request(f.app).get('/api/databases/not_managed/metrics').set(f.auth).expect(404);
  await Promise.all([f.metrics.collect(config.DB_NAME), f.metrics.collect(config.DB_NAME)]);
  assert.equal(f.calls(), 1);
  let result = await request(f.app).get(url).set(f.auth).expect(200);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.body.latest.cpuPercent, 125);
  assert.equal(result.body.latest.transactionsPerSecond, null);
  assert.equal(result.body.latest.connections, 3);
  assert.equal(result.body.activity.buckets.length, 1);
  assert.equal(result.body.activity.buckets.every((bucket: { runs: unknown; rows: unknown }) => bucket.runs === null && bucket.rows === null), true);
  f.advance();
  f.database({ commits: 157, rollbacks: 5, rowsInserted: 70 });
  result = await request(f.app).get(url + '?hours=1').set(f.auth).expect(200);
  assert.equal(result.body.latest.transactionsPerSecond, 2);
  assert.equal(result.body.latest.rowsChangedPerSecond, 2);
  assert.equal(result.body.stale, false);
  assert.equal(result.body.computeScope, 'postgres-container');
  assert.equal(result.body.history.length, 2);
  f.services.catalog.store.addBranch('dev', 'metrics_dev', 'main');
  await f.metrics.collect('metrics_dev');
  assert.equal(f.services.catalog.store.metrics.latest('metrics_dev')?.transactionsPerSecond, null);
  const reopened = new AdminStore(f.options);
  try {
    assert.equal(reopened.metrics.latest(config.DB_NAME)?.commits, 157);
    assert.equal(reopened.metrics.history(config.DB_NAME, 24, 240, f.now()).every(row => row.database === config.DB_NAME), true);
    assert.equal(reopened.metrics.latest('metrics_dev')?.database, 'metrics_dev');
  } finally { reopened.close(); }
});

test('counter resets and database recreation do not fabricate spikes; failures retain old samples without leaking errors', async t => {
  const f = fixture(t);
  await f.metrics.collect(config.DB_NAME);
  const previous = f.services.catalog.store.metrics.latest(config.DB_NAME)!;
  assert.equal(activityRates(previous, { ...reading, commits: 1 }, f.now() + 30000).transactionsPerSecond, null);
  assert.equal(activityRates(previous, { ...reading, databaseOid: '99999' }, f.now() + 30000).transactionsPerSecond, null);
  assert.equal(activityRates(previous, { ...reading, statsResetAt: new Date().toISOString() }, f.now() + 30000).transactionsPerSecond, null);
  f.advance(); f.fail(true, true);
  const offline = await f.metrics.read(config.DB_NAME, 1, 240);
  assert.equal(offline.stale, true);
  assert.equal(offline.history.length, 1);
  assert.equal(offline.latest?.sampledAt, previous.sampledAt);
  assert.equal(JSON.stringify(offline).includes('private-credential'), false);
  f.advance(); f.fail(false, true);
  const partial = await f.metrics.read(config.DB_NAME, 1, 240);
  assert.equal(partial.latest?.databaseSizeBytes, 8388608);
  assert.equal(partial.latest?.cpuPercent, null);
  assert.ok(partial.latest?.computeError);
  assert.equal(partial.stale, false);
});

test('query and sync activity preserve operation results, persist only metadata, and retention removes old data', async t => {
  const f = fixture(t);
  assert.equal(await f.metrics.track(config.DB_NAME, 'query', async () => 42), 42);
  await assert.rejects(f.metrics.track(config.DB_NAME, 'query', async () => { throw new Error('sensitive SQL'); }), /sensitive SQL/);
  await f.metrics.track(config.DB_NAME, 'branch-refresh', async () => undefined);
  await f.metrics.collect(config.DB_NAME);
  const events = f.services.catalog.store.metrics.events(config.DB_NAME, 1, f.now());
  assert.equal(events.length, 3);
  assert.equal(events[0].kind, 'branch-refresh');
  assert.equal(events[1].status, 'error');
  assert.equal(JSON.stringify(events).includes('sensitive SQL'), false);
  for (let i = 0; i < 10; i++) { f.advance(); await f.metrics.collect(config.DB_NAME); }
  const sparse = f.services.catalog.store.metrics.history(config.DB_NAME, 1, 2, f.now());
  assert.ok(sparse.length <= 2);
  assert.ok(sparse.every(row => f.services.catalog.store.metrics.history(config.DB_NAME, 1, 720, f.now()).some(actual => actual.sampledAt === row.sampledAt)));
  f.advance(8 * 86400000);
  f.services.catalog.store.metrics.prune(f.now());
  assert.equal(f.services.catalog.store.metrics.latest(config.DB_NAME), null);
  assert.equal(f.services.catalog.store.metrics.events(config.DB_NAME, 168, f.now()).length, 0);
});

test('container CPU follows Docker deltas and Linux memory excludes inactive file cache', () => {
  assert.deepEqual(readCompute({
    cpu_stats: { cpu_usage: { total_usage: 300 }, system_cpu_usage: 1200, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000 },
    memory_stats: { usage: 1024, limit: 4096, stats: { inactive_file: 256 } },
  }), { cpuPercent: 400, memoryUsageBytes: 768, memoryLimitBytes: 4096 });
  assert.deepEqual(readCompute({}), { cpuPercent: null, memoryUsageBytes: null, memoryLimitBytes: null });
  assert.equal(readCompute({
    cpu_stats: { cpu_usage: { total_usage: 1 }, system_cpu_usage: 3, online_cpus: 4 },
    precpu_stats: { cpu_usage: { total_usage: 2 }, system_cpu_usage: 2 },
  }).cpuPercent, null);
});

test('Docker stats use dockerode through a real Unix socket, never a TCP endpoint', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-docker-stats-')), socket = path.join(dir, 'docker.sock');
  const server = createServer((req, res) => {
    assert.match(req.url!, /\/containers\/[^/]+\/stats\?stream=false/);
    assert.equal(req.socket.remoteAddress, undefined);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ memory_stats: { usage: 1024, limit: 4096 } }));
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true, force: true }); });
  const stats = await new DockerService({ ...config, DOCKER_SOCKET: socket }).stats();
  assert.equal(readCompute(stats).memoryUsageBytes, 1024);
});
