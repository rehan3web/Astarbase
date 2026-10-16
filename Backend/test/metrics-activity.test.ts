import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminStore } from '../src/db/admin-store.js';
import { buildActivity, type ActivityRow } from '../src/services/metrics/activity.js';
import { config } from './helpers.js';

test('original-style activity uses actual row deltas, with gaps, resets and zero correctly distinguished', () => {
  const now = Date.now();
  const base: ActivityRow = { sampledAt: now - 60000, databaseOid: '1', statsResetAt: null,
    databaseError: null, inserted: 5, updated: 2, deleted: 0 };
  const rows = [base, { ...base, sampledAt: now - 30000, inserted: 8, updated: 4, deleted: 1 },
    { ...base, sampledAt: now, inserted: 8, updated: 4, deleted: 1 }];
  const activity = buildActivity(rows, [], 24, now);
  assert.equal(activity.buckets.length, 24);
  assert.equal(activity.buckets.filter(bucket => bucket.rows !== null).length, 1);
  assert.deepEqual(activity.buckets[23].rows, { inserted: 3, updated: 2, deleted: 1 });
  assert.equal(activity.buckets[0].rows, null);
  assert.equal(activity.buckets[23].runs, null);
  assert.deepEqual(buildActivity([base, { ...base, sampledAt: now }], [], 1, now).buckets[23].rows,
    { inserted: 0, updated: 0, deleted: 0 });
  for (const changed of [
    { ...base, sampledAt: now, databaseOid: '2' },
    { ...base, sampledAt: now, statsResetAt: new Date(now).toISOString() },
    { ...base, sampledAt: now, inserted: 0 },
    { ...base, sampledAt: now, databaseError: 'unavailable' },
    { ...base, sampledAt: now + 100000 },
  ]) {
    assert.equal(buildActivity([base, changed], [], 1, now + 100000).buckets.every(bucket => bucket.rows === null), true);
  }
});

test('SQLite activity bars aggregate all real events, preserve branch isolation and have no dummy totals', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-activity-'));
  const store = new AdminStore({ ...config, ADMIN_DATA_DIR: dir });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const now = Date.now();
  for (let i = 0; i < 60; i++) store.metrics.event(config.DB_NAME, 'query', 'success', 10, now - 1000);
  store.metrics.event(config.DB_NAME, 'branch-refresh', 'success', 1000, now - 1000);
  store.metrics.event(config.DB_NAME, 'query', 'error', 2000, now);
  store.metrics.event('another_database', 'query', 'success', 10, now);
  store.metrics.event(config.DB_NAME, 'query', 'success', 10, now - 25 * 3600000);
  const activity = store.metrics.activity(config.DB_NAME, 24, now);
  assert.deepEqual(activity.buckets[23].runs, { succeeded: 60, slow: 1, failed: 1 });
  assert.equal(activity.buckets.slice(0, 23).every(bucket => bucket.runs === null), true);
  assert.equal(store.metrics.events(config.DB_NAME, 24, now).length, 30);
  assert.equal(store.metrics.activity('empty_database', 24, now).buckets.every(bucket => bucket.runs === null && bucket.rows === null), true);
});
