'use client'

import React, { useMemo, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import type { ActivityTelemetry, ActivityBucket } from '@/lib/dashboard-metrics'
import { LoadingIndicator } from '@/components/ui/spinner'

type MetricMode = 'runs' | 'rows'
const EMPTY_BUCKETS: ActivityBucket[] = []

const runKeys = ['succeeded', 'slow', 'failed'] as const
const rowKeys = ['inserted', 'updated', 'deleted'] as const
const colorNames = {
  succeeded: 'Succeeded',
  slow: 'Slow',
  failed: 'Failed',
  inserted: 'Inserted',
  updated: 'Updated',
  deleted: 'Deleted',
} as const

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

function bucketTotals(bucket: ActivityBucket, mode: MetricMode): number[] | null {
  const metrics = mode === 'runs' ? bucket.runs : bucket.rows
  if (!metrics) return null
  return mode === 'runs'
    ? [(metrics as NonNullable<ActivityBucket['runs']>).succeeded, (metrics as NonNullable<ActivityBucket['runs']>).slow, (metrics as NonNullable<ActivityBucket['runs']>).failed]
    : [(metrics as NonNullable<ActivityBucket['rows']>).inserted, (metrics as NonNullable<ActivityBucket['rows']>).updated, (metrics as NonNullable<ActivityBucket['rows']>).deleted]
}

export function SyncActivityChart({ activity, loading = false }: { activity: ActivityTelemetry | null; loading?: boolean }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [metricMode, setMetricMode] = useState<MetricMode>('runs')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const buckets = activity?.buckets ?? EMPTY_BUCKETS
  const keys = metricMode === 'runs' ? runKeys : rowKeys
  const totals = useMemo(
    () => buckets.map(bucket => bucketTotals(bucket, metricMode)),
    [buckets, metricMode],
  )
  const observed = totals.filter((values): values is number[] => values !== null)
  const totalsByCategory = [0, 1, 2].map(index => observed.reduce((sum, values) => sum + values[index], 0))
  const grandTotal = totalsByCategory.reduce((sum, value) => sum + value, 0)
  const peak = Math.max(0, ...observed.map(values => values.reduce((sum, value) => sum + value, 0)))
  const scaleMax = peak > 0 ? Math.ceil(peak / 5) * 5 : 0
  const patterns = {
    succeeded: { background: isDark ? 'repeating-linear-gradient(-45deg, #10b981 0px, #10b981 2.5px, rgba(16, 185, 129, 0.25) 2.5px, rgba(16, 185, 129, 0.25) 5.5px)' : 'repeating-linear-gradient(-45deg, #26c281 0px, #26c281 2.5px, #a8ebd0 2.5px, #a8ebd0 5.5px)' },
    slow: { background: isDark ? 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 2.5px, rgba(245, 158, 11, 0.25) 2.5px, rgba(245, 158, 11, 0.25) 5.5px)' : 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 2.5px, #fde68a 2.5px, #fde68a 5.5px)' },
    failed: { background: isDark ? 'repeating-linear-gradient(-45deg, #ef4444 0px, #ef4444 2.5px, rgba(239, 68, 68, 0.25) 2.5px, rgba(239, 68, 68, 0.25) 5.5px)' : 'repeating-linear-gradient(-45deg, #ef4444 0px, #ef4444 2.5px, #fca5a5 2.5px, #fca5a5 5.5px)' },
  }
  const colors = metricMode === 'runs'
    ? [patterns.succeeded, patterns.slow, patterns.failed]
    : [patterns.succeeded, patterns.slow, patterns.failed]
  const keysForTooltip = metricMode === 'runs' ? runKeys : rowKeys
  const unit = metricMode === 'runs' ? 'runs' : 'rows'
  const rangeLabel = '24 hours'

  return (
    <section className="relative flex flex-col rounded-xl border border-default bg-studio p-6 shadow-xs transition-colors hover:border-strong" aria-labelledby="sync-activity-title" aria-label={loading ? 'Loading sync activity' : undefined} aria-busy={loading}>
      <div className="flex flex-col justify-between gap-4 pb-4 sm:flex-row sm:items-start">
        <div>
          <h2 id="sync-activity-title" className="text-base font-semibold leading-tight tracking-tight text-foreground">Sync Activity</h2>
          {metricMode === 'runs' && activity?.monitoring?.message && (
            <p role="status" className="mt-1 text-xs text-amber-600 dark:text-amber-400">{activity.monitoring.message}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4 self-start sm:gap-5">
          <div className="flex items-center gap-3 text-xs text-foreground-lighter" aria-label={metricMode === 'runs' ? 'Run status legend' : 'Row changes legend'}>
            {keys.map((key, index) => (
              <span key={key} className="flex items-center gap-1.5 font-normal">
                <span className={`inline-block h-2 w-2 rounded-full ${index === 0 ? 'bg-[#10b981]' : index === 1 ? 'bg-[#f59e0b]' : 'bg-[#ef4444]'}`} />
                {colorNames[key]}
              </span>
            ))}
          </div>
          <div className="flex items-center rounded-lg border border-default bg-surface-100 p-0.5" role="group" aria-label="Activity metric">
            {(['runs', 'rows'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                aria-label={`Show ${mode === 'runs' ? 'run activity' : 'row changes'}`}
                aria-pressed={metricMode === mode}
                onClick={() => setMetricMode(mode)}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${metricMode === mode ? 'border border-strong bg-studio font-medium text-foreground shadow-xs' : 'font-normal text-foreground-lighter hover:text-foreground'}`}
              >
                {mode === 'runs' ? 'Runs' : 'Rows'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingIndicator label="Loading sync activity" className="h-52" size={28} />
      ) : !activity ? (
        <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-strong text-sm text-foreground-lighter">
          Activity telemetry is unavailable.
        </div>
      ) : buckets.length === 0 ? (
        <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-strong text-sm text-foreground-lighter">
          No elapsed activity bins yet.
        </div>
      ) : (
        <>
          <div className="relative pt-4">
            <div className="relative grid h-44 w-full grid-cols-[repeat(24,minmax(0,1fr))] items-end gap-1.5 sm:h-48 sm:gap-2 md:h-52 md:gap-2.5" role="group" aria-label={`${metricMode === 'runs' ? 'Run' : 'Row change'} activity, ${rangeLabel}`}>
              {buckets.map((bucket, index) => {
                const values = totals[index]
                const total = values?.reduce((sum, value) => sum + value, 0) ?? 0
                const height = values && total > 0 && scaleMax > 0 ? Math.min(100, total / scaleMax * 100) : 0
                const isHovered = hoveredIndex === index
                const time = `${formatTime(bucket.startAt)}–${formatTime(bucket.endAt)}`
                const accessibleSummary = values === null
                  ? `${time}: No recorded observations`
                  : `${time}: ${keysForTooltip.map((key, valueIndex) => `${colorNames[key]} ${formatCount(values[valueIndex])}`).join(', ')}`
                return (
                  <div
                    key={`${bucket.startAt}-${index}`}
                    className="group relative flex h-full w-full cursor-default flex-col items-center justify-end"
                    role="img"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex(null)}
                    tabIndex={0}
                    aria-label={accessibleSummary}
                  >
                    {isHovered && (
                      <div role="tooltip" className="pointer-events-none absolute -top-[4.5rem] z-30 max-w-[min(24rem,90vw)] rounded-lg border border-strong bg-white dark:bg-surface-100 px-2.5 py-1.5 text-[11px] text-foreground shadow-lg">
                        <div className="font-semibold">{time}</div>
                        {values === null ? (
                          <div className="mt-0.5 text-[10px] text-foreground-lighter">No recorded observations</div>
                        ) : (
                          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-foreground-lighter">
                            {keysForTooltip.map((key, valueIndex) => (
                              <span key={key} className={valueIndex === 0 ? 'font-medium text-[#10b981]' : valueIndex === 1 ? 'font-medium text-[#f59e0b]' : 'font-medium text-[#ef4444]'}>
                                {colorNames[key]}: {formatCount(values[valueIndex])}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="relative flex h-full w-full flex-col justify-end">
                      <div className={`absolute inset-0 rounded-md bg-surface-200 transition-colors ${isHovered ? 'bg-surface-300' : ''}`} />
                      {values !== null && total > 0 && (
                        <div className="relative flex w-full shrink-0 flex-col justify-end overflow-hidden rounded-md shadow-2xs transition-[height] duration-300" style={{ height: `${height}%` }}>
                          {values.map((value, valueIndex) => value > 0 ? (
                            <div key={keysForTooltip[valueIndex]} className="w-full shrink-0" style={{ height: `${value / total * 100}%`, ...colors[valueIndex] }} />
                          ) : null).reverse()}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid w-full grid-cols-[repeat(24,minmax(0,1fr))] gap-1.5 pt-2 sm:gap-2 md:gap-2.5" aria-hidden="true">
              {buckets.map((bucket, index) => {
                const onlyOneBin = buckets.length === 1
                const showLabel = onlyOneBin
                  ? index === 0
                  : index === 0 || index === buckets.length - 1 || index % Math.max(1, Math.floor(buckets.length / 4)) === 0
                return (
                  <div key={`${bucket.startAt}-label`} className="w-full text-center">
                    {showLabel
                      ? <span className="block truncate font-sans text-[10px] text-foreground-lighter sm:text-[11px]">{!onlyOneBin && index === buckets.length - 1 ? 'Now' : formatTime(bucket.startAt)}</span>
                      : null}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
      {!loading && activity && observed.length > 0 && grandTotal === 0 && (
        <p className="mt-2 text-[11px] text-foreground-muted">Observed bins contain zero {unit}; zero values are shown without a bar.</p>
      )}
    </section>
  )
}
