import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writePoolConfig } from '../../docker/pgbouncer/entrypoint.mts';

const fixture = { DB_USER: 'test_admin', DB_PASSWORD: 'test-only-$;"quoted"\\password' };

test('TypeScript PgBouncer configuration preserves wildcard Unix routing and private file modes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'astarbase-pool-'));
  try {
    // Simulate the preinstalled package file; existing modes must also be tightened.
    await writeFile(path.join(dir, 'pgbouncer.ini'), 'old package config', { mode: 0o644 });
    const file = await writePoolConfig(dir, fixture);
    const config = await readFile(file, 'utf8');
    assert.match(config, /^\* = host=\/var\/run\/postgresql port=5432$/m);
    assert.match(config, /^auth_type = hba$/m);
    assert.ok(config.includes(`auth_hba_file = ${path.join(dir, 'pg_hba.conf')}`));
    const hba = await readFile(path.join(dir, 'pg_hba.conf'), 'utf8');
    assert.match(hba, /^local all "test_admin" scram-sha-256$/m);
    assert.match(hba, /^host all "test_admin" 0\.0\.0\.0\/0 reject$/m);
    assert.match(hba, /^host all "test_admin" ::\/0 reject$/m);
    assert.ok(hba.indexOf('reject') < hba.indexOf('host all all'));
    assert.match(hba, /^host all all 0\.0\.0\.0\/0 scram-sha-256$/m);
    assert.match(hba, /^host all all ::\/0 scram-sha-256$/m);
    assert.equal((await stat(path.join(dir, 'pg_hba.conf'))).mode & 0o777, 0o600);
    assert.match(config, /^listen_addr = 0.0.0.0$/m);
    assert.match(config, /^listen_port = 6432$/m);
    assert.match(config, /^max_client_conn = 200$/m);
    assert.match(config, /^auth_user = test_admin$/m);
    assert.match(config, /^admin_users = test_admin$/m);
    assert.match(config, /^auth_dbname = postgres$/m);
    assert.match(config, /^auth_query = SELECT usename, passwd FROM astarbase_pool_auth.lookup\(\$1\)$/m);
    assert.match(config, /^reserve_pool_size = 0$/m);
    assert.equal(config.includes(fixture.DB_PASSWORD), false);
    assert.equal(await readFile(path.join(dir, 'users.txt'), 'utf8'), `"test_admin" "${fixture.DB_PASSWORD.replaceAll('"', '""')}"\n`);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    for (const name of ['users.txt', 'pgbouncer.ini']) assert.equal((await stat(path.join(dir, name))).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pool size survives container startup and invalid persisted sizes fail explicitly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'astarbase-pool-size-'));
  try {
    await writeFile(path.join(dir, 'pool-size'), '35');
    const file = await writePoolConfig(dir, fixture);
    assert.match(await readFile(file, 'utf8'), /^default_pool_size = 35$/m);
    for (const value of ['0', '81', 'bad']) {
      await writeFile(path.join(dir, 'pool-size'), value);
      await assert.rejects(writePoolConfig(dir, fixture), /Invalid saved pool size/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('invalid pool credentials fail before touching config files and never appear in errors', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'astarbase-pool-'));
  try {
    const file = path.join(dir, 'pgbouncer.ini');
    await writeFile(file, 'preserve');
    for (const env of [
      { ...fixture, DB_USER: 'invalid-user' },
      { ...fixture, DB_PASSWORD: 'short' },
      { ...fixture, DB_PASSWORD: 'invalid-control-password\n' },
      {},
    ]) {
      await assert.rejects(writePoolConfig(dir, env), /Invalid DB_USER|DB_PASSWORD must/);
      assert.equal(await readFile(file, 'utf8'), 'preserve');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Node 24 runs the TypeScript entrypoint natively and hands control to PgBouncer without a shell', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'astarbase-pool-'));
  try {
    const script = `
      import assert from 'node:assert/strict';
      import { start } from ${JSON.stringify(new URL('../../docker/pgbouncer/entrypoint.mts', import.meta.url).href)};
      Object.assign(process.env, ${JSON.stringify(fixture)});
      assert.equal(typeof process.execve, 'function');
      process.execve = (file, args, env) => {
        assert.equal(file, '/usr/bin/pgbouncer');
        assert.deepEqual(args, ['pgbouncer', ${JSON.stringify(path.join(dir, 'pgbouncer.ini'))}]);
        assert.equal(env.DB_USER, 'test_admin');
        process.stdout.write('native TypeScript startup verified');
      };
      await start(${JSON.stringify(dir)});
      process.execve = undefined;
      await assert.rejects(start(${JSON.stringify(dir)}), /requires Node.js 24 on Linux/);
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script]);
    assert.equal(stdout, 'native TypeScript startup verified');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
