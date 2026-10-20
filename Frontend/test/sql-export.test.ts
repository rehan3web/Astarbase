import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resultsAsCsv, resultsAsMarkdown } from '../components/sql/export/SqlExportUtils'
import type { QueryResult } from '../components/sql/result/SqlResultsPane'

const result: QueryResult = {
  columns: ['odd,"column', 'value'],
  rows: [
    { 'odd,"column': 'a,"b"\nc', value: null },
    { 'odd,"column': false, value: { nested: ['x', 2] } },
  ],
  executionTimeMs: 1, status: 'success', rowCount: 2,
}

test('CSV quotes headers and values, escapes embedded quotes and preserves multiline cells and JSON', () => {
  assert.equal(resultsAsCsv(result),
    '"odd,""column","value"\r\n"a,""b""\nc",""\r\n"false","{""nested"":[""x"",2]}"')
})

test('Markdown escapes pipes, backslashes and line breaks and preserves structured values', () => {
  assert.equal(resultsAsMarkdown({
    ...result, columns: ['label', 'data'], rows: [{ label: 'a|b\\c\nnext', data: { n: 2 } }],
  }), '| label | data |\n| --- | --- |\n| a\\|b\\\\c<br>next | {"n":2} |')
})

test('zero-row SELECT exports headers, invalid and command-only results fail explicitly', () => {
  assert.equal(resultsAsCsv({ ...result, rows: [], rowCount: 0 }), '"odd,""column","value"')
  assert.throws(() => resultsAsCsv(undefined as unknown as QueryResult), /unavailable/)
  assert.throws(() => resultsAsCsv({ ...result, columns: [] }), /No result columns/)
  assert.throws(() => resultsAsMarkdown({ ...result, status: 'error' }), /No result columns/)
})
