import { randomUUID } from 'node:crypto';
import { HttpError } from '../../errors.js';
import { Catalog } from '../admin/catalog.service.js';
import { PostgresContainer } from '../docker/postgres.js';
import { BranchService } from '../branches/branches.service.js';
import type { Writable } from 'node:stream';

export class BackupService {
  constructor(readonly catalog: Catalog, readonly postgres: PostgresContainer, readonly branches: BranchService) {}
  async list(database?: string) {
    if (database) await this.catalog.assertDatabase(database);
    const records = this.catalog.store.backups(database);
    const files = await this.postgres.listDumps();
    return records.map(record => ({ ...record, available: files.has(record.id), actual_size_bytes: files.get(record.id) ?? null }));
  }
  async create(database: string, label: string) {
    return this.catalog.exclusive(async () => {
      await this.catalog.assertDatabase(database);
      const id = randomUUID();
      try {
        // pg_dump runs inside Postgres via Docker exec. The bind mount persists
        // this container path directly into the host's Backend/backups folder.
        const size = await this.postgres.dump(database, id);
        return this.catalog.store.addBackup(id, database, label, size);
      } catch (error) { await this.postgres.removeDump(id); throw error; }
    });
  }
  async restore(id: string, database: string) {
    return this.catalog.exclusive(async () => {
      await this.catalog.assertDatabase(database);
      if (!this.catalog.store.backup(id)) throw new HttpError(404, 'Backup not found');
      const result = await this.branches.replace(database, id);
      return { restored: true, database, backupId: id, ...result };
    });
  }
  async download(id: string, destination: Writable) {
    return this.catalog.exclusive(async () => {
      if (!this.catalog.store.backup(id)) throw new HttpError(404, 'Backup not found');
      if (!(await this.postgres.listDumps()).has(id)) throw new HttpError(404, 'Backup archive is missing');
      await this.postgres.exportSql(id, destination);
    });
  }
  async delete(id: string) {
    return this.catalog.exclusive(async () => {
      if (!this.catalog.store.backup(id)) throw new HttpError(404, 'Backup not found');
      // Remove the archive first: a filesystem failure must retain its metadata.
      await this.postgres.removeDump(id);
      this.catalog.store.deleteBackup(id);
      return { deleted: true, backupId: id };
    });
  }
}
