export type MetricSample = {
  database: string
  sampledAt: string
  databaseSizeBytes: number | null
  connections: number | null
  activeConnections: number | null
  maxConnections: number | null
  cpuPercent: number | null
  memoryUsageBytes: number | null
  memoryLimitBytes: number | null
  commits: number | null
  rollbacks: number | null
  rowsInserted: number | null
  rowsUpdated: number | null
  rowsDeleted: number | null
  transactionsPerSecond: number | null
  rowsChangedPerSecond: number | null
  databaseOid: string | null
  statsResetAt: string | null
  databaseError: string | null
  computeError: string | null
}

export type ActivityEvent = {
  id: number
  database: string
  kind: 'query' | 'branch-refresh'
  status: 'success' | 'error'
  durationMs: number
  occurredAt: string
}

export type ActivityBucket = {
  startAt: string
  endAt: string
  runs: { succeeded: number; slow: number; failed: number } | null
  rows: { inserted: number; updated: number; deleted: number } | null
}

export type ActivityTelemetry = {
  startAt: string
  endAt: string
  slowThresholdMs: number
  buckets: ActivityBucket[]
  monitoring?: {
    source: 'postgres-logs'
    status: 'collecting' | 'active' | 'unavailable' | 'degraded'
    since: string | null
    lastCollectedAt: string | null
    message: string | null
  }
}

export type DashboardMetrics = {
  database: string
  latest: MetricSample | null
  history: MetricSample[]
  events: ActivityEvent[]
  activity: ActivityTelemetry | null
  stale: boolean
  errors: string[]
  intervalSeconds: number
  retentionDays: number
  computeScope: 'postgres-container'
}

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const integerFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

export function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable'
  if (value < 0) return 'Unavailable'
  if (value < 1024) return `${integerFormat.format(value)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let amount = value
  let unit = -1
  do {
    amount /= 1024
    unit += 1
  } while (amount >= 1024 && unit < units.length - 1)
  return `${numberFormat.format(amount)} ${units[unit]}`
}

export function formatMetric(value: number | null | undefined, suffix = ''): string {
  return value == null || !Number.isFinite(value)
    ? 'Unavailable'
    : `${numberFormat.format(value)}${suffix}`
}

export function formatRate(value: number | null | undefined, unit: string): string {
  return value == null
    ? 'Awaiting baseline'
    : Number.isFinite(value) ? `${numberFormat.format(value)} ${unit}` : 'Unavailable'
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Unavailable'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unavailable'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

export function formatShortTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}
