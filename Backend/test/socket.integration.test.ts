import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config } from '../src/config.js';
import { config as fixture } from './helpers.js';
import { withDatabase, quoteIdentifier } from '../src/db/socket.js';
import { pushDatabase } from '../src/db/push.js';
import { DockerService } from '../src/services/docker/docker.js';
import { PostgresContainer } from '../src/services/docker/postgres.js';
import { Catalog } from '../src/services/admin/catalog.service.js';
import { BranchService } from '../src/services/branches/branches.service.js';
import { BackupService } from '../src/services/backups/backups.service.js';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { TableService } from '../src/services/tables/tables.service.js';
import { SchemaService } from '../src/services/visualizer/visualizer.service.js';
import { ClientRolesService } from '../src/services/connection/client-roles.service.js';

const run = promisify(execFile);
test('real Postgres over Unix socket: DB push, CRUD, ERD, branching, refresh and backup restore', {
  skip: process.env.RUN_SOCKET_INTEGRATION !== '1',
  timeout: 120000,
}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'astarbase-socket-test-'));
  const socket = path.join(dir, 'socket');
  const data = path.join(dir, 'data');
  const backupsDir = path.join(dir, 'backups');
  await mkdir(socket);
  await mkdir(backupsDir);
  let started = false;
  let catalog: Catalog | undefined;
  // Only this isolated test overrides the two fixed production socket paths.
  const config = { ...fixture, PG_SOCKET_DIR: socket, BACKUP_DIR: backupsDir, ADMIN_DATA_DIR: path.join(dir, 'admin') } as Config;
  try {
    await run('initdb', ['-D', data, '-U', config.DB_USER, '-A', 'trust', '--no-locale']);
    await run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'),
      '-o', `-k ${socket} -h '' -p 5432`, '-w', 'start']);
    started = true;
    await withDatabase(config, 'postgres', client => client.query(`CREATE DATABASE ${quoteIdentifier(config.DB_NAME)}`));
    await pushDatabase(config);
    await pushDatabase(config); // Idempotent first-run push.
    await withDatabase(config, 'postgres', async client => {
      assert.equal((await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.LEGACY_CONTROL_DB])).rowCount, 0);
    });
    const docker = new DockerService(config);
    // Exercise real psql/pg_dump/pg_restore against the temporary Unix-only
    // cluster. This adapter is test-only: it does NOT verify a Docker daemon.
    docker.exec = async command => {
      const [exe, ...args] = command;
      assert.ok(['psql', 'pg_dump', 'pg_restore', 'stat', 'rm', 'find'].includes(exe));
      const result = await run(exe, args, {
        env: { ...process.env, PGHOST: socket, PGUSER: config.DB_USER, PGPASSWORD: config.DB_PASSWORD },
        maxBuffer: 8 * 1024 * 1024,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    docker.execTo = async (command, destination) => {
      assert.equal(command[0], 'pg_restore');
      const process = spawn(command[0], command.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
      const done = new Promise<void>((resolve, reject) => {
        process.on('error', reject);
        process.on('exit', code => code === 0 ? resolve() : reject(new Error('pg_restore failed')));
      });
      process.stderr.resume();
      await Promise.all([pipeline(process.stdout, destination, { end: false }), done]);
    };
    const postgres = new PostgresContainer(config, docker);
    catalog = new Catalog(config);
    await withDatabase(config, 'postgres', client =>
      client.query(`ALTER ROLE ${quoteIdentifier(config.DB_USER)} PASSWORD '${config.DB_PASSWORD}'`));
    // The cluster is disposable and Unix-only. Exercise real SCRAM, not trust auth.
    await writeFile(path.join(data, 'pg_hba.conf'), 'local all all scram-sha-256\n');
    await run('pg_ctl', ['-D', data, 'reload']);
    const roles = new ClientRolesService(config, catalog);
    await roles.initialize();
    const branches = new BranchService(catalog, postgres, roles);
    const backups = new BackupService(catalog, postgres, branches);
    const tables = new TableService(config);
    const schema = new SchemaService(tables);
    await t.test('branch storage matches PostgreSQL database size over the Unix socket', async () => {
      const main = (await branches.list()).find(branch => branch.name === 'main')!;
      const actual = await withDatabase(config, 'postgres', client => client.query(
        'SELECT pg_database_size($1)::text AS bytes', [config.DB_NAME],
      ));
      assert.equal(main.storage_bytes, Number(actual.rows[0].bytes));
      assert.ok(main.storage_bytes > 0);
    });

    await t.test('SQL runner and table CRUD preserve parameterized values', async () => {
      await postgres.query(config.DB_NAME, `
        CREATE TABLE tenants (id integer PRIMARY KEY, name text);
        CREATE TABLE items (
          tenant_id integer, id integer, name text, metadata jsonb,
          PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE TABLE child (tenant_id integer, item_id integer,
          FOREIGN KEY(tenant_id,item_id) REFERENCES items(tenant_id,id));
        CREATE TABLE no_key (name text);
        INSERT INTO tenants VALUES(1,'Tenant');
      `);
      await tables.insert(config.DB_NAME, 'public', 'items', {
        tenant_id: 1, id: 10, name: "quote'; DROP TABLE items; --", metadata: [1, { ok: true }],
      });
      const page = await tables.rows(config.DB_NAME, 'public', 'items', 10, 0);
      assert.equal(page.total, '1');
      assert.deepEqual(page.primaryKey, ['tenant_id', 'id']);
      assert.deepEqual(page.rows[0].metadata, [1, { ok: true }]);
      await tables.update(config.DB_NAME, 'public', 'items', { tenant_id: 1, id: 10 }, { name: 'original' });
      await tables.insert(config.DB_NAME, 'public', 'items', { tenant_id: 1, id: 11 });
      await tables.delete(config.DB_NAME, 'public', 'items', { tenant_id: 1, id: 11 });
      await assert.rejects(tables.update(config.DB_NAME, 'public', 'no_key', {}, { name: 'x' }), /primary key/);
      assert.equal((await tables.list(config.DB_NAME)).length, 4);
      const result = await postgres.query(config.DB_NAME, 'SELECT 42 AS answer');
      assert.match(result.stdout, /answer\n42/);
    });

    await t.test('schema includes composite foreign keys and delete rules', async () => {
      const erd = await schema.diagram(config.DB_NAME);
      assert.equal(erd.nodes.length, 4);
      assert.equal(erd.edges.length, 2);
      const composite = erd.edges.find(edge => edge.source_table === 'child');
      assert.deepEqual(composite.source_columns, ['tenant_id', 'item_id']);
      assert.deepEqual(composite.target_columns, ['tenant_id', 'id']);
      assert.equal(erd.edges.find(edge => edge.source_table === 'items').on_delete, 'CASCADE');
    });

    await t.test('schema-only SQL recreates every table with real constraints, types and defaults but no data', async () => {
      await postgres.query(config.DB_NAME, `
        CREATE SCHEMA export_test;
        CREATE TYPE export_test.status AS ENUM ('active','inactive');
        CREATE TABLE export_test.templates (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "display name" varchar(35) NOT NULL,
          status export_test.status NOT NULL DEFAULT 'active',
          tags text[] DEFAULT '{}',
          total integer NOT NULL DEFAULT 1 CHECK(total > 0),
          doubled integer GENERATED ALWAYS AS (total * 2) STORED,
          tenant_id integer REFERENCES public.tenants(id) ON DELETE CASCADE,
          UNIQUE ("display name")
        );
        CREATE INDEX templates_status_idx ON export_test.templates(status);
        INSERT INTO export_test.templates ("display name") VALUES ('schema_export_row_marker');
      `);
      const exported = await postgres.schemaSql(config.DB_NAME);
      assert.equal(exported.database, config.DB_NAME);
      assert.match(exported.sql, /CREATE TABLE public\.items/);
      assert.match(exported.sql, /CREATE TABLE export_test\.templates/);
      assert.match(exported.sql, /GENERATED ALWAYS AS IDENTITY/);
      assert.match(exported.sql, /PRIMARY KEY \(tenant_id, id\)/);
      assert.doesNotMatch(exported.sql, /schema_export_row_marker|^COPY |^INSERT INTO |^\\restrict |^\\unrestrict /m);
      await withDatabase(config, 'postgres', client => client.query('CREATE DATABASE schema_template_test TEMPLATE template0'));
      try {
        // Execute as SQL, not a psql script: client-only directives must be gone.
        await postgres.query('schema_template_test', exported.sql);
        for (const [schema, table] of [['public', 'items'], ['export_test', 'templates']]) {
          const original = await withDatabase(config, config.DB_NAME, client => tables.info(client, schema, table));
          const restored = await withDatabase(config, 'schema_template_test', client => tables.info(client, schema, table));
          assert.deepEqual(restored, original);
          const restoredRows = await tables.rows('schema_template_test', schema, table, 10, 0);
          assert.equal(restoredRows.total, '0');
        }
        const constraints = (database: string) => withDatabase(config, database, client => client.query(`
          SELECT c.conname,pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
          WHERE n.nspname IN ('public','export_test') ORDER BY c.conname
        `));
        assert.deepEqual((await constraints('schema_template_test')).rows, (await constraints(config.DB_NAME)).rows);
      } finally {
        await withDatabase(config, 'postgres', client => client.query('DROP DATABASE schema_template_test WITH (FORCE)'));
      }
    });

    await t.test('branches copy data, allow independent writes, and refresh from their parent', async () => {
      const dev = await branches.create('dev');
      assert.equal(dev.database_name, 'branch_dev');
      await tables.update('branch_dev', 'public', 'items', { tenant_id: 1, id: 10 }, { name: 'dev-only' });
      assert.equal((await tables.rows(config.DB_NAME, 'public', 'items', 10, 0)).rows[0].name, 'original');
      await postgres.query('branch_dev', 'CREATE TABLE extra_dev_table(id integer)');
      await branches.create('nested', 'dev');
      assert.equal((await tables.rows('branch_nested', 'public', 'items', 10, 0)).rows[0].name, 'dev-only');
      await tables.update(config.DB_NAME, 'public', 'items', { tenant_id: 1, id: 10 }, { name: 'parent-new' });
      await branches.refresh('dev');
      assert.equal((await tables.rows('branch_dev', 'public', 'items', 10, 0)).rows[0].name, 'parent-new');
      assert.equal((await tables.list('branch_dev')).some(row => row.name === 'extra_dev_table'), false);
      await assert.rejects(branches.create('dev'), /already exists/);
      await assert.rejects(branches.refresh('main'), /no parent/);
    });

    await t.test('failed restore leaves original database and data intact', async () => {
      const original = postgres.restore.bind(postgres);
      postgres.restore = async () => { throw new Error('injected restore failure'); };
      try {
        await assert.rejects(branches.refresh('dev'), /injected restore failure/);
        assert.equal((await tables.rows('branch_dev', 'public', 'items', 10, 0)).rows[0].name, 'parent-new');
      } finally { postgres.restore = original; }
    });

    await t.test('SCRAM client roles isolate main, branch and child; password reset is branch-local', async () => {
      const main = await roles.get(config.DB_NAME);
      const dev = await roles.get('branch_dev');
      const nested = await roles.get('branch_nested');
      const connect = async (database: string, credential: { user: string; password: string }) => {
        const pg = await import('pg');
        const client = new pg.default.Client({ host: socket, database, ...credential });
        try { await client.connect(); return await client.query('SELECT current_user'); }
        finally { await client.end(); }
      };
      assert.equal((await connect('branch_dev', dev)).rows[0].current_user, 'dev');
      assert.equal((await connect('branch_nested', nested)).rows[0].current_user, 'nested');
      assert.equal((await connect(config.DB_NAME, main)).rows[0].current_user, 'astarbase_main');
      await assert.rejects(connect(config.DB_NAME, dev), /permission denied/);
      await assert.rejects(connect('branch_nested', dev), /permission denied/);
      await roles.reset('branch_dev');
      await assert.rejects(connect('branch_dev', dev), /password authentication failed/);
      const next = await roles.get('branch_dev');
      assert.equal((await connect('branch_dev', next)).rows[0].current_user, 'dev');
      assert.deepEqual(await roles.get(config.DB_NAME), main);
      assert.deepEqual(await roles.get('branch_nested'), nested);
      await roles.initialize();
      assert.deepEqual(await roles.get('branch_dev'), next);
      const lookup = await withDatabase(config, 'postgres', client =>
        client.query('SELECT * FROM astarbase_pool_auth.lookup($1)', ['dev']));
      assert.match(lookup.rows[0].passwd, /^SCRAM-SHA-256\$/);
      const adminLookup = await withDatabase(config, 'postgres', client =>
        client.query('SELECT * FROM astarbase_pool_auth.lookup($1)', [config.DB_USER]));
      assert.equal(adminLookup.rowCount, 0);
    });

    await t.test('backup files are listed via container adapter and restored atomically', async () => {
      const backup = await backups.create('branch_dev', 'Before test edit');
      assert.ok(Number(backup.size_bytes) > 0);
      const list = await backups.list('branch_dev');
      assert.equal(list.length, 1);
      assert.equal(list[0].available, true);
      await tables.update('branch_dev', 'public', 'items', { tenant_id: 1, id: 10 }, { name: 'after-backup' });
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on('data', chunk => chunks.push(chunk));
      await backups.download(backup.id, output);
      output.end();
      const sql = Buffer.concat(chunks).toString('utf8');
      assert.match(sql, /PostgreSQL database dump/);
      assert.match(sql, /parent-new/);
      assert.doesNotMatch(sql, /after-backup/);
      await backups.restore(backup.id, 'branch_dev');
      assert.equal((await tables.rows('branch_dev', 'public', 'items', 10, 0)).rows[0].name, 'parent-new');
      const remove = postgres.removeDump.bind(postgres);
      postgres.removeDump = async () => { throw new Error('injected filesystem failure'); };
      await assert.rejects(backups.delete(backup.id), /filesystem failure/);
      assert.ok(catalog!.store.backup(backup.id), 'Failed deletion retains metadata');
      postgres.removeDump = remove;
      await backups.delete(backup.id);
      assert.equal(catalog!.store.backup(backup.id), undefined);
      assert.equal((await postgres.listDumps()).has(backup.id), false);
      await assert.rejects(backups.download(backup.id, new PassThrough()), /not found/);
      await assert.rejects(backups.delete(backup.id), /not found/);
      await assert.rejects(catalog!.assertDatabase(config.LEGACY_CONTROL_DB), /not found/);
    });

    await t.test('previous Postgres admin metadata migrates to SQLite without deleting originals', async () => {
      await withDatabase(config, 'postgres', client => client.query(`CREATE DATABASE ${quoteIdentifier(config.LEGACY_CONTROL_DB)}`));
      await withDatabase(config, config.LEGACY_CONTROL_DB, client => client.query(`
        CREATE TABLE branches(name text PRIMARY KEY,database_name text,parent_name text,created_at timestamptz DEFAULT now(),refreshed_at timestamptz);
        CREATE TABLE backups(id uuid PRIMARY KEY,database_name text,label text,size_bytes bigint,created_at timestamptz DEFAULT now());
        INSERT INTO branches(name,database_name,parent_name) VALUES('main','${config.DB_NAME}',NULL),('legacy','branch_legacy','main');
        INSERT INTO backups(id,database_name,label,size_bytes) VALUES('01234567-1234-4567-8901-012345678901','branch_legacy','Old snapshot',4096);
      `));
      const importedConfig = { ...config, ADMIN_DATA_DIR: path.join(dir, 'imported-admin') };
      await pushDatabase(importedConfig);
      const migrated = new Catalog(importedConfig);
      try {
        assert.equal(migrated.store.branch('legacy')?.database_name, 'branch_legacy');
        assert.equal(migrated.store.backups()[0].label, 'Old snapshot');
        await withDatabase(config, config.LEGACY_CONTROL_DB, async client => {
          assert.equal((await client.query('SELECT * FROM backups')).rowCount, 1);
        });
      } finally { migrated.store.close(); }
    });
  } finally {
    catalog?.store.close();
    if (started) await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
});
