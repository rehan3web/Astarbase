import type { Config } from '../../config.js';
import type { Catalog } from '../admin/catalog.service.js';
import type { ClientRolesService } from './client-roles.service.js';

/** Public client metadata only. Admin database operations remain Unix-socket-only. */
export class ConnectionService {
  constructor(private config: Config, private catalog: Catalog, private roles: ClientRolesService) {}
  async metadata(database: string) {
    await this.catalog.assertDatabase(database);
    return {
      database, user: (await this.roles.get(database)).user,
      host: this.config.DATABASE_PUBLIC_HOST || null,
      directPort: this.config.POSTGRES_PUBLIC_PORT,
      poolerPort: this.config.PGBOUNCER_PUBLIC_PORT,
      sslMode: 'disable' as const,
    };
  }
  async reveal(database: string) {
    await this.catalog.assertDatabase(database);
    return { password: (await this.roles.get(database)).password };
  }
}
