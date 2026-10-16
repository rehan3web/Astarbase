export type ConnectionMetadata = {
  database: string
  user: string
  host: string | null
  directPort: number
  poolerPort: number
  sslMode: 'disable'
}

export type ConnectionMode = 'connection-string' | 'transaction-pooler' | 'psql' | 'parameters'

const MASKED_PASSWORD = '****************'

function encodeUriPart(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

function uriHost(host: string): string {
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const uriSafeHost = unbracketed.replaceAll('%', '%25')
  return unbracketed.includes(':') ? `[${uriSafeHost}]` : uriSafeHost
}

function quoteLibpq(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function quoteEnv(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('`', '\\`').replaceAll('\n', '\\n').replaceAll('\r', '\\r')}"`
}

export function formatConnection(
  metadata: ConnectionMetadata & { host: string },
  password: string | null,
  mode: ConnectionMode,
): string {
  const shownPassword = password ?? MASKED_PASSWORD
  const port = mode === 'transaction-pooler' ? metadata.poolerPort : metadata.directPort

  if (mode === 'connection-string' || mode === 'transaction-pooler') {
    const encodedPassword = password === null ? MASKED_PASSWORD : encodeUriPart(password)
    return `postgresql://${encodeUriPart(metadata.user)}:${encodedPassword}@${uriHost(metadata.host)}:${port}/${encodeUriPart(metadata.database)}?sslmode=${metadata.sslMode}`
  }

  if (mode === 'psql') {
    const conninfo = [
      `host=${quoteLibpq(metadata.host)}`,
      `port=${quoteLibpq(String(metadata.directPort))}`,
      `dbname=${quoteLibpq(metadata.database)}`,
      `user=${quoteLibpq(metadata.user)}`,
      `sslmode=${quoteLibpq(metadata.sslMode)}`,
    ].join(' ')
    return `PGPASSWORD=${quoteShell(shownPassword)} psql ${quoteShell(conninfo)}`
  }

  return [
    `PGHOST=${quoteEnv(metadata.host)}`,
    `PGPORT=${quoteEnv(String(metadata.directPort))}`,
    `PGDATABASE=${quoteEnv(metadata.database)}`,
    `PGUSER=${quoteEnv(metadata.user)}`,
    `PGPASSWORD=${quoteEnv(shownPassword)}`,
    `PGSSLMODE=${quoteEnv(metadata.sslMode)}`,
  ].join('\n')
}
