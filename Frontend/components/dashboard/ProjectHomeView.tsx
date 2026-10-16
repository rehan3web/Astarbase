'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { SyncActivityChart } from '@/components/dashboard/SyncActivityChart'
import {
  ActivityEvent,
  DashboardMetrics,
  formatBytes,
  formatMetric,
  formatRate,
  formatShortTime,
  formatTimestamp,
  MetricSample,
} from '@/lib/dashboard-metrics'

function MetricCard({ title, value, badges }: { title: string; value: React.ReactNode; badges: string[] }) {
  return (
    <div className="relative flex flex-col rounded-xl border border-default bg-studio p-6 transition-colors hover:border-strong">
      <h3 className="text-base font-semibold text-foreground leading-tight">{title}</h3>
      <p className="text-base text-foreground-lighter mt-1">{value}</p>
      <div className="flex flex-nowrap items-center gap-1.5 mt-5">
        {badges.map(b => <span key={b} className="inline-flex items-center whitespace-nowrap rounded-md border border-strong px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wide text-foreground-light">{b}</span>)}
      </div>
    </div>
  )
}

const ranges = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
]

function sampleCell(sample: MetricSample, field: keyof MetricSample): string {
  switch (field) {
    case 'sampledAt': return formatShortTime(sample.sampledAt)
    case 'databaseSizeBytes': return formatBytes(sample.databaseSizeBytes)
    case 'connections': return formatMetric(sample.connections)
    case 'cpuPercent': return formatMetric(sample.cpuPercent, '%')
    case 'memoryUsageBytes': return formatBytes(sample.memoryUsageBytes)
    case 'transactionsPerSecond': return formatRate(sample.transactionsPerSecond, 'tx/s')
    case 'rowsChangedPerSecond': return formatRate(sample.rowsChangedPerSecond, 'rows/s')
    default: return 'Unavailable'
  }
}

function MetricHistoryTable({ history, loading }: { history: MetricSample[]; loading: boolean }) {
  if (!history.length) {
    return (
      <div className="rounded-lg border border-dashed border-strong px-4 py-8 text-center">
        <p className="text-sm text-foreground-lighter">{loading ? 'Loading persisted readings…' : 'No persisted readings in this range.'}</p>
        <p className="mt-1 text-xs text-foreground-muted">New samples are recorded every 30 seconds and retained for 7 days.</p>
      </div>
    )
  }

  const columns: { key: keyof MetricSample; label: string }[] = [
    { key: 'sampledAt', label: 'Sampled at' },
    { key: 'databaseSizeBytes', label: 'Database size' },
    { key: 'connections', label: 'Connections' },
    { key: 'cpuPercent', label: 'CPU' },
    { key: 'memoryUsageBytes', label: 'RAM usage' },
    { key: 'transactionsPerSecond', label: 'Transactions / sec' },
    { key: 'rowsChangedPerSecond', label: 'Row changes / sec' },
  ]

  return (
    <div className="overflow-x-auto rounded-lg border border-default">
      <table className="w-full min-w-[900px] border-collapse text-left text-xs">
        <caption className="sr-only">Persisted database metric readings, newest first</caption>
        <thead className="bg-dash-sidebar text-foreground-lighter">
          <tr>{columns.map(column => <th key={column.key} scope="col" className="whitespace-nowrap border-b border-default px-3 py-2.5 font-medium">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {[...history].reverse().map((sample, index) => (
            <tr key={`${sample.sampledAt}-${index}`} className="border-b border-default last:border-0 hover:bg-dash-sidebar/60">
              {columns.map(column => (
                <td key={column.key} className="whitespace-nowrap px-3 py-2 font-mono text-foreground-light">
                  {sampleCell(sample, column.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ActivityEvents({ events }: { events: ActivityEvent[] }) {
  if (!events.length) {
    return <p className="rounded-lg border border-dashed border-strong px-4 py-7 text-center text-sm text-foreground-lighter">No recorded Studio queries or branch refreshes in this period.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-default">
      <table className="w-full min-w-[540px] border-collapse text-left text-xs">
        <caption className="sr-only">Recorded query and branch refresh events, newest first</caption>
        <thead className="bg-dash-sidebar text-foreground-lighter">
          <tr>
            <th scope="col" className="border-b border-default px-3 py-2.5 font-medium">Time</th>
            <th scope="col" className="border-b border-default px-3 py-2.5 font-medium">Event</th>
            <th scope="col" className="border-b border-default px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="border-b border-default px-3 py-2.5 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id} className="border-b border-default last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground-light">{formatShortTime(event.occurredAt)}</td>
              <td className="px-3 py-2 text-foreground">{event.kind === 'branch-refresh' ? 'Branch refresh' : 'Studio query'}</td>
              <td className="px-3 py-2">
                <span className={event.status === 'error' ? 'text-red-400' : 'text-foreground-lighter'}>{event.status === 'error' ? 'Error' : 'Success'}</span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-foreground-light">{formatMetric(event.durationMs, ' ms')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ProjectHomeView() {
  const { database, branch, branches, settings } = useStudio()
  const [hours, setHours] = useState(24)
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsKey, setMetricsKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [now, setNow] = useState(0)
  const requestId = useRef(0)
  const key = `${database}:${hours}`

  useEffect(() => {
    const updateNow = () => setNow(Date.now())
    updateNow()
    const timer = setInterval(updateNow, 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setInterval> | undefined
    let inFlight = false
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || inFlight || controller.signal.aborted) return
      inFlight = true
      const id = ++requestId.current
      setLoading(true)
      try {
        const value = await api<DashboardMetrics>(
          `/databases/${encodeURIComponent(database)}/metrics?hours=${hours}&limit=240`,
          { signal: controller.signal },
        )
        if (!controller.signal.aborted && id === requestId.current) {
          setMetrics(value)
          setMetricsKey(key)
          setError('')
        }
      } catch (cause) {
        if (!controller.signal.aborted && id === requestId.current) setError(errorMessage(cause))
      } finally {
        inFlight = false
        if (!controller.signal.aborted && id === requestId.current) setLoading(false)
      }
    }
    const schedule = () => {
      if (timer) clearInterval(timer)
      if (document.visibilityState === 'visible') {
        void refresh()
        timer = setInterval(() => void refresh(), 30_000)
      }
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      controller.abort()
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [database, hours, key, refreshToken])

  const current = metricsKey === key ? metrics : null
  const latest = current?.latest ?? null
  const history = current?.history ?? []
  const events = current?.events ?? []
  const sampleAge = latest?.sampledAt && now > 0 ? now - new Date(latest.sampledAt).getTime() : Infinity
  const isStale = current?.stale || (Number.isFinite(sampleAge) && sampleAge > 90_000)
  const metricErrors = [
    ...(current?.errors ?? []),
    ...(latest?.databaseError ? [latest.databaseError] : []),
    ...(latest?.computeError ? [latest.computeError] : []),
  ]
  const retry = useCallback(() => {
    setError('')
    setRefreshToken(value => value + 1)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-8">
      {/* Top banner and original dashboard composition */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-default">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{settings?.projectName || 'Astarbase'}</h1>
            <Badge variant="brand" className="text-xs px-2 py-0.5">{branch?.name || 'Connected'}</Badge>
          </div>
          <p className="text-sm text-foreground-lighter mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono">{database}</span><span>·</span>
            <span>{loading && !current ? 'Loading persisted metrics…' : current ? `Sampled every ${current.intervalSeconds}s` : 'Metrics unavailable'}</span><span>·</span>
            <span>{branches.length} managed databases</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isStale && current && <span role="status" className="text-xs text-amber-500">Latest sample is stale</span>}
          <button type="button" onClick={retry} disabled={loading} className="rounded-md border border-strong px-3 py-2 text-xs font-medium text-foreground-light transition-colors hover:bg-dash-sidebar disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Database Size"
          value={latest ? formatBytes(latest.databaseSizeBytes) : loading ? 'Loading…' : 'Unavailable'}
          badges={[latest?.databaseError ? 'Database stats partial' : 'Selected database']}
        />
        <MetricCard
          title="Connections"
          value={latest ? formatMetric(latest.connections) : loading ? 'Loading…' : 'Unavailable'}
          badges={[latest?.activeConnections == null ? 'Active unavailable' : `${formatMetric(latest.activeConnections)} active`, latest?.maxConnections == null ? 'Limit unavailable' : `${formatMetric(latest.maxConnections)} max`]}
        />
        <MetricCard
          title="Compute CPU"
          value={latest ? formatMetric(latest.cpuPercent, '%') : loading ? 'Loading…' : 'Unavailable'}
          badges={['Shared Postgres container', '100% = one core']}
        />
        <MetricCard
          title="RAM Usage"
          value={latest ? formatBytes(latest.memoryUsageBytes) : loading ? 'Loading…' : 'Unavailable'}
          badges={[latest?.memoryLimitBytes == null ? 'Limit unavailable' : `of ${formatBytes(latest.memoryLimitBytes)}`, 'Shared container']}
        />
      </div>

      <SyncActivityChart activity={current?.activity ?? null} hours={hours} />

      <section className="rounded-xl border border-default bg-studio p-6">
        <div className="flex flex-col gap-4 mb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Recorded telemetry</h2>
            <p className="mt-1 text-xs text-foreground-lighter">Persisted database readings and recorded Studio operations for {database}. Transactions are not query counts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label="Metric history range">
            {ranges.map(range => (
              <button
                key={range.hours}
                type="button"
                aria-pressed={hours === range.hours}
                onClick={() => setHours(range.hours)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${hours === range.hours ? 'border-brand-500 bg-brand-500/10 text-foreground' : 'border-strong text-foreground-lighter hover:bg-dash-sidebar'}`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
        {current && metricErrors.length > 0 && (
          <div role="status" className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-500">
            Some telemetry is unavailable: {[...new Set(metricErrors)].join(' · ')}
          </div>
        )}
        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
            <span>{error}{current ? ' Previously loaded readings are still shown.' : ''}</span>
            <button type="button" onClick={retry} className="underline underline-offset-2">Retry</button>
          </div>
        )}
        {current?.stale && (
          <p role="status" className="mb-4 text-xs text-amber-500">The latest backend sample is marked stale. Historical readings remain available.</p>
        )}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-default bg-dash-sidebar/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Transactions per second</p>
            <p className="mt-1 font-mono text-lg text-foreground">{latest ? formatRate(latest.transactionsPerSecond, 'tx/s') : loading ? 'Loading…' : 'Unavailable'}</p>
            <p className="mt-1 text-xs text-foreground-lighter">Commit and rollback rate; a null rate awaits its baseline.</p>
          </div>
          <div className="rounded-lg border border-default bg-dash-sidebar/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-foreground-muted">Row changes per second</p>
            <p className="mt-1 font-mono text-lg text-foreground">{latest ? formatRate(latest.rowsChangedPerSecond, 'rows/s') : loading ? 'Loading…' : 'Unavailable'}</p>
            <p className="mt-1 text-xs text-foreground-lighter">Inserted, updated, and deleted rows.</p>
          </div>
        </div>
        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Recorded readings</h3>
            <span className="text-xs text-foreground-muted">{history.length} samples · retained {current?.retentionDays ?? 7} days</span>
          </div>
          <MetricHistoryTable history={history} loading={loading && !current} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-foreground">Recorded Studio activity</h3>
            <span className="text-xs text-foreground-muted">Queries and branch refreshes</span>
          </div>
          <ActivityEvents events={events} />
        </div>
      </section>

      {/* Unsupported service cards remain unchanged rather than implying telemetry exists. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard title="PostgreSQL Engine" value="—" badges={['Version not exposed']} />
        <MetricCard title="Row Level Security" value="—" badges={['Status not exposed', 'Policies not exposed']} />
        <MetricCard title="PgBouncer" value="—" badges={['Pooler metrics not exposed']} />
      </div>
      {latest && <p className="text-xs text-foreground-muted">Latest persisted reading: {formatTimestamp(latest.sampledAt)}. CPU and RAM are shared across the Postgres container, not per branch or VPS totals.</p>}
    </div>
  )
}
