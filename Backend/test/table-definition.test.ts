import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readableTableDefinition } from '../src/services/tables/table-definition.js';
import { PostgresContainer } from '../src/services/docker/postgres.js';
import type { Config } from '../src/config.js';
import type { DockerService } from '../src/services/docker/docker.js';

test('definition removes only leading boilerplate and preserves actual SQL', () => {
  const ddl = "CREATE TABLE public.users(note text DEFAULT '-- keep');\nCOMMENT ON TABLE public.users IS 'one\n-- literal comment line\ntwo';";
  assert.equal(readableTableDefinition(`-- PostgreSQL dump\n\nSET statement_timeout = 0;\nSELECT pg_catalog.set_config('search_path', '', false);\n${ddl}\n`), ddl);
});
test('definition keeps meaningful storage settings and rejects empty dumps', () => {
  const ddl = "SET default_tablespace = 'custom';\nSET default_table_access_method = heap;\nCREATE TABLE public.users(id integer);";
  assert.equal(readableTableDefinition(`-- header\n${ddl}`), ddl);
  assert.throws(() => readableTableDefinition('-- only header\n'), /empty table definition/);
});
test('table dump uses one literally quoted schema/table pattern and strict matching', async () => {
  let args: string[] = [];
  const docker = {
    exec: async (command: string[]) => {
      args = command;
      return { stdout: 'CREATE TABLE public.users(id integer);\n', stderr: '' };
    },
  } as unknown as DockerService;
  const postgres = new PostgresContainer({ PG_SOCKET_DIR: '/tmp/test', DB_USER: 'test_admin' } as Config, docker);
  await postgres.tableDefinition('db', 'schema."*', 'table?*');
  assert.ok(args.includes('--schema-only'));
  assert.ok(args.includes('--strict-names'));
  assert.equal(args[args.indexOf('--table') + 1], '"schema.""*"."table?*"');
  assert.equal(args[args.indexOf('--dbname') + 1], 'db');
});
