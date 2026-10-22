import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { MetricsStore } from '../src/db/metrics-store.js';
import { parseQueryLog, QueryLogCollector } from '../src/services/metrics/query-log-collector.js';
import type { ActivityLogSource } from '../src/services/metrics/postgres-log-source.js';

const now = Date.now();
const file = 'activity-20261021-120000.json';
const base = {
  timestamp: new Date(now).toISOString(), user: 'client_user', dbname: 'main_db',
  session_id: 'a1.123', session_start: new Date(now - 1000).toISOString(),
  line_num: 1, ps: 'SELECT', backend_type: 'client backend',
  application_name: 'external-app', error_severity: 'LOG', message: 'duration: 12.345 ms',
};
const parse = (change: Record<string, unknown> = {}) =>
  parseQueryLog(JSON.stringify({ ...base, ...change }), 'admin', new Set(['main_db', 'child_db']));
const line = (change: Record<string, unknown> = {}) => JSON.stringify({ ...base, ...change }) + '\n';
function fixture() {
  const db = new DatabaseSync(':memory:');
  const store = new MetricsStore(db);
  const files = new Map([[file, Buffer.from(line())]]);
  const source: ActivityLogSource = {
    inventory: async () => ({ files: [...files].map(([name, data]) => ({ name, size: data.length })), current: file }),
    read: async (name, offset, length) => files.get(name)?.subarray(offset, offset + length) ?? null,
    remove: async name => { files.delete(name); },
  };
  const make = () => new QueryLogCollector(source, store, 'admin', () => new Set(['main_db', 'child_db']), () => now + 100);
  return { db, store, source, files, make, collector: make() };
}

test('duration-only PostgreSQL records count executions, not Parse/Bind, and isolate database/client scope', () => {
  assert.equal(parse()?.durationMs, 12.345);
  assert.equal(parse({ ps: 'PARSE' }), null);
  assert.equal(parse({ ps: 'BIND' }), null);
  assert.equal(parse({ user: 'admin', application_name: 'sorabase-admin' }), null);
  assert.ok(parse({ user: 'admin', application_name: 'sorabase-sql' }));
  // A public client cannot evade observation by spoofing the monitoring app name.
  assert.ok(parse({ application_name: 'sorabase-admin' }));
  assert.equal(parse({ dbname: 'postgres' }), null);
  assert.ok(parse({ dbname: 'child_db' }));
  assert.equal(parse({ backend_type: 'parallel worker' }), null);
  assert.equal(parse({ error_severity: 'FATAL', message: 'authentication failed' }), null);
  assert.equal(parse({ error_severity: 'WARNING' }), null);
  const failure = parse({ ps: 'PARSE', error_severity: 'ERROR', message: 'sensitive SQL/data' })!;
  assert.equal(failure.status, 'error');
  assert.equal(failure.durationMs, 0);
  assert.equal(JSON.stringify(failure).includes('sensitive'), false);
  assert.equal(parse({ message: 'duration: Infinity ms' }), null);
});

test('atomic cursor ingestion, retries and collector restarts never double-count; raw SQL never persists', async () => {
  const f = fixture();
  try {
    f.files.set(file, Buffer.from(line() + line({ line_num: 2, message: 'duration: 1200.123 ms' })
      + line({ line_num: 3, error_severity: 'ERROR', message: 'private row value', statement: 'secret SQL' })));
    await f.collector.poll(true);
    await f.collector.poll(true);
    f.collector.stop();
    const restarted = f.make();
    await restarted.poll(true);
    // Replay from the beginning simulates a lost/truncated cursor.
    f.store.forgetLog(file);
    await restarted.poll(true);
    const events = f.store.events('main_db', 1, now + 100);
    assert.equal(events.length, 3);
    const totals = f.store.activity('main_db', 1, now + 100).buckets[0].runs;
    assert.deepEqual(totals, { succeeded: 1, slow: 1, failed: 1 });
    assert.equal(restarted.status().status, 'active');
    assert.doesNotMatch(JSON.stringify(f.db.prepare('SELECT * FROM metric_events').all()), /private row|secret SQL|client_user|external-app/);
    assert.equal(f.store.events('child_db', 1, now + 100).length, 0);
  } finally { f.db.close(); }
});

test('partial records wait, rotated files drain before removal, malformed records report incomplete coverage', async () => {
  const f = fixture();
  try {
    const entry = line();
    f.files.set(file, Buffer.from(entry.slice(0, -5)));
    await f.collector.poll(true);
    assert.equal(f.store.events('main_db', 1, now + 100).length, 0);
    f.files.set(file, Buffer.from(entry));
    await f.collector.poll(true);
    assert.equal(f.store.events('main_db', 1, now + 100).length, 1);
    const rotated = 'activity-20261021-115959.json';
    f.files.set(rotated, Buffer.from(line({ line_num: 2 }) + 'not JSON\n'));
    await f.collector.poll(true);
    assert.equal(f.files.has(rotated), false);
    assert.equal(f.store.events('main_db', 1, now + 100).length, 2);
    assert.equal(f.collector.status().status, 'degraded');
    assert.match(f.collector.status().message!, /incomplete/);
  } finally { f.db.close(); }
});

test('source failure exposes only a safe error and recovery resumes saved offsets', async () => {
  const f = fixture();
  try {
    const inventory = f.source.inventory;
    f.source.inventory = async () => { throw new Error('password=private and SELECT secret'); };
    await f.collector.poll(true);
    assert.equal(f.collector.status().status, 'unavailable');
    assert.doesNotMatch(JSON.stringify(f.collector.status()), /private|secret/);
    f.source.inventory = inventory;
    await f.collector.poll(true);
    assert.equal(f.collector.status().status, 'active');
    assert.equal(f.store.events('main_db', 1, now + 100).length, 1);
  } finally { f.db.close(); }
});

test('oversized records are bounded and skipped, subsequent valid executions are still collected', async () => {
  const f = fixture();
  try {
    f.files.set(file, Buffer.from('x'.repeat(1024 * 1024 + 80) + '\n' + line()));
    await f.collector.poll(true);
    assert.equal(f.store.events('main_db', 1, now + 100).length, 1);
    assert.equal(f.collector.status().status, 'degraded');
  } finally { f.db.close(); }
});

test('SQLite batch failure rolls back events and checkpoint together', () => {
  const f = fixture();
  try {
    f.db.exec(`CREATE TRIGGER fail_checkpoint BEFORE INSERT ON metric_log_cursors BEGIN SELECT RAISE(ABORT,'fixture'); END;`);
    assert.throws(() => f.store.ingestLog(file, 100, false, 100, [parse()!], now));
    assert.equal(f.store.logCursors().length, 0);
    assert.equal(f.store.events('main_db', 1, now + 100).length, 0);
  } finally { f.db.close(); }
});

test('closed truncated logs are reported and removed; buffer pressure is never presented as complete coverage', async () => {
  const f = fixture();
  try {
    const closed = 'activity-20261021-115958.json';
    f.files.set(closed, Buffer.from('{"unfinished":'));
    await f.collector.poll(true);
    assert.equal(f.files.has(closed), false);
    assert.equal(f.collector.status().status, 'degraded');
    const second = fixture();
    try {
      second.source.inventory = async () => ({
        current: file, files: [{ name: file, size: 60 * 1024 * 1024 }],
      });
      second.source.read = async () => null;
      await second.collector.poll(true);
      assert.equal(second.collector.status().status, 'degraded');
    } finally { second.db.close(); }
  } finally { f.db.close(); }
});
