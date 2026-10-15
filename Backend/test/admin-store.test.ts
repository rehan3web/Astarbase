import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminStore } from '../src/db/admin-store.js';
import { config } from './helpers.js';

function fixture(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'astarbase-admin-test-'));
  const options = { ...config, ADMIN_DATA_DIR: dir };
  const ctx = { store: new AdminStore(options), options };
  t.after(() => { ctx.store.close(); rmSync(dir, { recursive: true, force: true }); });
  return ctx;
}

test('SQLite settings, branch inventory and backup metadata survive reopen', t => {
  const ctx = fixture(t);
  assert.equal(path.basename(ctx.store.file), 'admin.sqlite');
  assert.equal(statSync(ctx.store.file).mode & 0o777, 0o600);
  ctx.store.updateSettings({ projectName: 'My project', defaultRowLimit: 25, theme: 'dark' });
  ctx.store.addBranch('dev', 'branch_dev', 'main');
  ctx.store.addBackup('backup-id', 'branch_dev', 'Before edit', 1024);
  ctx.store.close();
  ctx.store = new AdminStore(ctx.options);
  assert.deepEqual(ctx.store.settings(), { projectName: 'My project', defaultRowLimit: 25, theme: 'dark' });
  assert.equal(ctx.store.branch('dev')?.parent_name, 'main');
  assert.equal(ctx.store.backups('branch_dev')[0].size_bytes, 1024);
  assert.equal(ctx.store.hasDatabase('branch_dev'), true);
  assert.equal(ctx.store.hasDatabase('postgres'), false);
});

test('SQLite accepts only admin configuration and rejects secrets or row payloads', t => {
  const { store } = fixture(t);
  assert.throws(() => store.updateSettings({ DB_PASSWORD: 'never-persist-this' } as never));
  assert.throws(() => store.updateSettings({ tables: [{ private: true }] } as never));
  assert.throws(() => store.updateSettings({ defaultRowLimit: 0 }));
  assert.deepEqual(store.settings(), { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' });
});

test('SQLite imports legacy inventory atomically, including children before parents', t => {
  const { store } = fixture(t);
  const base = { created_at: new Date().toISOString(), refreshed_at: null };
  store.importLegacy([
    { ...base, name: 'nested', database_name: 'branch_nested', parent_name: 'dev' },
    { ...base, name: 'dev', database_name: 'branch_dev', parent_name: 'main' },
  ], [{ id: 'legacy-backup', database_name: 'branch_dev', label: 'Legacy', size_bytes: 2048, created_at: base.created_at }]);
  assert.equal(store.importedLegacy(), true);
  assert.equal(store.branches().length, 3);
  assert.equal(store.backup('legacy-backup')?.size_bytes, 2048);
});

test('conflicting legacy metadata rolls back without replacing existing SQLite records', t => {
  const { store } = fixture(t);
  assert.throws(() => store.importLegacy([{
    name: 'main', database_name: 'wrong_database', parent_name: null,
    created_at: new Date().toISOString(), refreshed_at: null,
  }], []), /conflicts/);
  assert.equal(store.branch('main')?.database_name, config.DB_NAME);
  assert.equal(store.importedLegacy(), false);
});
