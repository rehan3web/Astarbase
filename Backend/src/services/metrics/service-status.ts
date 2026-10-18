import type { Config } from '../../config.js';
import { withDatabase } from '../../db/socket.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { PoolerService } from '../connection/pooler.service.js';

type Probes = {
  database: (database: string) => Promise<boolean>;
  pooler: () => Promise<void>;
};

export class ServiceStatusService {
  private probes: Probes;

  constructor(config: Config, private catalog: Catalog, pooler: PoolerService, probes?: Partial<Probes>) {
    this.probes = {
      database: database => withDatabase(config, database, async client => {
        const result = await client.query<{ active: boolean }>(`
          SELECT EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind IN ('r', 'p') AND c.relrowsecurity
              AND n.nspname <> 'information_schema'
              AND n.nspname !~ '^pg_'
          ) AS active
        `);
        return result.rows[0].active;
      }),
      pooler: () => pooler.checkHealth(),
      ...probes,
    };
  }

  async read(database: string) {
    await this.catalog.assertDatabase(database);
    const [postgres, pgbouncer] = await Promise.allSettled([
      this.probes.database(database), this.probes.pooler(),
    ]);
    return {
      database,
      checkedAt: new Date().toISOString(),
      postgres: postgres.status === 'fulfilled'
        ? { active: true, error: null }
        : { active: false, error: 'PostgreSQL did not respond to the selected database health check over its Unix socket' },
      rls: postgres.status === 'fulfilled'
        ? { active: postgres.value, error: null }
        : { active: null, error: 'Could not read row-level security settings for the selected database' },
      pgbouncer: pgbouncer.status === 'fulfilled'
        ? { active: true, error: null }
        : { active: false, error: 'PgBouncer did not respond to its admin health check over its Unix socket' },
    };
  }
}
