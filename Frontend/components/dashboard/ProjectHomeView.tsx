'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { SyncActivityChart } from '@/components/dashboard/SyncActivityChart'
import {
  DashboardMetrics,
  formatBytes,
  formatMetric,
  formatTimestamp,
} from '@/lib/dashboard-metrics'

function MetricCard({ title, value, badges }: { title: string; value: React.ReactNode; badges: string[] }) {
  return (
    <div className="relative flex h-fit min-w-0 self-start flex-col rounded-xl border border-default bg-studio p-4 transition-colors hover:border-strong">
      <h3 className="break-words text-base font-semibold leading-tight text-foreground">{title}</h3>
      <p className="mt-1 min-w-0 break-words text-base text-foreground-lighter">{value}</p>
      <div className="mt-3 flex min-w-0 flex-wrap items-start gap-1.5">
        {badges.map(b => <span key={b} className="inline-flex min-w-0 max-w-full break-words whitespace-normal rounded-md border border-strong px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wide text-foreground-light">{b}</span>)}
      </div>
    </div>
  )
}

export function ProjectHomeView() {
  const { database, branch, branches, settings } = useStudio()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsKey, setMetricsKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [now, setNow] = useState(0)
  const requestId = useRef(0)
  const key = database

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
          `/databases/${encodeURIComponent(database)}/metrics?hours=24&limit=240`,
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
  }, [database, key, refreshToken])

  const current = metricsKey === key ? metrics : null
  const latest = current?.latest ?? null
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
          <button type="button" onClick={retry} disabled={loading} className="rounded-md border border-strong px-3 py-2 text-xs font-medium text-foreground-light transition-colors hover:bg-dash-sidebar disabled:opacity-50">
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {current && metricErrors.length > 0 && (
        <div role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          Some telemetry is unavailable: {[...new Set(metricErrors)].join(' · ')}
        </div>
      )}
      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          <span>{error}{current ? ' Previously loaded readings are still shown.' : ''}</span>
          <button type="button" onClick={retry} className="underline underline-offset-2">Retry</button>
        </div>
      )}
      {isStale && current && (
        <p role="status" className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
          Latest persisted sample is stale; historical data remains available.
        </p>
      )}

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
          badges={['Shared Postgres container']}
        />
        <MetricCard
          title="RAM Usage"
          value={latest ? formatBytes(latest.memoryUsageBytes) : loading ? 'Loading…' : 'Unavailable'}
          badges={[latest?.memoryLimitBytes == null ? 'Limit unavailable' : `of ${formatBytes(latest.memoryLimitBytes)}`, 'Shared container']}
        />
      </div>

      <SyncActivityChart activity={current?.activity ?? null} />

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
