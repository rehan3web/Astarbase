import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { parseSqlOutput } from '../lib/sql-results'
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
