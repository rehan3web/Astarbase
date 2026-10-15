import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duplex } from 'node:stream';
import type Docker from 'dockerode';
import { recoveryContainer, recoveryStatement, resetDatabasePassword } from '../src/services/system/password-recovery.service.js';
import { config } from './helpers.js';

const inspect = {
  Image: 'sha256:existing-postgres-image',
  State: { Running: false, Restarting: false, Status: 'exited', ExitCode: 0 },
  Config: { Env: ['PGDATA=/var/lib/postgresql/data', 'POSTGRES_PASSWORD=never-copy-this'] },
  Mounts: [{ Type: 'volume', Name: 'existing-data-volume', Source: '/host/data', Destination: '/var/lib/postgresql/data', RW: true }],
} as Docker.ContainerInspectInfo;

test('recovery reuses only the stopped database data mount and exact image with no network or Docker logs', () => {
  const options = recoveryContainer(inspect);
  assert.equal(options.Image, inspect.Image);
  assert.equal(options.User, 'postgres');
  assert.deepEqual(options.Entrypoint, ['postgres']);
  assert.equal(options.HostConfig?.NetworkMode, 'none');
  assert.equal(options.HostConfig?.LogConfig?.Type, 'none');
  assert.deepEqual(options.HostConfig?.Mounts, [{
    Type: 'volume', Source: 'existing-data-volume', Target: '/var/lib/postgresql/data', ReadOnly: false,
  }]);
  assert.equal(JSON.stringify(options).includes('never-copy-this'), false);
  assert.doesNotMatch(JSON.stringify(options), /initdb|pg_hba|docker\.sock/);
  assert.throws(() => recoveryContainer({ ...inspect, State: { ...inspect.State, Running: true } }), /still running/);
  assert.throws(() => recoveryContainer({ ...inspect, State: { ...inspect.State, Restarting: true } }), /restarting/);
  assert.throws(() => recoveryContainer({ ...inspect, State: { ...inspect.State, ExitCode: 137 } }), /shut down cleanly/);
  assert.throws(() => recoveryContainer({ ...inspect, Mounts: [] }), /persistent/);
});

test('password SQL stays on stdin and escapes quotes without changing permissions or dropping data', () => {
  const password = "test-only-'; DROP DATABASE postgres; --\\$quoted$";
  const { sql, marker } = recoveryStatement('test_admin', password);
  assert.equal(sql.split('\n').length, 2);
  assert.ok(sql.includes(password.replaceAll("'", "''")));
  assert.match(sql, /ALTER ROLE %I PASSWORD %L/);
  assert.ok(sql.includes(`RAISE NOTICE '${marker}'`));
  assert.throws(() => recoveryStatement('invalid-user', password), /Invalid DB_USER/);
  assert.throws(() => recoveryStatement('test_admin', 'short'), /at least 16/);
});

test('recovery requires confirmation, sends password only through stdin, and removes helper without volumes', async () => {
  let options: Docker.ContainerCreateOptions | undefined;
  let input = '';
  let removed: unknown;
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) { input += chunk.toString(); callback(); },
    final(callback) {
      const marker = input.match(/RAISE NOTICE '([^']+)'/)?.[1];
      this.push(Buffer.from(`NOTICE:  ${marker}\n`));
      this.push(null); callback();
    },
  });
  const helper = {
    attach: async () => stream, start: async () => {}, wait: async () => ({ StatusCode: 0 }),
    inspect: async () => ({ State: { Running: false } }),
    remove: async (value: unknown) => { removed = value; },
  };
  const docker = {
    getContainer: () => ({ inspect: async () => inspect }),
    listContainers: async () => [],
    createContainer: async (value: Docker.ContainerCreateOptions) => { options = value; return helper; },
    modem: { demuxStream: (source: Duplex, output: NodeJS.WritableStream) => source.on('data', chunk => output.write(chunk)) },
  } as unknown as Docker;
  await assert.rejects(resetDatabasePassword(config, 'wrong_user', docker), /confirm-user/);
  assert.equal(options, undefined);
  await resetDatabasePassword(config, config.DB_USER, docker);
  assert.ok(input.includes(config.DB_PASSWORD));
  assert.equal(JSON.stringify(options).includes(config.DB_PASSWORD), false);
  assert.deepEqual(removed, { v: false });
});

test('recovery refuses a data mount already used by another running container', async () => {
  let created = false;
  const docker = {
    getContainer: () => ({ inspect: async () => inspect }),
    listContainers: async () => [{ Mounts: [{ Type: 'volume', Name: 'existing-data-volume', Source: '/host/data' }] }],
    createContainer: async () => { created = true; },
  } as unknown as Docker;
  await assert.rejects(resetDatabasePassword(config, config.DB_USER, docker), /Another running container/);
  assert.equal(created, false);
});

test('zero exit after SQL failure never reports success or leaks raw SQL, and still cleans up', async () => {
  let input = '';
  let removed = false;
  const stream = new Duplex({
    read() {},
    write(chunk, _encoding, callback) { input += chunk.toString(); callback(); },
    final(callback) { this.push(Buffer.from(`ERROR: role missing\nSTATEMENT: ${input}\n`)); this.push(null); callback(); },
  });
  const helper = {
    attach: async () => stream, start: async () => {}, wait: async () => ({ StatusCode: 0 }),
    inspect: async () => ({ State: { Running: false } }),
    remove: async () => { removed = true; },
  };
  const docker = {
    getContainer: () => ({ inspect: async () => inspect }), listContainers: async () => [],
    createContainer: async () => helper,
    modem: { demuxStream: (source: Duplex, output: NodeJS.WritableStream) => source.on('data', chunk => output.write(chunk)) },
  } as unknown as Docker;
  await assert.rejects(resetDatabasePassword(config, config.DB_USER, docker), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /not confirmed/);
    assert.equal(error.message.includes(config.DB_PASSWORD), false);
    return true;
  });
  assert.equal(removed, true);
});
