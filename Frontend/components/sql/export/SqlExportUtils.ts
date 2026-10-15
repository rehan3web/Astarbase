import { QueryResult } from '@/components/sql/result/SqlResultsPane'

/**
 * Copy query results as a Markdown table to clipboard.
 */
export async function copyResultsAsMarkdown(queryResult: QueryResult): Promise<boolean> {
  if (!queryResult || !queryResult.columns) return false
  const headers = `| ${queryResult.columns.join(' | ')} |`
  const divider = `| ${queryResult.columns.map(() => '---').join(' | ')} |`
  const rows = queryResult.rows
    .map((r) => `| ${queryResult.columns.map((c) => r[c] ?? '').join(' | ')} |`)
    .join('\n')
  const md = `${headers}\n${divider}\n${rows}`
  await navigator.clipboard.writeText(md)
  return true
}

/**
 * Copy query results as JSON to clipboard.
 */
export async function copyResultsAsJson(queryResult: QueryResult): Promise<boolean> {
  if (!queryResult) return false
  await navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2))
  return true
}

/**
 * Copy query results as CSV to clipboard.
 */
export async function copyResultsAsCsv(queryResult: QueryResult): Promise<boolean> {
  if (!queryResult || !queryResult.columns) return false
  const headers = queryResult.columns.join(',')
  const rows = queryResult.rows
    .map((r) => queryResult.columns.map((c) => `"${r[c] ?? ''}"`).join(','))
    .join('\n')
  await navigator.clipboard.writeText(`${headers}\n${rows}`)
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

