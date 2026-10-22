import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { config as fixture } from './helpers.js';
import { MetricsStore } from '../src/db/metrics-store.js';
import { withDatabase, connection, quoteIdentifier } from '../src/db/socket.js';
import { PostgresLogSource } from '../src/services/metrics/postgres-log-source.js';
import { QueryLogCollector } from '../src/services/metrics/query-log-collector.js';

const run = promisify(execFile);
test('real PostgreSQL JSON logs capture external, prepared and PgBouncer traffic without internal-monitoring noise', {
  skip: process.env.RUN_QUERY_LOG_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sorabase-query-logs-'));
  const data = path.join(dir, 'data'), socket = path.join(dir, 'pg'), poolSocket = path.join(dir, 'pool');
  const logs = path.join(dir, 'logs');
  const config = { ...fixture, PG_SOCKET_DIR: socket };
  let started = false, pool: ChildProcess | undefined;
  const db = new DatabaseSync(path.join(dir, 'metrics.sqlite'));
  const store = new MetricsStore(db);
  try {
    await mkdir(socket); await mkdir(logs); await mkdir(poolSocket);
    await run('initdb', ['-D', data, '-U', config.DB_USER, '-A', 'trust', '--no-locale']);
    await writeFile(path.join(data, 'postgresql.auto.conf'), `
logging_collector=on
log_destination='jsonlog'
log_directory='${logs}'
log_filename='activity-%Y%m%d-%H%M%S.log'
log_duration=on
log_statement='none'
log_min_duration_statement=-1
log_min_duration_sample=-1
log_min_error_statement='panic'
log_error_verbosity='terse'
log_parameter_max_length=0
log_parameter_max_length_on_error=0
`);
    await run('pg_ctl', ['-D', data, '-l', path.join(dir, 'startup.log'),
      '-o', `-k ${socket} -h '' -p 5432`, '-w', 'start']);
    started = true;
    await withDatabase(config, 'postgres', async client => {
      await client.query(`CREATE DATABASE ${quoteIdentifier(config.DB_NAME)}`);
      await client.query('CREATE DATABASE child_log_db');
      await client.query('CREATE USER external_client LOGIN');
    });
    const source = new PostgresLogSource(config, file => rm(file), logs);
    const collector = new QueryLogCollector(source, store, config.DB_USER,
      () => new Set([config.DB_NAME, 'child_log_db']));
    await collector.poll(true);
    assert.equal(collector.status().status, 'active');
    const external = new pg.Client({ ...connection(config, config.DB_NAME), user: 'external_client', application_name: 'outside-app' });
    await external.connect();
    try {
      await external.query('SELECT 7 AS public_marker');
      await external.query('SELECT $1::text AS private_value', ['SENSITIVE_PARAMETER_MARKER']);
      await external.query('SELECT pg_sleep(1.05)');
      await assert.rejects(external.query('SELECT * FROM missing_external_fixture'));
    } finally { await external.end(); }
    await withDatabase(config, config.DB_NAME, async client => {
      // Ordinary admin/monitoring work must never inflate Runs.
      await client.query('SELECT 777');
    });
    await run('psql', ['-X', '-h', socket, '-U', config.DB_USER, '-d', config.DB_NAME, '-c', 'SELECT 8 AS studio_marker'],
      { env: { ...process.env, PGAPPNAME: 'sorabase-sql' } });
    const child = new pg.Client({ ...connection(config, 'child_log_db'), user: 'external_client', application_name: 'child-app' });
    await child.connect();
    await child.query('SELECT 9'); await child.end();
    // Real pooler on an isolated Unix socket; no public test listener or admin TCP.
    const poolConfig = path.join(dir, 'pgbouncer.ini');
    const users = path.join(dir, 'users.txt');
    await writeFile(users, '"external_client" "test-fixture-password"\n', { mode: 0o600 });
    await writeFile(poolConfig, `[databases]
* = host=${socket} port=5432
[pgbouncer]
listen_addr =
listen_port = 6543
unix_socket_dir = ${poolSocket}
auth_type = plain
auth_file = ${users}
pool_mode = transaction
max_client_conn = 20
`);
    pool = spawn('pgbouncer', [poolConfig], { stdio: ['ignore', 'ignore', 'pipe'] });
    let poolErrors = ''; pool.stderr?.on('data', value => { poolErrors += String(value); });
    for (let i = 0; i < 50; i++) {
      try { if ((await stat(path.join(poolSocket, '.s.PGSQL.6543'))).isSocket()) break; } catch {
        if (i === 49) throw new Error(`Test pooler did not start: ${poolErrors}`);
        await delay(50); continue;
      }
      break;
    }
    const pooled = new pg.Client({
      host: poolSocket, port: 6543, database: config.DB_NAME, user: 'external_client',
      password: 'test-fixture-password', application_name: 'pooled-app',
    });
    await pooled.connect();
    try { await pooled.query('SELECT 10 AS pooled_marker'); } finally { await pooled.end(); }
    // The syslogger is asynchronous. Wait for all expected metadata, not a
    // fixed sleep, and then prove another read doesn't duplicate it.
    let events = store.events(config.DB_NAME, 1, Date.now());
    for (let i = 0; i < 60; i++) {
      await collector.poll(true);
      events = store.events(config.DB_NAME, 1, Date.now());
      if (events.length >= 7) break;
      await delay(50);
    }
    assert.equal(collector.status().status, 'active', JSON.stringify(collector.status()));
    const summary = [];
    for (const file of (await source.inventory()).files) {
      const content = await readFile(path.join(logs, file.name), 'utf8');
      for (const line of content.trim().split('\n')) {
        const entry = JSON.parse(line);
        if (entry.dbname === config.DB_NAME && entry.user === 'external_client') {
          summary.push({ command: entry.ps, severity: entry.error_severity, app: entry.application_name });
        }
      }
    }
    // PgBouncer executes SET application_name as well as forwarding SELECT.
    // Both are real server executions, not duplicate Parse/Bind log phases.
    assert.equal(events.length, 7, `4 outside + 1 Studio + pooler SET/SELECT: ${JSON.stringify(summary)}`);
    assert.equal(events.filter(event => event.status === 'error').length, 1);
    assert.equal(events.filter(event => event.status === 'success' && event.durationMs >= 1000).length, 1);
    assert.equal(store.events('child_log_db', 1, Date.now()).length, 1);
    await collector.poll(true);
    assert.equal(store.events(config.DB_NAME, 1, Date.now()).length, 7);
    const serialized = JSON.stringify(db.prepare('SELECT * FROM metric_events').all());
    assert.doesNotMatch(serialized, /SENSITIVE_PARAMETER_MARKER|public_marker|studio_marker|pooled_marker|missing_external_fixture|external_client/);
    const inventory = await source.inventory();
    for (const file of inventory.files) {
      const content = await readFile(path.join(logs, file.name), 'utf8');
      assert.doesNotMatch(content, /SENSITIVE_PARAMETER_MARKER|public_marker|studio_marker|pooled_marker/);
    }
    collector.stop();
  } finally {
    if (pool && pool.exitCode === null) {
      pool.kill('SIGTERM');
      await new Promise<void>(resolve => { pool!.once('exit', () => resolve()); setTimeout(resolve, 2000).unref(); });
    }
    if (started) await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
