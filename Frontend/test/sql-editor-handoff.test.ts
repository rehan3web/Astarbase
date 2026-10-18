import assert from 'node:assert/strict'
import { test } from 'node:test'
import { queueSqlEditorDraft, takeSqlEditorDraft } from '../lib/sql-editor-handoff'

const memory = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}
test('SQL handoff preserves the complete SQL and is consumed exactly once', () => {
  const storage = memory()
  const draft = { database: 'main', name: 'Definition of public.users', sql: "CREATE TABLE public.users(id bigint, note text DEFAULT '-- preserve');\n" }
  queueSqlEditorDraft(draft, storage)
  assert.deepEqual(takeSqlEditorDraft('main', storage), draft)
  assert.equal(takeSqlEditorDraft('main', storage), null)
})
test('SQL handoff never opens a definition in a different database', () => {
  const storage = memory()
  queueSqlEditorDraft({ database: 'child', name: 'Definition', sql: 'CREATE TABLE x(id int);' }, storage)
  assert.throws(() => takeSqlEditorDraft('main', storage), /belongs to child/)
  assert.equal(takeSqlEditorDraft('main', storage), null)
})
test('SQL handoff rejects malformed entries and exposes storage failures', () => {
  const storage = memory()
  assert.throws(() => queueSqlEditorDraft({ database: '', name: 'Definition', sql: 'SQL' }, storage), /Invalid/)
  assert.throws(() => queueSqlEditorDraft({ database: 'main', name: 'Definition', sql: '' }, storage), /Invalid/)
  assert.throws(() => queueSqlEditorDraft({ database: 'main', name: 'Definition', sql: 'SELECT 1' }, {
    ...storage, setItem: () => { throw new Error('Storage unavailable') },
  }), /Storage unavailable/)
})
