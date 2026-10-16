import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPolicySql, parsePolicySql } from '../components/policies/policy-sql'
import type { PolicyPayload } from '../components/policies/rls-types'

const base: PolicyPayload = {
  name: 'members_read', command: 'ALL', mode: 'PERMISSIVE', roles: ['public'],
  usingExpression: '(select current_user) = owner_role', checkExpression: 'tenant_id = 1',
}

test('SQL form round-trips commands, modes, roles and quoted names', () => {
  for (const command of ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) {
    for (const mode of ['PERMISSIVE', 'RESTRICTIVE'] as const) {
      const policy = { ...base, name: 'Name "quoted"', command, mode, roles: ['public', 'Role "custom"'],
        usingExpression: command === 'INSERT' ? null : base.usingExpression,
        checkExpression: command === 'SELECT' || command === 'DELETE' ? null : base.checkExpression }
      assert.deepEqual(parsePolicySql(buildPolicySql(policy, 'schema"x', 'table.y'), 'schema"x', 'table.y'), policy)
    }
  }
})

test('direct SQL supports nested predicates, comments and quoted literal brackets', () => {
  const sql = `-- comment
    CREATE POLICY filter ON public.users AS RESTRICTIVE FOR UPDATE TO public, "main"
    USING ((tenant_id = 1) AND text_col <> ')/*' AND other <> $tag$); DROP TABLE nope;$tag$)
    WITH CHECK (/* outer /* nested */ comment */ tenant_id = 1); -- done`
  const result = parsePolicySql(sql, 'public', 'users')
  assert.equal(result.mode, 'RESTRICTIVE')
  assert.equal(result.command, 'UPDATE')
  assert.deepEqual(result.roles, ['public', 'main'])
  assert.match(result.usingExpression!, /DROP TABLE nope/)
  assert.match(result.checkExpression!, /tenant_id = 1/)
  assert.equal(parsePolicySql(`CREATE POLICY p ON users USING (v=E'a\\')b')`, 'public', 'users').name, 'p')
})

test('Postgres optional clauses use correct defaults', () => {
  assert.deepEqual(parsePolicySql('create policy MixedCase on users;', 'public', 'users'), {
    name: 'mixedcase', command: 'ALL', mode: 'PERMISSIVE', roles: ['public'],
    usingExpression: null, checkExpression: null,
  })
})

test('SQL form rejects wrong targets, multiple statements, invalid clauses and incomplete input', () => {
  for (const sql of [
    'CREATE POLICY p ON other USING (true)',
    'CREATE POLICY p ON private.users USING (true)',
    'CREATE POLICY p ON users; DROP TABLE users',
    'DROP POLICY p ON users',
    'CREATE POLICY p ON users USING ()',
    'CREATE POLICY p ON users USING (/* empty */)',
    'CREATE POLICY p ON users USING ((true)',
    "CREATE POLICY p ON users USING (value='unclosed)",
    'CREATE POLICY p ON users USING (value=$tag$unclosed)',
    'CREATE POLICY p ON users /*unclosed',
    'CREATE POLICY p ON users FOR INSERT USING (true)',
    'CREATE POLICY p ON users FOR SELECT WITH CHECK (true)',
    'CREATE POLICY p ON users FOR DELETE WITH CHECK (true)',
    'CREATE POLICY p ON users AS something',
    'CREATE POLICY p ON users FOR DROP',
    'CREATE POLICY p ON users TO',
    'CREATE POLICY "" ON users',
    `CREATE POLICY "${'é'.repeat(32)}" ON users`,
  ]) assert.throws(() => parsePolicySql(sql, 'public', 'users'), Error, sql)
})
