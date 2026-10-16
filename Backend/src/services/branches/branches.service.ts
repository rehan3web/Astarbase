import { randomUUID } from 'node:crypto';
import { branchTagSchema } from '../../db/admin-store.js';
import { quoteIdentifier, withDatabase } from '../../db/socket.js';
import { HttpError } from '../../errors.js';
import { Catalog } from '../admin/catalog.service.js';
import { PostgresContainer } from '../docker/postgres.js';
import type { ClientRolesService } from '../connection/client-roles.service.js';

export class BranchService {
  constructor(readonly catalog: Catalog, readonly postgres: PostgresContainer, readonly roles?: ClientRolesService) {}
  async list() {
    const branches = await this.catalog.branches();
    const sizes = await this.admin(client => client.query<{ datname: string; storage_bytes: string }>(
      'SELECT datname, pg_database_size(oid)::text AS storage_bytes FROM pg_database WHERE datname = ANY($1::text[])',
      [branches.map(branch => branch.database_name)],
    ));
    const byDatabase = new Map(sizes.rows.map(row => [row.datname, Number(row.storage_bytes)]));
    return branches.map(branch => ({ ...branch, storage_bytes: byDatabase.get(branch.database_name) ?? null }));
  }
  private admin<T>(fn: Parameters<typeof withDatabase<T>>[2]) {
    return withDatabase(this.catalog.config, 'postgres', fn);
  }
  async createDatabase(database: string) {
    await this.admin(client => client.query(`CREATE DATABASE ${quoteIdentifier(database)} TEMPLATE template0`));
  }
  async dropDatabase(database: string) {
    await this.admin(client => client.query(`DROP DATABASE ${quoteIdentifier(database)} WITH (FORCE)`));
  }
  updateTag(name: string, tag: string | null) {
    const branch = this.catalog.store.updateBranchTag(name, tag);
    if (!branch) throw new HttpError(404, 'Branch not found');
    return branch;
  }
  async create(name: string, parentName = 'main', tag: string | null = 'dev') {
    const normalizedTag = branchTagSchema.parse(tag);
    return this.catalog.exclusive(async () => {
      if ((await this.catalog.branches()).some(branch => branch.name === name)) throw new HttpError(409, 'Branch already exists');
      const parent = await this.catalog.branch(parentName);
      const database = `branch_${name}`;
      const id = randomUUID();
      let created = false;
      try {
        await this.postgres.dump(parent.database_name, id);
        await this.createDatabase(database);
        created = true;
        await this.postgres.restore(database, id);
        if (this.roles) await this.roles.provision(database, name);
        this.catalog.store.addBranch(name, database, parentName, normalizedTag);
        return await this.catalog.branch(name);
      } catch (error) {
        if (created) await this.dropDatabase(database);
        throw error;
      } finally { await this.postgres.removeDump(id); }
    });
  }
  // Populate staging first; failed restores leave the original untouched.
  async replace(database: string, dumpId: string) {
    const suffix = randomUUID().replaceAll('-', '');
    const staging = `studio_stage_${suffix}`;
    const old = `studio_old_${suffix}`;
    await this.createDatabase(staging);
    let swapped = false;
    try {
      await this.postgres.restore(staging, dumpId);
      if (this.roles) {
        const credential = await this.roles.get(database);
        await this.admin(async client => {
          await client.query(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(staging)} FROM PUBLIC`);
          await client.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${quoteIdentifier(staging)} TO ${quoteIdentifier(credential.user)}`);
        });
        await this.roles.grantAccess(staging, credential.user);
      }
      await this.admin(async client => {
        await client.query(`ALTER DATABASE ${quoteIdentifier(database)} ALLOW_CONNECTIONS false`);
        try {
          await client.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [database]);
          await client.query('BEGIN');
          await client.query(`ALTER DATABASE ${quoteIdentifier(database)} RENAME TO ${quoteIdentifier(old)}`);
          await client.query(`ALTER DATABASE ${quoteIdentifier(staging)} RENAME TO ${quoteIdentifier(database)}`);
          await client.query('COMMIT');
          swapped = true;
        } catch (error) {
          await client.query('ROLLBACK');
          await client.query(`ALTER DATABASE ${quoteIdentifier(database)} ALLOW_CONNECTIONS true`);
          throw error;
        }
      });
    } finally { if (!swapped) await this.dropDatabase(staging); }
    try { await this.dropDatabase(old); return { cleanupWarning: null }; }
    catch { return { cleanupWarning: `Replaced successfully; remove recovery database ${old} manually` }; }
  }
  async refresh(name: string) {
    return this.catalog.exclusive(async () => {
      const branch = await this.catalog.branch(name);
      if (!branch.parent_name) throw new HttpError(400, 'Main has no parent and cannot be refreshed');
      const parent = await this.catalog.branch(branch.parent_name);
      const id = randomUUID();
      try {
        await this.postgres.dump(parent.database_name, id);
        const result = await this.replace(branch.database_name, id);
        this.catalog.store.markRefreshed(name);
        return { branch: await this.catalog.branch(name), ...result };
      } finally { await this.postgres.removeDump(id); }
    });
  }
}
