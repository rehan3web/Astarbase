import assert from 'node:assert/strict'
import test from 'node:test'
import { foreignKeyReferenceSql, foreignKeyActions, type ForeignKeyDraft } from '../lib/foreign-keys'
import { createTableSql } from '../lib/live-tables'
import type { TableDefinition } from '../lib/mock-data'

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

test('new-table foreign keys retain schema, quoting, and staged referential actions', () => {
  const table: TableDefinition = {
    id: 'draft', schema: 'My Schema', name: 'child"table', estimatedRowCount: 0, rows: [],
    columns: [{
      id: 'child-id', name: 'parent"id', format: 'int4', dataType: 'int4',
      isPrimaryKey: true, isNullable: false,
      foreignKey: { ...reference, targetTable: 'parent"table', onDelete: 'CASCADE', onUpdate: 'RESTRICT' },
    }, {
      id: 'child-owner', name: 'owner_id', format: 'int4', dataType: 'int4',
      isPrimaryKey: false, isNullable: true,
      foreignKey: { targetTable: 'owners', targetColumn: 'id', onDelete: 'SET NULL' },
    }],
  }
  const ddl = createTableSql(table)
  assert.match(ddl, /^CREATE TABLE "My Schema"\."child""table"/)
  assert.ok(ddl.includes('"parent""id" int4 NOT NULL REFERENCES "public"."parent""table" ("id") ON DELETE CASCADE ON UPDATE RESTRICT'))
  assert.ok(ddl.includes('"owner_id" int4 REFERENCES "My Schema"."owners" ("id") ON DELETE SET NULL ON UPDATE NO ACTION'))
  assert.ok(ddl.includes('PRIMARY KEY ("parent""id")'))
  const invalid = { ...table, columns: [{ ...table.columns[0], foreignKey: { ...reference, onDelete: 'DROP TABLE accounts' as never } }] }
  assert.throws(() => createTableSql(invalid), /Invalid foreign key action/)
})
