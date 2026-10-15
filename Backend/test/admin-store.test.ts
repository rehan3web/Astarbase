import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AdminStore } from '../src/db/admin-store.js';
import { config } from './helpers.js';
import { DatabaseSync } from 'node:sqlite';
import { BranchService } from '../src/services/branches/branches.service.js';
import { Catalog } from '../src/services/admin/catalog.service.js';
import type { PostgresContainer } from '../src/services/docker/postgres.js';

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

test('branch tags are validated SQLite metadata, editable without Docker or Postgres, and survive restart', t => {
  const ctx = fixture(t);
  assert.equal(ctx.store.branch('main')?.tag, 'production');
  ctx.store.addBranch('dev', 'branch_dev', 'main', '  staging  ');
  assert.equal(ctx.store.branch('dev')?.tag, 'staging');
  const original = ctx.store.branch('dev')!;
  const branches = new BranchService(new Catalog(ctx.options, ctx.store), {} as PostgresContainer);
  assert.equal(branches.updateTag('dev', 'release/v1').tag, 'release/v1');
  assert.deepEqual(ctx.store.branch('dev'), { ...original, tag: 'release/v1' });
  assert.throws(() => branches.updateTag('missing', 'dev'), /Branch not found/);
  for (const tag of ['', ' ', 'a'.repeat(33), 'bad\nvalue', '<script>', 'bad; DROP TABLE branches']) {
    assert.throws(() => branches.updateTag('dev', tag));
  }
  assert.equal(ctx.store.branch('dev')?.tag, 'release/v1');
  assert.equal(branches.updateTag('main', 'Live production').tag, 'Live production');
  assert.equal(branches.updateTag('dev', null).tag, null);
  ctx.store.close();
  ctx.store = new AdminStore(ctx.options);
  assert.equal(ctx.store.branch('main')?.tag, 'Live production');
  assert.equal(ctx.store.branch('dev')?.tag, null);
  assert.equal(ctx.store.branches().find(branch => branch.name === 'dev')?.tag, null);
});

test('existing SQLite inventory upgrades tags in-place and preserves data and later tag edits', t => {
  const ctx = fixture(t);
  ctx.store.addBranch('dev', 'branch_dev', 'main');
  ctx.store.updateSettings({ projectName: 'Preserve project' });
  ctx.store.addBackup('existing-backup', 'branch_dev', 'Keep backup', 1024);
  const original = ctx.store.branch('dev')!;
  ctx.store.close();
  // Recreate the previous schema in this isolated test file, not a live volume.
  const legacy = new DatabaseSync(ctx.store.file);
  legacy.exec('ALTER TABLE branches DROP COLUMN tag');
  legacy.close();
  ctx.store = new AdminStore(ctx.options);
  assert.equal(ctx.store.branch('main')?.tag, 'production');
  assert.deepEqual(ctx.store.branch('dev'), { ...original, tag: 'dev' });
  assert.equal(ctx.store.settings().projectName, 'Preserve project');
  assert.equal(ctx.store.backup('existing-backup')?.label, 'Keep backup');
  ctx.store.updateBranchTag('main', null);
  ctx.store.updateBranchTag('dev', 'QA');
  ctx.store.close();
  ctx.store = new AdminStore(ctx.options);
  assert.equal(ctx.store.branch('main')?.tag, null);
  assert.equal(ctx.store.branch('dev')?.tag, 'QA');
  assert.equal(ctx.store.branches().length, 2);
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
