import { randomBytes } from 'node:crypto';
import type { Config } from '../../config.js';
import { quoteIdentifier as qi, withDatabase } from '../../db/socket.js';
import { HttpError } from '../../errors.js';
import type { Catalog } from '../admin/catalog.service.js';
import { CredentialStore } from './credential-store.js';
import { clientPassword } from './password.js';

const group = 'astarbase_client_roles';
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export class ClientRolesService {
  readonly credentials: CredentialStore;
  constructor(private config: Config, private catalog: Catalog, private run: typeof withDatabase = withDatabase) {
    this.credentials = new CredentialStore(config.ADMIN_DATA_DIR);
  }
  async initialize() {
    await this.catalog.exclusive(async () => {
      await this.run(this.config, 'postgres', async client => {
        // A pre-existing login/superuser with this reserved name must never be adopted.
        const existing = await client.query('SELECT rolcanlogin, rolsuper FROM pg_roles WHERE rolname=$1', [group]);
        if (!existing.rowCount) await client.query(`CREATE ROLE ${qi(group)} NOLOGIN`);
        else if (existing.rows[0].rolcanlogin || existing.rows[0].rolsuper) {
          throw new Error('Reserved client role group conflicts with an existing privileged role');
        }
        await client.query(`CREATE SCHEMA IF NOT EXISTS astarbase_pool_auth`);
        await client.query('REVOKE ALL ON SCHEMA astarbase_pool_auth FROM PUBLIC');
        await client.query(`CREATE OR REPLACE FUNCTION astarbase_pool_auth.lookup(username text)
          RETURNS TABLE(usename text, passwd text)
          LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
            SELECT rolname::text, rolpassword::text FROM pg_authid
            WHERE rolname = username AND rolcanlogin AND NOT rolsuper
              AND (rolvaliduntil IS NULL OR rolvaliduntil > now())
              AND pg_has_role(oid, '${group}', 'member')
          $$`);
        await client.query('REVOKE ALL ON FUNCTION astarbase_pool_auth.lookup(text) FROM PUBLIC');
      });
      for (const branch of await this.catalog.branches()) {
        await this.provision(branch.database_name, branch.parent_name ? branch.name : 'astarbase_main');
      }
    });
  }
  async provision(database: string, user: string) {
    let credential = await this.credentials.get(database);
    await this.run(this.config, 'postgres', async client => {
      const role = await client.query(`SELECT rolsuper, rolcreatedb, rolcreaterole,
        pg_has_role(oid, $2, 'member') AS managed FROM pg_roles WHERE rolname=$1`, [user, group]);
      if (role.rowCount && (!credential || credential.user !== user || !role.rows[0].managed ||
        role.rows[0].rolsuper || role.rows[0].rolcreatedb || role.rows[0].rolcreaterole)) {
        throw new HttpError(409, `Database login role ${user} is already in use; choose another branch name`);
      }
      if (!credential) {
        credential = { user, password: randomBytes(32).toString('base64url') };
        await this.credentials.set(database, credential);
      }
      if (!role.rowCount) await client.query(`CREATE ROLE ${qi(user)} LOGIN IN ROLE ${qi(group)}`);
      // Reapply the encrypted desired credential on startup, recovering interrupted rotations.
      await client.query(`ALTER ROLE ${qi(user)} PASSWORD ${literal(credential.password)}`);
      await client.query(`REVOKE CONNECT ON DATABASE ${qi(database)} FROM PUBLIC`);
      await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${qi(database)} TO ${qi(user)}`);
    });
    await this.grantAccess(database, user);
  }
  async grantAccess(database: string, user?: string) {
    user ??= (await this.get(database)).user;
    const role = qi(user);
    await this.run(this.config, database, async client => {
      await client.query(`GRANT CREATE ON DATABASE ${qi(database)} TO ${role}`);
      await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(this.config.DB_USER)} GRANT USAGE, CREATE ON SCHEMAS TO ${role}`);
      const schemas = await client.query<{ nspname: string }>(`SELECT nspname FROM pg_namespace
        WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'`);
      for (const { nspname } of schemas.rows) {
        const schema = qi(nspname);
        await client.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`);
        await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
        await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
        await client.query(`GRANT ALL ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${role}`);
        for (const kind of ['TABLES', 'SEQUENCES', 'FUNCTIONS']) {
          await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(this.config.DB_USER)}
            IN SCHEMA ${schema} GRANT ALL ON ${kind} TO ${role}`);
        }
      }
    });
  }
  async get(database: string) {
    await this.catalog.assertDatabase(database);
    const credential = await this.credentials.get(database);
    if (!credential) throw new HttpError(503, 'Database client credentials are not initialized; restart Studio after upgrading');
    return credential;
  }
  async reset(database: string, password: string) {
    if (!clientPassword.safeParse(password).success) {
      throw new HttpError(400, 'Use a password of 16–256 characters without control characters');
    }
    await this.catalog.assertDatabase(database);
    return this.catalog.exclusive(async () => {
      const previous = await this.get(database);
      const next = { user: previous.user, password };
      await this.credentials.set(database, next);
      try {
        await this.run(this.config, 'postgres', client =>
          client.query(`ALTER ROLE ${qi(next.user)} PASSWORD ${literal(next.password)}`));
      } catch {
        await this.credentials.set(database, previous);
        throw new HttpError(500, 'Could not rotate the database password');
      }
      return { user: next.user, rotated: true };
    });
  }
}
