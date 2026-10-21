'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { SyncActivityChart } from '@/components/dashboard/SyncActivityChart'
import { Spinner } from '@/components/ui/spinner'
import {
  DashboardMetrics,
  formatBytes,
  formatMetric,
} from '@/lib/dashboard-metrics'

function MetricCard({ title, value, badges, loading = false }: { title: string; value: React.ReactNode; badges: string[]; loading?: boolean }) {
  return (
    <div data-metric-card={title} aria-busy={loading} className="relative flex h-fit min-w-0 self-start flex-col rounded-xl border border-default bg-studio p-4 transition-colors hover:border-strong">
      <h3 className="break-words text-base font-semibold leading-tight text-foreground">{title}</h3>
      <p className="mt-1 min-w-0 break-words text-base text-foreground-lighter">
        {loading ? <span data-skeleton="true" aria-hidden="true" className="block h-5 w-28 motion-safe:animate-pulse rounded bg-surface-200" /> : value}
        {loading && <span className="sr-only">Loading {title}</span>}
      </p>
      <div className="mt-3 flex min-w-0 flex-wrap items-start gap-1.5">
        {loading
          ? <span data-skeleton="true" aria-hidden="true" className="h-5 w-24 motion-safe:animate-pulse rounded-md bg-surface-200" />
          : badges.map(b => <span key={b} className="inline-flex min-w-0 max-w-full break-words whitespace-normal rounded-md border border-strong px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wide text-foreground-light">{b}</span>)}
      </div>
    </div>
  )
}

type ServiceStatus = {
  active: boolean | null
  error: string | null
}

type ServiceStatuses = {
  postgres: ServiceStatus
  rls: ServiceStatus
  pgbouncer: ServiceStatus
}

const unavailableStatuses: ServiceStatuses = {
  postgres: { active: null, error: null },
  rls: { active: null, error: null },
  pgbouncer: { active: null, error: null },
}

function ServiceStatusItem({ name, status, loading, description }: {
  name: string
  status: ServiceStatus
  loading: boolean
  description?: string
}) {
  const label = status.active === true ? 'Active' : status.active === false ? 'Inactive' : 'Unavailable'
  const accessibleLabel = loading ? 'Loading status' : label
  const detail = [description, status.error].filter(Boolean).join(' ')
  const dotClass = loading || status.active == null
    ? 'bg-foreground-muted'
    : status.active
      ? 'bg-emerald-500'
      : 'bg-rose-500'

  return (
    <div
      data-service-card={name}
      aria-busy={loading}
      title={detail || undefined}
      aria-label={`${name}: ${accessibleLabel}${detail ? `. ${detail}` : ''}`}
      className="relative flex h-fit min-w-0 self-start flex-col rounded-xl border border-default bg-studio p-4 transition-colors hover:border-strong"
    >
      <h3 className="break-words text-base font-semibold leading-tight text-foreground">{name}</h3>
      <p className="mt-1 inline-flex min-w-0 items-center gap-2 text-base text-foreground-lighter">
        {loading
          ? <><Spinner size={12} decorative /><span className="sr-only">Loading status</span></>
          : <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />}
        {!loading && <span>{label}</span>}
      </p>
      {detail && <span className="sr-only">{detail}</span>}
    </div>
  )
}

export function ProjectHomeView() {
  const { database, branch, branches, settings } = useStudio()
  const projectName = settings?.projectName || 'Sorabase'
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [metricsKey, setMetricsKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [now, setNow] = useState(0)
  const [serviceStatuses, setServiceStatuses] = useState<ServiceStatuses>(unavailableStatuses)
  const [serviceStatusLoading, setServiceStatusLoading] = useState(true)
  const [serviceStatusError, setServiceStatusError] = useState('')
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

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    let activeController: AbortController | null = null
    let request = 0
    let mounted = true

    const refreshStatus = async () => {
      if (document.visibilityState !== 'visible' || !mounted) return
      activeController?.abort()
      const controller = new AbortController()
      activeController = controller
      const id = ++request
      try {
        const result = await api<{
          database: string
          checkedAt: string
          postgres: ServiceStatus
          rls: ServiceStatus
          pgbouncer: ServiceStatus
        }>(`/databases/${encodeURIComponent(database)}/metrics/status`, { signal: controller.signal })
        if (mounted && !controller.signal.aborted && id === request) {
          setServiceStatuses({
            postgres: result.postgres,
            rls: result.rls,
            pgbouncer: result.pgbouncer,
          })
          setServiceStatusError('')
        }
      } catch (cause) {
        if (mounted && !controller.signal.aborted && id === request) {
          setServiceStatuses(unavailableStatuses)
          setServiceStatusError(errorMessage(cause))
        }
      } finally {
        if (mounted && !controller.signal.aborted && id === request) {
          setServiceStatusLoading(false)
          activeController = null
        }
      }
    }

    const schedule = () => {
      if (timer) clearInterval(timer)
      if (document.visibilityState === 'visible') {
        void refreshStatus()
        timer = setInterval(() => void refreshStatus(), 30_000)
      } else {
        request += 1
        activeController?.abort()
        activeController = null
      }
    }

    setServiceStatuses(unavailableStatuses)
    setServiceStatusError('')
    setServiceStatusLoading(true)
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      mounted = false
      request += 1
      activeController?.abort()
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [database, refreshToken])

  const current = metricsKey === key ? metrics : null
  const metricsLoading = loading || !current
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
    setLoading(true)
    setRefreshToken(value => value + 1)
  }, [])

  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-8">
      {/* Top banner and original dashboard composition */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-default">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{projectName}</h1>
            <Badge variant="brand" className="text-xs px-2 py-0.5">{branch?.name || 'Connected'}</Badge>
          </div>
          <p className="text-sm text-foreground-lighter mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono">{database}</span><span>·</span>
            <span>{branches.length} managed databases</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={retry} disabled={loading} className="rounded-md border border-strong px-3 py-2 text-xs font-medium text-foreground-light transition-colors hover:bg-dash-sidebar disabled:opacity-50">
            {loading ? <><Spinner size={14} decorative />Refreshing…</> : 'Refresh'}
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
          value={latest ? formatBytes(latest.databaseSizeBytes) : 'Unavailable'}
          badges={[latest?.databaseError ? 'Database stats partial' : 'Selected database']}
          loading={metricsLoading}
        />
        <MetricCard
          title="Connections"
          value={latest ? formatMetric(latest.connections) : 'Unavailable'}
          badges={[latest?.activeConnections == null ? 'Active unavailable' : `${formatMetric(latest.activeConnections)} active`, latest?.maxConnections == null ? 'Limit unavailable' : `${formatMetric(latest.maxConnections)} max`]}
          loading={metricsLoading}
        />
        <MetricCard
          title="Compute CPU"
          value={latest ? formatMetric(latest.cpuPercent, '%') : 'Unavailable'}
          badges={['Shared Postgres container']}
          loading={metricsLoading}
        />
        <MetricCard
          title="RAM Usage"
          value={latest ? formatBytes(latest.memoryUsageBytes) : 'Unavailable'}
          badges={[latest?.memoryLimitBytes == null ? 'Limit unavailable' : `of ${formatBytes(latest.memoryLimitBytes)}`, 'Shared container']}
          loading={metricsLoading}
        />
      </div>

      <SyncActivityChart activity={current?.activity ?? null} loading={metricsLoading} />

      <div role="group" aria-label="Service health" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ServiceStatusItem name="PostgreSQL Engine" status={serviceStatuses.postgres} loading={serviceStatusLoading} />
        <ServiceStatusItem
          name="Row Level Security"
          status={serviceStatuses.rls}
          loading={serviceStatusLoading}
          description="Active means at least one user table in the selected database has RLS enabled."
        />
        <ServiceStatusItem name="PgBouncer" status={serviceStatuses.pgbouncer} loading={serviceStatusLoading} />
      </div>
      {serviceStatusError && (
        <span role="alert" title={serviceStatusError} className="sr-only">
          Status check failed: {serviceStatusError}
        </span>
      )}
    </div>
  )
}
