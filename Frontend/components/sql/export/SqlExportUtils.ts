import { QueryResult } from '@/components/sql/result/SqlResultsPane'

/**
 * Copy query results as a Markdown table to clipboard.
 */
export function copyResultsAsMarkdown(queryResult: QueryResult): boolean {
  if (!queryResult || !queryResult.columns) return false
  const headers = `| ${queryResult.columns.join(' | ')} |`
  const divider = `| ${queryResult.columns.map(() => '---').join(' | ')} |`
  const rows = queryResult.rows
    .map((r) => `| ${queryResult.columns.map((c) => r[c] ?? '').join(' | ')} |`)
    .join('\n')
  const md = `${headers}\n${divider}\n${rows}`
  navigator.clipboard.writeText(md)
  return true
}

/**
 * Copy query results as JSON to clipboard.
 */
export function copyResultsAsJson(queryResult: QueryResult): boolean {
  if (!queryResult) return false
  navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2))
  return true
}

/**
 * Copy query results as CSV to clipboard.
 */
export function copyResultsAsCsv(queryResult: QueryResult): boolean {
  if (!queryResult || !queryResult.columns) return false
  const headers = queryResult.columns.join(',')
  const rows = queryResult.rows
    .map((r) => queryResult.columns.map((c) => `"${r[c] ?? ''}"`).join(','))
    .join('\n')
  navigator.clipboard.writeText(`${headers}\n${rows}`)
  return true
}

/**
 * Download query results as a CSV file.
 */
export function downloadResultsAsCsv(queryResult: QueryResult, filename?: string) {
  if (!queryResult || !queryResult.columns) return
  const headers = queryResult.columns.join(',')
  const rows = queryResult.rows
    .map((r) => queryResult.columns.map((c) => `"${r[c] ?? ''}"`).join(','))
    .join('\n')
  const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `query_result_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

