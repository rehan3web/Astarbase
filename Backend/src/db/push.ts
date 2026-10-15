import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from '../config.js';
import { AdminStore, type Branch, type Backup } from './admin-store.js';
import { withDatabase } from './socket.js';

export async function pushDatabase(config: Config, existingStore?: AdminStore): Promise<void> {
  const store = existingStore ?? new AdminStore(config);
  try {
    await withDatabase(config, 'postgres', async client => {
      await client.query('SELECT pg_advisory_lock(71823001)');
      try {
        if (!(await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.DB_NAME])).rowCount) {
          throw new Error('Project database is missing; start Compose first');
        }
        if (store.importedLegacy()) return;
        const legacy = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [config.LEGACY_CONTROL_DB]);
        let branches: Branch[] = [];
        let backups: Backup[] = [];
        if (legacy.rowCount) {
          await withDatabase(config, config.LEGACY_CONTROL_DB, async old => {
            await old.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            try {
              const tables = await old.query("SELECT to_regclass('public.branches') AS branches, to_regclass('public.backups') AS backups");
              if (tables.rows[0].branches) {
                branches = (await old.query('SELECT name,database_name,parent_name,created_at::text,refreshed_at::text FROM public.branches')).rows;
              }
              if (tables.rows[0].backups) {
                backups = (await old.query('SELECT id::text,database_name,label,size_bytes,created_at::text FROM public.backups')).rows;
              }
              await old.query('COMMIT');
            } catch (error) { await old.query('ROLLBACK'); throw error; }
          });
        }
        store.importLegacy(branches, backups);
        // Legacy databases and archives are never deleted by migration.
      } finally { await client.query('SELECT pg_advisory_unlock(71823001)'); }
    });
  } finally { if (!existingStore) store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  pushDatabase(loadConfig()).then(() => console.log('Admin SQLite initialized; project database checked over Unix socket'))
    .catch(() => { console.error('DB push failed. Check configuration and the shared Postgres socket.'); process.exitCode = 1; });
}
