import type { Config } from '../config.js';
import { withDatabase } from '../db/socket.js';
import { Catalog } from './admin/catalog.service.js';
import { PostgresContainer } from './docker/postgres.js';
import { BranchService } from './branches/branches.service.js';
import { BackupService } from './backups/backups.service.js';
import { TableService } from './tables/tables.service.js';
import { SchemaService } from './visualizer/visualizer.service.js';
import { AuthService } from './auth/auth.service.js';

export function createServices(config: Config) {
  const catalog = new Catalog(config);
  const postgres = new PostgresContainer(config);
  const branches = new BranchService(catalog, postgres);
  const tables = new TableService(config);
  return {
    catalog, postgres, branches, tables, auth: new AuthService(config, catalog.store),
    backups: new BackupService(catalog, postgres, branches),
    schema: new SchemaService(tables),
    async health() {
      catalog.store.health();
      await postgres.docker.ready();
      await withDatabase(config, config.DB_NAME, client => client.query('SELECT 1'));
    },
    close() { catalog.store.close(); },
  };
}
export type Services = ReturnType<typeof createServices>;
