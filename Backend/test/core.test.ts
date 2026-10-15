import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { connection, quoteIdentifier } from '../src/db/socket.js';
import { PostgresContainer } from '../src/services/docker/postgres.js';
import { DockerService } from '../src/services/docker/docker.js';
import { TableService, type TableInfo } from '../src/services/tables/tables.service.js';
import { config } from './helpers.js';

test('configuration rejects TCP addresses and remote Docker endpoints', () => {
  assert.throws(() => loadConfig({ ...config, PG_SOCKET_DIR: 'localhost' }), /PG_SOCKET_DIR/);
  assert.throws(() => loadConfig({ ...config, DOCKER_SOCKET: 'tcp://docker:2375' }), /DOCKER_SOCKET/);
  assert.throws(() => loadConfig({ ...config, DB_NAME: config.LEGACY_CONTROL_DB }), /distinct/);
  assert.throws(() => loadConfig({ ...config, DB_PASSWORD: 'a\nlong-invalid-password' }), /Control/);
  const args = connection(config, config.DB_NAME);
  assert.equal(args.host, '/var/run/postgresql');
  assert.equal(args.ssl, false);
  assert.equal('connectionString' in args, false);
  assert.equal(new DockerService(config).docker.modem.socketPath, '/var/run/docker.sock');
});

test('identifiers are quoted, including embedded quotes; invalid identifiers fail', () => {
  assert.equal(quoteIdentifier('a"; DROP TABLE users;--'), '"a""; DROP TABLE users;--"');
  assert.throws(() => quoteIdentifier('a\0b'));
  assert.throws(() => quoteIdentifier('x'.repeat(64)));
});

test('SQL runner uses argv and explicit Unix host, never a shell or psql script', async () => {
  const docker = new DockerService(config);
  const commands: string[][] = [];
  docker.exec = async command => { commands.push(command); return { stdout: 'answer\n42\n', stderr: '' }; };
  const postgres = new PostgresContainer(config, docker);
  const result = await postgres.query(config.DB_NAME, "SELECT ';$(echo injected)'");
  assert.equal(result.format, 'csv');
  assert.equal(result.stdout, 'answer\n42\n');
  assert.equal(commands[0][0], 'psql');
  assert.ok(commands[0].includes('/var/run/postgresql'));
  assert.equal(commands[0].at(-1), "SELECT ';$(echo injected)'");
  for (const sql of ['\\! id', ' \n\\copy users to /tmp/x', '', 'SELECT \0', 'x'.repeat(60001)]) {
    await assert.rejects(postgres.query(config.DB_NAME, sql));
  }
});

test('dump and restore use custom archives in the container, no host paths', async () => {
  const docker = new DockerService(config);
  const commands: string[][] = [];
  docker.exec = async command => { commands.push(command); return { stdout: '1234\n', stderr: '' }; };
  const postgres = new PostgresContainer(config, docker);
  const id = '01234567-1234-4567-8901-012345678901';
  assert.equal(await postgres.dump(config.DB_NAME, id), 1234);
  await postgres.restore(config.DB_NAME, id);
  assert.equal(commands[0][0], 'pg_dump');
  assert.ok(commands[0].includes('/var/lib/astarbase/backups/' + id + '.dump'));
  assert.ok(commands[2].includes('--single-transaction'));
  await assert.rejects(postgres.dump(config.DB_NAME, '../../oops'));
});

function frame(text: string, stderr = false) {
  const body = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = stderr ? 2 : 1;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function fakeExec(service: DockerService, code: number, chunks: Buffer[], options: { hang?: boolean } = {}) {
  const stream = new PassThrough();
  let execOptions: Record<string, unknown> | undefined;
  service.docker.getContainer = (() => ({
    exec: async (opts: Record<string, unknown>) => {
      execOptions = opts;
      return {
        start: async () => {
          setImmediate(() => {
            chunks.forEach(c => stream.write(c));
            if (!options.hang) stream.end();
          });
          return stream;
        },
        inspect: async () => ({ ExitCode: code }),
      };
    },
  })) as unknown as typeof service.docker.getContainer;
  return () => execOptions;
}

test('Docker exec demultiplexes streams and checks the exit code', async () => {
  const docker = new DockerService(config);
  const options = fakeExec(docker, 0, [frame('rows'), frame('notice', true)]);
  assert.deepEqual(await docker.exec(['psql']), { stdout: 'rows', stderr: 'notice' });
  assert.equal(options()?.User, 'postgres');
  assert.equal(options()?.Tty, false);
  assert.ok((options()?.Env as string[]).includes('PGHOST=/var/run/postgresql'));
  fakeExec(docker, 1, [frame('SQL error', true)]);
  await assert.rejects(docker.exec(['psql']), /SQL error/);
});

test('Docker exec bounds output and handles a hung stream', async () => {
  const docker = new DockerService(config);
  fakeExec(docker, 0, [frame('x'.repeat(100))]);
  await assert.rejects(docker.exec(['psql'], 1000, 32), /output exceeds/);
  fakeExec(docker, 0, [], { hang: true });
  await assert.rejects(docker.exec(['psql'], 10), /timed out/);
});

const table = {
  schema: 'public', name: 'items', primaryKey: ['tenant', 'id'],
  columns: [
    { name: 'tenant', udt_name: 'text' }, { name: 'id', udt_name: 'int8' },
    { name: 'metadata', udt_name: 'jsonb' }, { name: 'generated', udt_name: 'text', generated: true },
  ],
} as TableInfo;
test('row editing validates composite primary keys and encodes JSON arrays', () => {
  const service = new TableService(config);
  assert.deepEqual(service.key(table, { tenant: 'one', id: 2 }, 3), {
    where: '"tenant" IS NOT DISTINCT FROM $3 AND "id" IS NOT DISTINCT FROM $4', values: ['one', 2],
  });
  assert.throws(() => service.key(table, { id: 2 }, 1), /every primary key/);
  assert.throws(() => service.key({ ...table, primaryKey: [] }, {}, 1), /requires a primary key/);
  assert.throws(() => service.values(table, { generated: 'unsafe' }), /generated/);
  assert.throws(() => service.values(table, { unknown: 'unsafe' }), /unknown/);
  assert.deepEqual(service.values(table, { metadata: [1, 2] }), [{ name: 'metadata', value: '[1,2]' }]);
});

test('PgBouncer forwards any database name and Compose persists separate admin and dump folders', async () => {
  const pool = await readFile(new URL('../../docker/pgbouncer/entrypoint.py', import.meta.url), 'utf8');
  assert.match(pool, /^\* = host=\/var\/run\/postgresql port=5432$/m);
  const compose = await readFile(new URL('../../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /- \.\/Backend\/backups:\/var\/lib\/astarbase\/backups/);
  assert.match(compose, /- \.\/Backend\/data:\/app\/Backend\/data/);
  assert.match(compose, /- \/var\/run\/docker\.sock:\/var\/run\/docker\.sock/);
});
