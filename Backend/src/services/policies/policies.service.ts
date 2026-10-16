import type pg from 'pg';
import type { Config } from '../../config.js';
import { withDatabase, quoteIdentifier as qi } from '../../db/socket.js';
import { HttpError } from '../../errors.js';
import type { Catalog } from '../admin/catalog.service.js';

export type Policy = {
  name: string; command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  mode: 'PERMISSIVE' | 'RESTRICTIVE'; roles: string[];
  usingExpression: string | null; checkExpression: string | null;
};

export class PoliciesService {
  constructor(private config: Config, private catalog: Catalog) {}

  async list(database: string) {
    await this.catalog.assertDatabase(database);
    return withDatabase(this.config, database, async client => {
      const tables = await client.query(`SELECT n.nspname AS schema,c.relname AS name,
        c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg\\_%'
          AND n.nspname NOT IN ('information_schema','astarbase_pool_auth')
        ORDER BY n.nspname,c.relname`);
      const policies = await client.query(`SELECT schemaname,tablename,policyname AS name,
        cmd AS command,permissive AS mode,roles::text[] AS roles,qual AS "usingExpression",
        with_check AS "checkExpression" FROM pg_policies ORDER BY policyname`);
      const roles = await client.query(`SELECT rolname AS name,rolsuper AS superuser,
        rolbypassrls AS "bypassRls",rolcanlogin AS login FROM pg_roles ORDER BY rolname`);
      return { database, tables: tables.rows.map(table => ({ ...table,
        policies: policies.rows.filter(policy => policy.schemaname === table.schema && policy.tablename === table.name)
          .map(({ schemaname: _schema, tablename: _table, ...policy }) => policy),
      })), roles: roles.rows };
    });
  }

  private async transaction<T>(database: string, schema: string, table: string, operation: (client: pg.Client, target: string) => Promise<T>) {
    await this.catalog.assertDatabase(database);
    if (schema === 'information_schema' || schema.startsWith('pg_') || schema === 'astarbase_pool_auth') {
      throw new HttpError(400, 'System schemas cannot be managed here');
    }
    const target = `${qi(schema)}.${qi(table)}`;
    return withDatabase(this.config, database, async client => {
      await client.query('BEGIN');
      try {
        const relation = await client.query(`SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relname=$2 AND c.relkind IN ('r','p')`, [schema, table]);
        if (!relation.rowCount) throw new HttpError(404, 'Table not found');
        await client.query(`LOCK TABLE ${target} IN ACCESS EXCLUSIVE MODE`);
        const result = await operation(client, target);
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    });
  }

  async state(database: string, schema: string, table: string, state: { enabled?: boolean; forced?: boolean }) {
    return this.transaction(database, schema, table, async (client, target) => {
      if (state.enabled !== undefined) await client.query(`ALTER TABLE ${target} ${state.enabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY`);
      if (state.forced !== undefined) await client.query(`ALTER TABLE ${target} ${state.forced ? 'FORCE' : 'NO FORCE'} ROW LEVEL SECURITY`);
      return { updated: true };
    });
  }

  private async assertPolicy(client: pg.Client, schema: string, table: string, name: string) {
    const result = await client.query('SELECT 1 FROM pg_policies WHERE schemaname=$1 AND tablename=$2 AND policyname=$3', [schema, table, name]);
    if (!result.rowCount) throw new HttpError(404, 'Policy not found');
  }

  async save(database: string, schema: string, table: string, policy: Policy, previousName?: string) {
    return this.transaction(database, schema, table, async (client, target) => {
      // Command/mode changes require recreation. Both steps are atomic, so an
      // invalid edit never loses the original policy or opens an access window.
      if (previousName !== undefined) {
        await this.assertPolicy(client, schema, table, previousName);
        await client.query(`DROP POLICY ${qi(previousName)} ON ${target}`);
      }
      const roles = [...new Set(policy.roles)].map(role => role.toLowerCase() === 'public' ? 'PUBLIC' : qi(role)).join(', ');
      let text = `CREATE POLICY ${qi(policy.name)} ON ${target} AS ${policy.mode} FOR ${policy.command} TO ${roles}`;
      if (policy.usingExpression !== null) text += ` USING (${policy.usingExpression})`;
      if (policy.checkExpression !== null) text += ` WITH CHECK (${policy.checkExpression})`;
      // Extended protocol enforces exactly one SQL statement even though the
      // authorized administrator supplies raw PostgreSQL predicate expressions.
      const statement = { text, queryMode: 'extended' };
      await client.query(statement);
      return { saved: true };
    });
  }

  async remove(database: string, schema: string, table: string, name: string) {
    return this.transaction(database, schema, table, async (client, target) => {
      await this.assertPolicy(client, schema, table, name);
      await client.query(`DROP POLICY ${qi(name)} ON ${target}`);
      return { deleted: true };
    });
  }
}
