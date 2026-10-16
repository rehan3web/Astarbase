'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { api, Diagram, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'

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

export function ProjectHomeView() {
  const { database, branch, branches, settings } = useStudio()
  const [catalog, setCatalog] = useState<Diagram | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const value = await api<Diagram>(`/databases/${encodeURIComponent(database)}/schema`, { signal })
      if (!signal?.aborted) setCatalog(value)
    } catch (cause) {
      if (!signal?.aborted) setError(errorMessage(cause))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])
  const hasCatalog = catalog?.database === database
  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-8">
      {/* Top Banner & Project Overview — same original composition, live values only */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-default">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{settings?.projectName || 'Astarbase'}</h1>
            <Badge variant="brand" className="text-xs px-2 py-0.5">{branch?.name || 'Connected'}</Badge>
          </div>
          <p className="text-sm text-foreground-lighter mt-1 flex items-center gap-2"><span className="font-mono">{database}</span><span>·</span><span>{loading ? 'Reading live catalog…' : hasCatalog ? 'Live catalog connected' : 'Catalog unavailable'}</span><span>·</span><span>{branches.length} managed databases</span></p>
        </div>
      </div>

      {/* Original resource metric grid: unsupported telemetry is explicitly unavailable */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Database Size" value="—" badges={['Not exposed by API']} />
        <MetricCard title="Connections" value="—" badges={['Not exposed by API']} />
        <MetricCard title="Compute CPU" value="—" badges={['Not exposed by API']} />
        <MetricCard title="RAM Usage" value="—" badges={['Not exposed by API']} />
      </div>

      {/* Original activity section retained without fabricated sample bars */}
      <section className="rounded-xl border border-default bg-studio p-6">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="text-base font-semibold text-foreground">Database activity</h2><p className="mt-1 text-xs text-foreground-lighter">Query and sync telemetry for {database}</p></div>
          <span className="text-[10px] uppercase tracking-wider text-foreground-muted border border-strong rounded px-2 py-1">Unavailable</span>
        </div>
        <div className="h-40 border border-dashed border-strong rounded-lg flex flex-col items-center justify-center text-center px-4">
          <p className="text-sm text-foreground-lighter">Activity metrics are not returned by the current admin API.</p>
          <p className="text-xs text-foreground-muted mt-1">No synthetic activity has been added to this view.</p>
        </div>
      </section>

      {/* Original service infrastructure & health grid with live catalog metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard title="PostgreSQL Engine" value="—" badges={['Version not exposed']} />
        <MetricCard title="Row Level Security" value="—" badges={['Status not exposed', 'Policies not exposed']} />
        <MetricCard title="PgBouncer" value="—" badges={['Pooler metrics not exposed']} />
      </div>
      {error && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{error}<button onClick={() => void load()} className="ml-3 underline">Retry</button></div>}
      {loading && <div className="text-xs text-foreground-lighter">Reading live database catalog…</div>}
    </div>
  )
}
