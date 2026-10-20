import type { QueryResult } from '@/components/sql/result/SqlResultsPane'
import { copyText } from '@/lib/copy-text'

function assertResult(queryResult: QueryResult) {
  if (!queryResult || !Array.isArray(queryResult.columns) || !Array.isArray(queryResult.rows)) {
    throw new Error('Query results are unavailable. Run the query again before exporting.')
  }
  if (queryResult.status !== 'success' || queryResult.columns.length === 0) {
    throw new Error('No result columns to export. Run a SELECT query first.')
  }
}

function cellText(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

export function resultsAsCsv(queryResult: QueryResult): string {
  assertResult(queryResult)
  const quote = (value: unknown) => `"${cellText(value).replaceAll('"', '""')}"`
  return [
    queryResult.columns.map(quote).join(','),
    ...queryResult.rows.map(row => queryResult.columns.map(column => quote(row[column])).join(',')),
  ].join('\r\n')
}

export function resultsAsMarkdown(queryResult: QueryResult): string {
  assertResult(queryResult)
  const escape = (value: unknown) => cellText(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\r\n|\r|\n/g, '<br>')
  const headers = `| ${queryResult.columns.map(escape).join(' | ')} |`
  const divider = `| ${queryResult.columns.map(() => '---').join(' | ')} |`
  const rows = queryResult.rows.map(row =>
    `| ${queryResult.columns.map(column => escape(row[column])).join(' | ')} |`)
  return [headers, divider, ...rows].join('\n')
}

/**
 * Copy query results as a Markdown table to clipboard.
 */
export async function copyResultsAsMarkdown(queryResult: QueryResult): Promise<boolean> {
  await copyText(resultsAsMarkdown(queryResult))
  return true
}

/**
 * Copy query results as JSON to clipboard.
 */
export async function copyResultsAsJson(queryResult: QueryResult): Promise<boolean> {
  assertResult(queryResult)
  await copyText(JSON.stringify(queryResult.rows, null, 2))
  return true
}

/**
 * Copy query results as CSV to clipboard.
 */
export async function copyResultsAsCsv(queryResult: QueryResult): Promise<boolean> {
  await copyText(resultsAsCsv(queryResult))
  return true
}

/**
 * Download query results as a CSV file.
 */
export function downloadResultsAsCsv(queryResult: QueryResult, filename?: string) {
  const blob = new Blob([resultsAsCsv(queryResult)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `query_result_${Date.now()}.csv`
  document.body.appendChild(a)
  try { a.click() }
  finally {
    a.remove()
    // Let the browser start reading the blob before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

