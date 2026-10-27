import assert from 'node:assert/strict'
import test from 'node:test'
import { applyColumnTypeChange, getColumnTypeOptions } from '../lib/column-type-options'

test('default expression suggestions are exclusive to each PostgreSQL type', () => {
  const values = (type: string, array = false) => getColumnTypeOptions(type, array).suggestions.map(option => option.value)
  assert.deepEqual(values('timestamptz'), ['now()', "(now() at time zone 'utc')"])
  assert.deepEqual(values('timestamp without time zone'), values('timestamptz'))
  assert.deepEqual(values('int8'), ['0', '1'])
  assert.deepEqual(values('integer'), values('int4'))
  assert.deepEqual(values('json'), ["'{}'::json", "'[]'::json"])
  assert.deepEqual(values('jsonb'), ["'{}'::jsonb", "'[]'::jsonb"])
  assert.deepEqual(values('boolean'), ['true', 'false'])
  assert.deepEqual(values('uuid'), ['gen_random_uuid()'])
  assert.deepEqual(values('date'), ['CURRENT_DATE'])
  assert.deepEqual(values('time'), ['CURRENT_TIME'])
  assert.deepEqual(values('numeric(10,2)'), ['0', '1'])
  assert.deepEqual(values('timestamptz', true), ["'{}'::timestamptz[]"])
  assert.deepEqual(values('int4[]'), ["'{}'::int4[]"])
  assert.deepEqual(values('custom_schema.custom_type'), [])
})

test('json and unknown types never offer unsupported uniqueness', () => {
  assert.equal(getColumnTypeOptions('json').supportsUnique, false)
  assert.equal(getColumnTypeOptions('json[]').supportsUnique, false)
  assert.equal(getColumnTypeOptions('jsonb').supportsUnique, true)
  assert.equal(getColumnTypeOptions('int8', true).supportsUnique, true)
  assert.equal(getColumnTypeOptions('custom_type').supportsUnique, false)
})

test('type/array changes clear incompatible built-in defaults and constraints but retain custom SQL', () => {
  const timestamp = { type: 'timestamptz', defaultValue: 'now()', isArray: false, isUnique: true, isPrimaryKey: true }
  assert.equal(applyColumnTypeChange(timestamp, { type: 'int4' }).defaultValue, '')
  assert.equal(applyColumnTypeChange(timestamp, { isArray: true }).defaultValue, '')
  const json = applyColumnTypeChange(timestamp, { type: 'json' })
  assert.equal(json.isUnique, false)
  assert.equal(json.isPrimaryKey, false)
  assert.equal(applyColumnTypeChange({ ...timestamp, defaultValue: "'2026-10-22'::date" }, { type: 'date' }).defaultValue, "'2026-10-22'::date")
  assert.equal(applyColumnTypeChange({ ...timestamp, type: 'int4', defaultValue: '0' }, { type: 'int8' }).defaultValue, '0')
  assert.equal(applyColumnTypeChange(timestamp, {}).defaultValue, 'now()')
})
