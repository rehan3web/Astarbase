import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'
import { parseSqlExecutionOutput } from '../lib/sql-results'
import { resultsAsCsv, resultsAsMarkdown } from '../components/sql/export/SqlExportUtils'

export async function verifySqlExports(page: Page, url: string, setQuery: (sql: string) => Promise<void>, snapshot: (name: string) => Promise<unknown>) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(`${url}/sql`)
  const sql = `SELECT 7 AS id, 'a,"b"' || chr(10) || 'c|d' AS label, NULL::text AS empty_value;`
  await setQuery(sql)
  const response = page.waitForResponse(r => r.url() === `${url}/api/studio/sql` && r.request().method() === 'POST')
  await page.getByTitle('Run query (Ctrl+Enter)').click()
  const executed = await response
  assert.equal(executed.ok(), true)
  const output = await executed.json()
  const parsed = parseSqlExecutionOutput(sql, output.stdout)
  const result = { ...parsed, executionTimeMs: 1, status: 'success' as const, rowCount: parsed.rows.length }
  assert.equal(result.rows.length, 1)
  const expected = {
    JSON: JSON.stringify(result.rows, null, 2),
    CSV: resultsAsCsv(result),
    Markdown: resultsAsMarkdown(result),
  }
  const copy = async (format: keyof typeof expected, fallback: boolean) => {
    await page.evaluate(() => navigator.clipboard.writeText('unchanged sentinel'))
    if (fallback) await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }))
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    await page.getByRole('menuitem', { name: new RegExp(`^Copy as ${format}`) }).click()
    await expect(page.locator('[data-studio-toast]').filter({ hasText: `Copied results as ${format} to clipboard` }).last()).toBeVisible()
    if (fallback) await page.evaluate(() => Reflect.deleteProperty(navigator, 'clipboard'))
    // Clipboard/textarea implementations normalize CRLF to LF on Linux;
    // the downloaded CSV must still preserve its original CRLF bytes.
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n'),
      expected[format].replace(/\r\n/g, '\n'))
  }
  for (const fallback of [false, true]) {
    for (const format of ['JSON', 'CSV', 'Markdown'] as const) await copy(format, fallback)
  }
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await snapshot('sql-export-menu')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /^Download CSV/ }).click()
  const download = await downloadPromise
  assert.match(download.suggestedFilename(), /^query_result_\d+\.csv$/)
  const file = await download.path()
  assert.ok(file)
  assert.equal(await readFile(file, 'utf8'), expected.CSV)

  // If both copying methods fail, show an error rather than a success toast.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: Boolean.bind(null, false) })
  })
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Copy as JSON/ }).click()
  await expect(page.locator('[data-studio-toast][role="alert"]').filter({ hasText: 'Clipboard unavailable' })).toBeVisible()
  await page.evaluate(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    Reflect.deleteProperty(document, 'execCommand')
  })
  await copy('JSON', false)
  console.log('PASS: SQL JSON/CSV/Markdown copy with real clipboard and HTTP fallback, exact CSV download, failure and recovery')
}
