import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import { config } from './helpers.js';
import { Catalog } from '../src/services/admin/catalog.service.js';
import { CredentialStore } from '../src/services/connection/credential-store.js';
import { ClientRolesService } from '../src/services/connection/client-roles.service.js';
import type { withDatabase } from '../src/db/socket.js';

test('Sorabase startup preserves its saved main login and password', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorabase-saved-role-'));
  const options = { ...config, ADMIN_DATA_DIR: directory };
  const catalog = new Catalog(options);
  t.after(async () => { catalog.store.close(); await rm(directory, { recursive: true, force: true }); });
  catalog.exclusive = async operation => operation();
  const statements: string[] = [];
  const run = (async (_config, _database, operation) => operation({
    async query(sql: string) {
      statements.push(sql);
      if (sql.startsWith('SELECT rolcanlogin')) return { rows: [{ rolcanlogin: false, rolsuper: false }], rowCount: 1 };
      if (sql.startsWith('SELECT rolsuper')) return { rows: [{
        rolsuper: false, rolcreatedb: false, rolcreaterole: false, managed: true,
      }], rowCount: 1 };
      if (sql.startsWith('SELECT nspname')) return { rows: [{ nspname: 'public' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Client)) as typeof withDatabase;
  const roles = new ClientRolesService(options, catalog, run);
  const saved = { user: 'sorabase_main', password: 'saved-client-password-not-for-deployment' };
  await roles.credentials.set(config.DB_NAME, saved);
  await roles.initialize();
  assert.deepEqual(await roles.get(config.DB_NAME), saved);
  assert.ok(statements.some(sql => sql.startsWith('ALTER ROLE "sorabase_main" PASSWORD')));
  assert.ok(statements.every(sql => !sql.includes('CREATE ROLE "sorabase_main"')));
});

test('client credentials are encrypted, private, durable and bound to their database', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorabase-client-vault-'));
  try {
    const credential = { user: 'dev', password: 'private-client-fixture-only' };
    const vault = new CredentialStore(directory);
    assert.equal(await vault.get('branch_dev'), null);
    await vault.set('branch_dev', credential);
    assert.deepEqual(await new CredentialStore(directory).get('branch_dev'), credential);
    for (const file of await readdir(directory)) {
      const content = await readFile(path.join(directory, file));
      assert.equal(content.includes(Buffer.from(credential.password)), false);
      assert.equal((await stat(path.join(directory, file))).mode & 0o777, 0o600);
    }
    await vault.set('branch_child', { user: 'child', password: 'different-fixture-only' });
    assert.notDeepEqual(await vault.get('branch_child'), credential);
    assert.equal(await vault.get('../not-a-path'), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('main, branch and child get separate roles; resets and reprovision preserve other passwords', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sorabase-client-roles-'));
  const options = { ...config, ADMIN_DATA_DIR: directory };
  const catalog = new Catalog(options);
  t.after(async () => { catalog.store.close(); await rm(directory, { recursive: true, force: true }); });
  catalog.store.addBranch('dev', 'branch_dev', 'main');
  catalog.store.addBranch('child', 'branch_child', 'dev');
  // Only replace transport/locking in this unit test; production always uses Unix sockets.
  catalog.exclusive = async operation => operation();
  const queries: string[] = [];
  const existing = new Map<string, { managed: boolean; rolsuper: boolean }>();
  let rejectPassword = false;
  const run = (async (_config, _database, operation) => operation({
    async query(sql: string, values?: string[]) {
      queries.push(sql);
      if (sql.startsWith('SELECT rolcanlogin')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT rolsuper')) {
        const role = existing.get(values![0]);
        return { rows: role ? [role] : [], rowCount: role ? 1 : 0 };
      }
      if (sql.startsWith('CREATE ROLE') && sql.includes(' LOGIN ')) {
        existing.set(/^CREATE ROLE "([^"]+)"/.exec(sql)![1], { managed: true, rolsuper: false });
      }
      if (sql.startsWith('ALTER ROLE') && rejectPassword) throw new Error('simulated password failure');
      if (sql.includes('FROM pg_namespace')) return { rows: [{ nspname: 'public' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as pg.Client)) as typeof withDatabase;
  const roles = new ClientRolesService(options, catalog, run);
  await roles.initialize();
  const main = await roles.get(config.DB_NAME);
  const dev = await roles.get('branch_dev');
  const child = await roles.get('branch_child');
  assert.equal(main.user, 'sorabase_main');
  assert.equal(dev.user, 'dev');
  assert.equal(child.user, 'child');
  assert.equal(new Set([main.password, dev.password, child.password, config.DB_PASSWORD]).size, 4);
  assert.match(child.password, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(queries.some(sql => sql.includes('REVOKE CONNECT ON DATABASE "branch_child" FROM PUBLIC')));
  assert.ok(queries.some(sql => sql.includes('SECURITY DEFINER SET search_path = pg_catalog')));
  assert.ok(queries.some(sql => sql.includes('AND NOT rolsuper')));
  assert.ok(queries.some(sql => sql.includes('REVOKE ALL ON FUNCTION')));
  const chosenPassword = `chosen-password-'quote-\\slash-$"`;
  await roles.reset('branch_dev', chosenPassword);
  assert.equal((await roles.get('branch_dev')).password, chosenPassword);
  assert.notEqual((await roles.get('branch_dev')).password, dev.password);
  assert.deepEqual(await roles.get(config.DB_NAME), main);
  assert.deepEqual(await roles.get('branch_child'), child);
  const rotated = await roles.get('branch_dev');
  await roles.provision('branch_dev', 'dev');
  assert.deepEqual(await roles.get('branch_dev'), rotated);
  rejectPassword = true;
  await assert.rejects(roles.reset('branch_dev', 'replacement-client-password'), /Could not rotate/);
  assert.deepEqual(await roles.get('branch_dev'), rotated);
  await assert.rejects(roles.reset('unmanaged', chosenPassword), /Managed database not found/);
  for (const password of ['', 'short', 'x'.repeat(257), 'invalid-control-password\n']) {
    await assert.rejects(roles.reset('branch_dev', password), /16–256/);
  }
  existing.set('collision', { managed: false, rolsuper: true });
  await assert.rejects(roles.provision('branch_collision', 'collision'), /already in use/);
  assert.equal(await roles.credentials.get('branch_collision'), null);
});
