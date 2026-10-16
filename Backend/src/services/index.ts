import type { Config } from '../config.js';
import { withDatabase } from '../db/socket.js';
import { Catalog } from './admin/catalog.service.js';
import { PostgresContainer } from './docker/postgres.js';
import { BranchService } from './branches/branches.service.js';
import { BackupService } from './backups/backups.service.js';
import { TableService } from './tables/tables.service.js';
import { SchemaService } from './visualizer/visualizer.service.js';
import { AuthService } from './auth/auth.service.js';
import { MetricsService } from './metrics/metrics.service.js';
import { ConnectionService } from './connection/connection.service.js';
import { ClientRolesService } from './connection/client-roles.service.js';
import { PoolerService } from './connection/pooler.service.js';

export function createServices(config: Config) {
  const catalog = new Catalog(config);
  const postgres = new PostgresContainer(config);
  const clientRoles = new ClientRolesService(config, catalog);
  const branches = new BranchService(catalog, postgres, clientRoles);
  const tables = new TableService(config);
  const metrics = new MetricsService(config, catalog, postgres);
  return {
    catalog, postgres, branches, tables, metrics, clientRoles,
    connection: new ConnectionService(config, catalog, clientRoles),
    pooler: new PoolerService(config, catalog, postgres.docker),
    auth: new AuthService(config, catalog.store),
    backups: new BackupService(catalog, postgres, branches),
    schema: new SchemaService(tables),
    async health() {
      catalog.store.health();
      await postgres.docker.ready();
      await withDatabase(config, config.DB_NAME, client => client.query('SELECT 1'));
    },
    close() { metrics.stop(); catalog.store.close(); },
  };
}
export type Services = ReturnType<typeof createServices>;
