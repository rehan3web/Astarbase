import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type Docker from 'dockerode';
import type { Config } from '../src/config.js';
import { config as fixture } from './helpers.js';
import { withDatabase } from '../src/db/socket.js';
import { recoveryContainer, recoveryStatement } from '../src/services/system/password-recovery.service.js';

const run = promisify(execFile);
test('offline password recovery preserves real SCRAM-authenticated databases, roles and auth rules', {
  skip: process.env.RUN_SOCKET_INTEGRATION !== '1', timeout: 60000,
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sorabase-recovery-'));
  const data = path.join(dir, 'data');
  const socket = path.join(dir, 'socket');
  const passwordFile = path.join(dir, 'password');
  const oldPassword = 'old-test-only-password-0000';
  const newPassword = "new-test-only-'; SELECT pg_sleep(90); --\\$";
  const oldConfig = { ...fixture, DB_PASSWORD: oldPassword, PG_SOCKET_DIR: socket } as Config;
  const nextConfig = { ...oldConfig, DB_PASSWORD: newPassword };
  let running = false;
  const start = async () => {
    await run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-k ${socket} -h '' -p 5432`, '-w', 'start']);
    running = true;
  };
  const stop = async () => {
    await run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    running = false;
  };
  const standalone = async (sql: string) => {
    const info = {
      Image: 'local-test-image', State: { Running: false, Restarting: false, Status: 'exited', ExitCode: 0 }, Config: { Env: [`PGDATA=${data}`] },
      Mounts: [{ Type: 'bind', Source: data, Destination: data, RW: true }],
    } as Docker.ContainerInspectInfo;
    return new Promise<string>((resolve, reject) => {
      const child = execFile('postgres', recoveryContainer(info).Cmd!, { timeout: 15000, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => error ? reject(new Error('Standalone recovery process failed')) : resolve(stdout + stderr));
      child.stdin!.end(sql);
    });
  };
  try {
    await mkdir(socket);
    await writeFile(passwordFile, oldPassword, { mode: 0o600 });
    await run('initdb', ['-D', data, '-U', fixture.DB_USER, '-A', 'scram-sha-256', '--pwfile', passwordFile, '--no-locale']);
    const hbaBefore = await readFile(path.join(data, 'pg_hba.conf'), 'utf8');
    await start();
    const rolesBefore = await withDatabase(oldConfig, 'postgres', async client => {
      await client.query('CREATE TABLE public.keep_data(id integer PRIMARY KEY, value text)');
      await client.query("INSERT INTO public.keep_data VALUES(1,'main data preserved')");
      await client.query('CREATE DATABASE branch_keep');
      return (await client.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles ORDER BY rolname')).rows;
    });
    await withDatabase(oldConfig, 'branch_keep', async client => {
      await client.query('CREATE TABLE public.keep_data(value text)');
      await client.query("INSERT INTO public.keep_data VALUES('branch data preserved')");
    });
    await assert.rejects(withDatabase(nextConfig, 'postgres', async () => {}), { code: '28P01' });
    await stop();
    const { sql, marker } = recoveryStatement(fixture.DB_USER, newPassword);
    const output = await standalone(sql);
    assert.match(output, new RegExp(`NOTICE:\\s+${marker}(?:\\r?\\n|$)`));
    await start();
    await assert.rejects(withDatabase(oldConfig, 'postgres', async () => {}), { code: '28P01' });
    await withDatabase(nextConfig, 'postgres', async client => {
      assert.equal((await client.query('SELECT value FROM public.keep_data')).rows[0].value, 'main data preserved');
      assert.deepEqual((await client.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolcanlogin FROM pg_roles ORDER BY rolname')).rows, rolesBefore);
    });
    await withDatabase(nextConfig, 'branch_keep', async client => {
      assert.equal((await client.query('SELECT value FROM public.keep_data')).rows[0].value, 'branch data preserved');
    });
    assert.equal(await readFile(path.join(data, 'pg_hba.conf'), 'utf8'), hbaBefore);
    await stop();
    const missing = recoveryStatement('missing_recovery_role', newPassword);
    const failed = await standalone(missing.sql);
    assert.doesNotMatch(failed, new RegExp(`NOTICE:\\s+${missing.marker}(?:\\r?\\n|$)`));
    await start();
    await withDatabase(nextConfig, 'postgres', async client => {
      assert.equal((await client.query('SELECT value FROM public.keep_data')).rows[0].value, 'main data preserved');
      assert.equal((await client.query("SELECT 1 FROM pg_roles WHERE rolname='missing_recovery_role'")).rowCount, 0);
    });
  } finally {
    if (running) await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
