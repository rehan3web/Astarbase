import type { Config } from '../../config.js';
import { AdminStore, type Branch } from '../../db/admin-store.js';
import { withDatabase } from '../../db/socket.js';
import { HttpError } from '../../errors.js';

export class Catalog {
  constructor(readonly config: Config, readonly store = new AdminStore(config)) {}
  async branches(): Promise<Branch[]> { return this.store.branches(); }
  async branch(name: string): Promise<Branch> {
    const branch = this.store.branch(name);
    if (!branch) throw new HttpError(404, 'Branch not found');
    return branch;
  }
  async assertDatabase(database: string): Promise<void> {
    if (!this.store.hasDatabase(database)) throw new HttpError(404, 'Managed database not found');
  }
  // Keep a cross-process job lock on the existing system database. SQLite writes
  // are short transactions; never hold a SQLite write lock throughout pg_dump.
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return withDatabase(this.config, 'postgres', async client => {
      await client.query('SELECT pg_advisory_lock(71823003)');
      try { return await fn(); } finally { await client.query('SELECT pg_advisory_unlock(71823003)'); }
    });
  }
}
