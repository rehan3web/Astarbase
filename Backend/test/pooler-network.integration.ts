import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';
import type { Config } from '../src/config.js';
import type { ClientRolesService } from '../src/services/connection/client-roles.service.js';
import type { BranchService } from '../src/services/branches/branches.service.js';
import { writePoolConfig } from '../../docker/pgbouncer/entrypoint.mts';

export async function verifyPoolerNetwork(t: TestContext, config: Config, directory: string,
  roles: ClientRolesService, branches: BranchService) {
  await t.test('real PgBouncer rejects public admin, preserves Unix console, and dynamically authenticates main/branch/child', {
    skip: spawnSync('pgbouncer', ['--version'], { stdio: 'ignore' }).status !== 0,
    timeout: 30000,
  }, async () => {
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    const socket = path.join(directory, 'pool-socket');
    await mkdir(socket);
    const file = await writePoolConfig(path.join(directory, 'pool-config'),
      { DB_USER: config.DB_USER, DB_PASSWORD: config.DB_PASSWORD });
    await writeFile(file, (await readFile(file, 'utf8'))
      .replace('host=/var/run/postgresql', `host=${config.PG_SOCKET_DIR}`)
      .replace('listen_addr = 0.0.0.0', 'listen_addr = 127.0.0.1')
      .replace('listen_port = 6432', `listen_port = ${port}`)
      .replace('unix_socket_dir = /tmp', `unix_socket_dir = ${socket}`), { mode: 0o600 });
    const process = spawn('pgbouncer', [file], { stdio: ['ignore', 'ignore', 'pipe'] });
    let startupError: Error | undefined;
    process.on('error', error => { startupError = error; });
    process.stderr.resume();
    const query = async (host: string, database: string, user: string, password: string, sql = 'SELECT current_user') => {
      const client = new pg.Client({ host, port, database, user, password, connectionTimeoutMillis: 1500 });
      try { await client.connect(); return await client.query(sql); }
      finally { await client.end(); }
    };
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (startupError) throw startupError;
        if (process.exitCode !== null) throw new Error('Test PgBouncer exited before it was ready');
        try { await query(socket, 'pgbouncer', config.DB_USER, config.DB_PASSWORD, 'SHOW DATABASES'); ready = true; break; }
        catch { await delay(40); }
      }
      assert.ok(ready, 'Unix admin console must remain accessible');
      for (const database of [config.DB_NAME, 'branch_dev', 'branch_nested', 'postgres', 'pgbouncer']) {
        await assert.rejects(query('127.0.0.1', database, config.DB_USER, config.DB_PASSWORD), /login rejected|authentication failed|not allowed/i);
      }
      for (const database of [config.DB_NAME, 'branch_dev', 'branch_nested']) {
        const credentials = await roles.get(database);
        const result = await query('127.0.0.1', database, credentials.user, credentials.password);
        assert.equal(result.rows[0].current_user, credentials.user);
      }
      // An already running pooler must discover a newly created branch.
      await branches.create('pool_live');
      const created = await roles.get('branch_pool_live');
      assert.equal((await query('127.0.0.1', 'branch_pool_live', created.user, created.password)).rows[0].current_user, created.user);
      const old = await roles.get(config.DB_NAME);
      const password = 'new-main-pool-test-password-2026';
      await roles.reset(config.DB_NAME, password);
      await assert.rejects(query('127.0.0.1', config.DB_NAME, old.user, old.password), /password authentication failed|SASL authentication failed/i);
      assert.equal((await query('127.0.0.1', config.DB_NAME, old.user, password)).rows[0].current_user, old.user);
      // Reset/terminate/pool-size administration retains its Unix console access.
      await query(socket, 'pgbouncer', config.DB_USER, config.DB_PASSWORD, 'KILL branch_pool_live');
      await query(socket, 'pgbouncer', config.DB_USER, config.DB_PASSWORD, 'RESUME branch_pool_live');
      await query(socket, 'pgbouncer', config.DB_USER, config.DB_PASSWORD, 'RELOAD');
    } finally {
      if (process.exitCode === null) {
        const exited = once(process, 'exit');
        process.kill('SIGTERM');
        await exited;
      }
    }
  });
}
