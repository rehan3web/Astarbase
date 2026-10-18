import assert from 'node:assert/strict'
import test from 'node:test'
import { foreignKeyReferenceSql, foreignKeyActions, type ForeignKeyDraft } from '../lib/foreign-keys'

const reference: ForeignKeyDraft = {
  targetSchema: 'public', targetTable: 'accounts', targetColumn: 'id',
  onDelete: 'NO ACTION', onUpdate: 'NO ACTION',
}

test('foreign key references qualify and quote the target identifiers', () => {
  assert.equal(foreignKeyReferenceSql(reference),
    'REFERENCES "public"."accounts" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION')
  assert.match(foreignKeyReferenceSql({ ...reference, targetSchema: 'My Schema', targetTable: 'a"b', targetColumn: 'odd"id' }),
    /^REFERENCES "My Schema"\."a""b" \("odd""id"\)/)
})

test('foreign key actions are allowlisted and incomplete mappings are rejected', () => {
  for (const action of foreignKeyActions) {
    assert.ok(foreignKeyReferenceSql({ ...reference, onDelete: action, onUpdate: action })
      .endsWith(`ON DELETE ${action} ON UPDATE ${action}`))
  }
  assert.throws(() => foreignKeyReferenceSql({ ...reference, targetColumn: '' }), /Select/)
  assert.throws(() => foreignKeyReferenceSql({ ...reference, onDelete: 'CASCADE; DROP TABLE accounts' as never }), /Invalid/)
})
