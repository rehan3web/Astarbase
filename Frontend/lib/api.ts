export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal,
  })
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('studio-session-expired'))
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data as T
}
export type Branch = { name: string; database_name: string; parent_name: string | null; tag: string | null; created_at: string; refreshed_at: string | null; storage_bytes?: number | null }
export type AdminSettings = { projectName: string; defaultRowLimit: number; theme: 'system' | 'light' | 'dark' }
export type SqlResponse = { stdout: string; stderr: string; format: string; durationMs: number }
export type Column = { name: string; type: string; udt_name: string; nullable: boolean; generated: boolean; identity: string; default: string | null }
export type TableRows = { schema: string; name: string; columns: Column[]; primaryKey: string[]; rows: Record<string, unknown>[]; total: string; limit: number; offset: number; editable: boolean }
export type SchemaNode = { id: string; schema: string; name: string; columns: Column[]; primaryKey: string[] }
export type SchemaEdge = { id: string; source: string; target: string; source_schema: string; source_table: string; target_schema: string; target_table: string; source_columns: string[]; target_columns: string[]; name: string }
export type Diagram = { database: string; nodes: SchemaNode[]; edges: SchemaEdge[] }
export type Backup = { id: string; database_name: string; label: string; size_bytes: number; created_at: string; available: boolean }
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Operation failed'
export const qi = (name: string) => `"${name.replaceAll('"', '""')}"`
export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
export const tablePath = (database: string, schema: string, table: string) =>
  `/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`
