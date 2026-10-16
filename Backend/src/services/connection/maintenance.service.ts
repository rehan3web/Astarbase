import type { Config } from '../../config.js';
import { withDatabase } from '../../db/socket.js';
import { HttpError } from '../../errors.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { BranchService } from '../branches/branches.service.js';
import type { PoolerService } from './pooler.service.js';

export class DatabaseMaintenanceService {
  constructor(private config: Config, private catalog: Catalog, private branches: BranchService,
    private pooler: Pick<PoolerService, 'withDisconnected'>, private run: typeof withDatabase = withDatabase) {}

  async reset(database: string) {
    await this.catalog.assertDatabase(database);
    return this.catalog.exclusive(() => this.pooler.withDisconnected(database, async () => {
      // Reuse the atomic staging/swap path. No branch, backup or credential metadata is deleted.
      const result = await this.branches.replace(database, null);
      return { reset: true, database, ...result };
    }));
  }

  async terminate(database: string) {
    await this.catalog.assertDatabase(database);
    return this.catalog.exclusive(() => this.pooler.withDisconnected(database, async () => {
      const result = await this.run(this.config, 'postgres', client => client.query<{ terminated: boolean }>(
        `SELECT pg_terminate_backend(pid, 5000) AS terminated FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()
           AND backend_type = 'client backend' AND client_addr IS NOT NULL`, [database]));
      // NULL client_addr identifies Unix sockets. Never terminate direct Unix admin
      // connections, background workers, or clients belonging to another database.
      if (result.rows.some(row => !row.terminated)) {
        throw new HttpError(409, 'Some direct connections could not be terminated. Pooled clients were disconnected; retry after checking Postgres.');
      }
      return { terminated: true, database, directConnections: result.rows.length, unixAdminPreserved: true };
    }));
  }
}
