import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.js';

export type Branch = {
  name: string; database_name: string; parent_name: string | null;
  created_at: string; refreshed_at: string | null;
};
export type Backup = {
  id: string; database_name: string; label: string; size_bytes: number; created_at: string;
};
export const settingsSchema = z.object({
  projectName: z.string().trim().min(1).max(100),
  defaultRowLimit: z.number().int().min(1).max(1000),
  theme: z.enum(['system', 'light', 'dark']),
}).strict();
export type AdminSettings = z.infer<typeof settingsSchema>;
const defaults: AdminSettings = { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' };

// SQLite contains admin settings and inventory only. Application rows and
// schemas stay in Postgres; pg_dump archives stay in Backend/backups.
export class AdminStore {
  readonly file: string;
  private db: DatabaseSync;

  constructor(config: Config) {
    mkdirSync(config.ADMIN_DATA_DIR, { recursive: true, mode: 0o700 });
    this.file = path.join(config.ADMIN_DATA_DIR, 'admin.sqlite');
    this.db = new DatabaseSync(this.file);
    chmodSync(this.file, 0o600);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS branches (
        name TEXT PRIMARY KEY, database_name TEXT NOT NULL UNIQUE,
        parent_name TEXT REFERENCES branches(name) ON DELETE RESTRICT,
        created_at TEXT NOT NULL, refreshed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY, database_name TEXT NOT NULL,
        label TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS backups_database_idx ON backups(database_name);
      CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admin_migrations (name TEXT PRIMARY KEY);
    `);
    const main = this.db.prepare('SELECT database_name FROM branches WHERE name = ?').get('main');
    if (main && main.database_name !== config.DB_NAME) {
      this.db.close();
      throw new Error('DB_NAME differs from the initialized main database');
    }
    this.db.prepare('INSERT OR IGNORE INTO branches(name,database_name,parent_name,created_at) VALUES(?,?,NULL,?)')
      .run('main', config.DB_NAME, new Date().toISOString());
  }

  close() { this.db.close(); }
  health() { this.db.prepare('SELECT 1').get(); }
  branches(): Branch[] {
    return this.db.prepare('SELECT * FROM branches ORDER BY created_at,name').all().map(row => ({ ...row }) as Branch);
  }
  branch(name: string): Branch | undefined {
    const row = this.db.prepare('SELECT * FROM branches WHERE name = ?').get(name);
    return row ? { ...row } as Branch : undefined;
  }
  hasDatabase(database: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM branches WHERE database_name = ?').get(database));
  }
  addBranch(name: string, database: string, parent: string) {
    this.db.prepare('INSERT INTO branches(name,database_name,parent_name,created_at) VALUES(?,?,?,?)')
      .run(name, database, parent, new Date().toISOString());
  }
  markRefreshed(name: string) {
    this.db.prepare('UPDATE branches SET refreshed_at = ? WHERE name = ?').run(new Date().toISOString(), name);
  }
  backups(database?: string): Backup[] {
    return this.db.prepare('SELECT * FROM backups WHERE (? IS NULL OR database_name = ?) ORDER BY created_at DESC')
      .all(database ?? null, database ?? null).map(row => ({ ...row }) as Backup);
  }
  backup(id: string): Backup | undefined {
    const row = this.db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
    return row ? { ...row } as Backup : undefined;
  }
  addBackup(id: string, database: string, label: string, size: number): Backup {
    this.db.prepare('INSERT INTO backups(id,database_name,label,size_bytes,created_at) VALUES(?,?,?,?,?)')
      .run(id, database, label, size, new Date().toISOString());
    return this.backup(id)!;
  }
  settings(): AdminSettings {
    const rows = this.db.prepare('SELECT key,value FROM admin_settings').all();
    return settingsSchema.parse({ ...defaults, ...Object.fromEntries(rows.map(row => [row.key, JSON.parse(String(row.value))])) });
  }
  updateSettings(changes: Partial<AdminSettings>): AdminSettings {
    // Strict allowlist keeps passwords, tokens, arbitrary SQL and dumps out of SQLite.
    settingsSchema.partial().parse(changes);
    this.transaction(() => {
      const stmt = this.db.prepare('INSERT INTO admin_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
      for (const [key, value] of Object.entries(changes)) stmt.run(key, JSON.stringify(value));
    });
    return this.settings();
  }
  importedLegacy(): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM admin_migrations WHERE name = ?').get('legacy-postgres-catalog'));
  }
  importLegacy(branches: Branch[], backups: Backup[]) {
    this.transaction(() => {
      // Parent rows may arrive after children in an existing catalog.
      this.db.exec('PRAGMA defer_foreign_keys = ON');
      for (const row of branches) {
        const current = this.branch(row.name);
        if (current && (current.database_name !== row.database_name || current.parent_name !== row.parent_name)) {
          throw new Error('Legacy branch metadata conflicts with SQLite; no data was replaced');
        }
        this.db.prepare('INSERT OR IGNORE INTO branches VALUES(?,?,?,?,?)')
          .run(row.name, row.database_name, row.parent_name, row.created_at, row.refreshed_at);
      }
      for (const row of backups) {
        this.db.prepare('INSERT OR IGNORE INTO backups VALUES(?,?,?,?,?)')
          .run(row.id, row.database_name, row.label, Number(row.size_bytes), row.created_at);
      }
      this.db.prepare('INSERT OR IGNORE INTO admin_migrations(name) VALUES(?)').run('legacy-postgres-catalog');
    });
  }
  private transaction(fn: () => void) {
    this.db.exec('BEGIN IMMEDIATE');
    try { fn(); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
