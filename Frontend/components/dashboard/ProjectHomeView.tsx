'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { MOCK_PROJECT } from '@/lib/mock-data'
import { SyncActivityChart } from '@/components/dashboard/SyncActivityChart'

function MetricCard({
  title,
  value,
  badges,
}: {
  title: string
  value: React.ReactNode
  badges: string[]
}) {
  return (
    <div className="relative flex flex-col rounded-xl border border-default bg-studio p-6 transition-colors hover:border-strong">
      <h3 className="text-base font-semibold text-foreground leading-tight">{title}</h3>
      <p className="text-base text-foreground-lighter mt-1">{value}</p>
      <div className="flex flex-nowrap items-center gap-1.5 mt-5">
        {badges.map((b) => (
          <span
            key={b}
            className="inline-flex items-center whitespace-nowrap rounded-md border border-strong px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wide text-foreground-light"
          >
            {b}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProjectHomeView() {
  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-8">
      {/* Top Banner & Project Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-default">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
              {MOCK_PROJECT.name}
            </h1>
            <Badge variant="brand" className="text-xs px-2 py-0.5">
              Production
            </Badge>
          </div>
          <p className="text-sm text-foreground-lighter mt-1 flex items-center gap-2">
            <span className="font-mono">{MOCK_PROJECT.postgresVersion}</span>
          </p>
        </div>
      </div>

      {/* Database Resource Metrics / Quick Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Database Size"
          value={MOCK_PROJECT.diskSize}
          badges={[`Used of ${MOCK_PROJECT.diskLimit}`, '0.5%']}
        />
        <MetricCard
          title="Connections"
          value={`${MOCK_PROJECT.activeConnections} / ${MOCK_PROJECT.maxConnections}`}
          badges={['Pooler active', 'Healthy']}
        />
        <MetricCard
          title="Compute CPU"
          value={MOCK_PROJECT.cpuUsage}
          badges={['2-core Shared CPU', 'Normal load']}
        />
        <MetricCard
          title="RAM Usage"
          value={MOCK_PROJECT.memoryUsage}
          badges={['Buffer cache 618 MB']}
        />
      </div>

      {/* Sync Activity Bar Chart (matching user requested UI) */}
      <SyncActivityChart />

      {/* Service Infrastructure & Health Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          title="PostgreSQL Engine"
          value={MOCK_PROJECT.postgresVersion}
          badges={['en_US.UTF-8', 'logical (replica)']}
        />
        <MetricCard
          title="Row Level Security"
          value="6 of 6 tables"
          badges={['14 policies', 'Restricted']}
        />
        <MetricCard
          title="PgBouncer"
          value="Transaction"
          badges={['Port 6543', '200 clients']}
        />
      </div>


    </div>
  )
}
