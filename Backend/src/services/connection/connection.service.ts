import type { Config } from '../../config.js';
import type { Catalog } from '../admin/catalog.service.js';

/** Public client metadata only. Admin database operations remain Unix-socket-only. */
export class ConnectionService {
  constructor(private config: Config, private catalog: Catalog) {}
  async metadata(database: string) {
    await this.catalog.assertDatabase(database);
    return {
      database, user: this.config.DB_USER,
      host: this.config.DATABASE_PUBLIC_HOST || null,
      directPort: this.config.POSTGRES_PUBLIC_PORT,
      poolerPort: this.config.PGBOUNCER_PUBLIC_PORT,
      sslMode: 'disable' as const,
    };
  }
  async reveal(database: string) {
    await this.catalog.assertDatabase(database);
    return { password: this.config.DB_PASSWORD };
  }
}
