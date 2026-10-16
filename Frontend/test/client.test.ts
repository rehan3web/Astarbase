import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseSqlOutput, parseSqlExecutionOutput } from '../lib/sql-results'
import { issueSession, verifySession } from '../lib/server/session'
import { qi, literal } from '../lib/api'
import { liveTable, createTableSql } from '../lib/live-tables'

test('SQL CSV parser handles quotes, multiline values, NULL, and empty strings', () => {
  assert.deepEqual(parseSqlOutput('id,text,nothing,empty\n1,"a,b\n""quoted""",,""\n'), {
    columns: ['id', 'text', 'nothing', 'empty'],
    rows: [{ id: '1', text: 'a,b\n"quoted"', nothing: null, empty: '' }],
  })
  assert.deepEqual(parseSqlOutput('CREATE TABLE\nINSERT 0 1\n'), { columns: [], rows: [] })
})
test('sessions are signed, reject tampering and invalid secrets', () => {
  const secret = 'unit-test-only-not-for-deployment-0000000000'
  const session = issueSession(secret)
  assert.equal(verifySession(session, secret), true)
  assert.equal(verifySession(session + 'x', secret), false)
  assert.equal(verifySession(session, secret + 'x'), false)
  assert.equal(verifySession(session, ''), false)
  assert.equal(verifySession(undefined, secret), false)
  const oldPayload = Buffer.from(JSON.stringify({ expires: Date.now() + 60000, nonce: 'legacy-token-session' })).toString('base64url')
  const oldSignature = createHmac('sha256', secret).update(`studio-session:${oldPayload}`).digest('base64url')
  assert.equal(verifySession(`${oldPayload}.${oldSignature}`, secret), false)
})
test('SQL execution does not display command tags as result rows, including schema setup batches', () => {
  const empty = { columns: [], rows: [] }
  assert.deepEqual(parseSqlExecutionOutput('CREATE TABLE x(id integer);', 'CREATE TABLE\n'), empty)
  assert.deepEqual(parseSqlExecutionOutput('UPDATE x SET id=1;', 'UPDATE 3\n'), empty)
  assert.deepEqual(parseSqlExecutionOutput('SET search_path TO public; CREATE TABLE x(id integer);', 'SET\nCREATE TABLE\n'), empty)
  assert.deepEqual(parseSqlExecutionOutput(
    "SET search_path TO public; SELECT pg_catalog.set_config('search_path','',false); CREATE TABLE x(id integer);",
    'SET\nset_config\n""\nCREATE TABLE\nALTER TABLE\nCOMMENT\n',
  ), empty)
  assert.deepEqual(parseSqlExecutionOutput('SELECT 42 AS answer;', 'answer\n42\n'), { columns: ['answer'], rows: [{ answer: '42' }] })
  assert.deepEqual(parseSqlExecutionOutput('INSERT INTO x VALUES(1) RETURNING id;', 'id\n1\nINSERT 0 1\n'), { columns: ['id'], rows: [{ id: '1' }] })
  assert.deepEqual(parseSqlExecutionOutput('SELECT 1; SELECT 2;', 'a\n1\nb\n2\n'), { columns: ['output'], rows: [{ output: 'a\n1\nb\n2\n' }] })
})
test('live table mapping preserves composite keys; create SQL quotes names', () => {
  const node = {
    id: 'n', schema: 'my"schema', name: 'a"table', primaryKey: ['a', 'b'],
    columns: ['a', 'b'].map(name => ({ name, type: 'integer', udt_name: 'int4', nullable: false, generated: false, identity: '', default: null })),
  }
  const table = liveTable(node)
  assert.ok(table.columns.every(c => c.isPrimaryKey))
  assert.match(createTableSql(table), /PRIMARY KEY \("a","b"\)/)
  assert.equal(qi('a"b'), '"a""b"')
  assert.equal(literal("don't"), "'don''t'")
})
