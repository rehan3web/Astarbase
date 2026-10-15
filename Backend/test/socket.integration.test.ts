import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
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
import { TableService } from '../src/services/tables/tables.service.js';
import { SchemaService } from '../src/services/visualizer/visualizer.service.js';

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
    const postgres = new PostgresContainer(config, docker);
    catalog = new Catalog(config);
    const branches = new BranchService(catalog, postgres);
    const backups = new BackupService(catalog, postgres, branches);
    const tables = new TableService(config);
    const schema = new SchemaService(tables);

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

    await t.test('backup files are listed via container adapter and restored atomically', async () => {
      const backup = await backups.create('branch_dev', 'Before test edit');
      assert.ok(Number(backup.size_bytes) > 0);
      const list = await backups.list('branch_dev');
      assert.equal(list.length, 1);
      assert.equal(list[0].available, true);
      await tables.update('branch_dev', 'public', 'items', { tenant_id: 1, id: 10 }, { name: 'after-backup' });
      await backups.restore(backup.id, 'branch_dev');
      assert.equal((await tables.rows('branch_dev', 'public', 'items', 10, 0)).rows[0].name, 'parent-new');
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
