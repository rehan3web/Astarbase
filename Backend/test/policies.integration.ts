import assert from 'node:assert/strict';
import pg from 'pg';
import type { Config } from '../src/config.js';
import { withDatabase, quoteIdentifier as qi } from '../src/db/socket.js';
import type { Catalog } from '../src/services/admin/catalog.service.js';
import type { ClientRolesService } from '../src/services/connection/client-roles.service.js';
import { PoliciesService, type Policy } from '../src/services/policies/policies.service.js';

export async function verifyPolicies(config: Config, catalog: Catalog, roles: ClientRolesService) {
  const service = new PoliciesService(config, catalog);
  const databases = [config.DB_NAME, 'branch_dev', 'branch_nested'];
  const queryAsClient = async (database: string, sql: string) => {
    const client = new pg.Client({ host: config.PG_SOCKET_DIR, database, ...await roles.get(database) });
    try { await client.connect(); return await client.query(sql); }
    finally { await client.end(); }
  };
  for (const database of databases) {
    await withDatabase(config, database, c => c.query(`CREATE TABLE public.rls_rows(id int PRIMARY KEY, tenant_id int NOT NULL, value text);
      INSERT INTO public.rls_rows VALUES(1,1,'one'),(2,2,'two')`));
  }
  for (const database of databases) {
    const role = (await roles.get(database)).user;
    const find = async () => (await service.list(database)).tables.find(table => table.name === 'rls_rows')!;
    assert.equal((await find()).enabled, false);
    assert.equal((await find()).policies.length, 0);
    await service.state(database, 'public', 'rls_rows', { enabled: true });
    assert.equal((await queryAsClient(database, 'SELECT * FROM rls_rows')).rowCount, 0, 'enabled without policies must default-deny');
    assert.equal((await withDatabase(config, database, c => c.query('SELECT * FROM rls_rows'))).rowCount, 2, 'internal admin bypasses RLS');
    const read: Policy = { name: 'read all', command: 'SELECT', mode: 'PERMISSIVE', roles: ['public'], usingExpression: 'true', checkExpression: null };
    await service.save(database, 'public', 'rls_rows', read);
    assert.equal((await queryAsClient(database, 'SELECT * FROM rls_rows')).rowCount, 2);
    const restrict: Policy = { ...read, name: 'tenant limit', mode: 'RESTRICTIVE', roles: [role], usingExpression: 'tenant_id=1' };
    await service.save(database, 'public', 'rls_rows', restrict);
    assert.deepEqual((await queryAsClient(database, 'SELECT id FROM rls_rows')).rows, [{ id: 1 }]);
    await service.remove(database, 'public', 'rls_rows', restrict.name);
    const all: Policy = { ...read, name: 'own "tenant"', command: 'ALL', roles: [role], usingExpression: 'tenant_id=1', checkExpression: 'tenant_id=1' };
    await service.save(database, 'public', 'rls_rows', all, read.name);
    assert.equal((await find()).policies[0].name, all.name);
    assert.equal((await find()).policies[0].command, 'ALL');
    await assert.rejects(queryAsClient(database, `INSERT INTO rls_rows VALUES(3,2,'blocked')`), /row-level security policy/);
    await queryAsClient(database, `INSERT INTO rls_rows VALUES(3,1,'allowed')`);
    await assert.rejects(queryAsClient(database, 'UPDATE rls_rows SET tenant_id=2 WHERE id=3'), /row-level security policy/);
    assert.equal((await queryAsClient(database, 'DELETE FROM rls_rows WHERE id=2')).rowCount, 0);
    assert.equal((await queryAsClient(database, 'DELETE FROM rls_rows WHERE id=3')).rowCount, 1);
    await assert.rejects(service.save(database, 'public', 'rls_rows', { ...all, name: 'broken', usingExpression: 'missing_column=1' }, all.name), /does not exist/);
    await assert.rejects(service.save(database, 'public', 'rls_rows', { ...all, roles: ['missing_rls_role'] }, all.name), /does not exist/);
    await assert.rejects(service.save(database, 'public', 'rls_rows', { ...all, usingExpression: 'true); DROP TABLE public.rls_rows; --' }, all.name), /multiple commands|syntax error/);
    assert.equal((await find()).policies[0].name, all.name, 'failed edit must preserve the old policy');
    await assert.rejects(service.save(database, 'public', 'rls_rows', all), /already exists/);
    assert.equal((await find()).policies.length, 1);
    await withDatabase(config, database, c => c.query(`ALTER TABLE rls_rows OWNER TO ${qi(role)}`));
    assert.equal((await queryAsClient(database, 'SELECT * FROM rls_rows')).rowCount, 2, 'owners bypass without FORCE');
    await service.state(database, 'public', 'rls_rows', { forced: true });
    assert.equal((await find()).enabled, true, 'partial force change must not reset enabled');
    assert.equal((await queryAsClient(database, 'SELECT * FROM rls_rows')).rowCount, 1, 'FORCE applies to non-superuser table owner');
    await service.state(database, 'public', 'rls_rows', { enabled: false });
    assert.equal((await find()).forced, true, 'partial disable must not reset force');
    assert.equal((await queryAsClient(database, 'SELECT * FROM rls_rows')).rowCount, 2);
    await service.remove(database, 'public', 'rls_rows', all.name);
    assert.equal((await find()).policies.length, 0);
    await assert.rejects(service.remove(database, 'public', 'rls_rows', all.name), /Policy not found/);
    await assert.rejects(service.state(database, 'public', 'missing_table', { enabled: true }), /Table not found/);
    await assert.rejects(service.state(database, 'pg_catalog', 'pg_class', { enabled: true }), /System schemas/);
  }
  // Identical table/policy names in a different branch remain independent.
  const final: Policy = { name: 'main_only', command: 'INSERT', mode: 'RESTRICTIVE', roles: ['public'], usingExpression: null, checkExpression: 'tenant_id=1' };
  await service.save(config.DB_NAME, 'public', 'rls_rows', final);
  for (const database of databases.slice(1)) {
    assert.equal((await service.list(database)).tables.find(table => table.name === 'rls_rows')!.policies.length, 0);
  }
  await assert.rejects(service.list('postgres'), /Managed database not found/);
}
