'use client'

import React, { useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'

export interface SyncHourData {
  id: number
  label?: string
  fullTime: string
  succeeded: number
  slow: number
  failed: number
}

// 24-hour exact dataset corresponding to the user's dashboard image
// Total runs: 727, landed: 99.0%
const RUNS_DATA: SyncHourData[] = [
  { id: 0, fullTime: '15:00', succeeded: 34, slow: 0, failed: 0 },
  { id: 1, fullTime: '16:00', succeeded: 34, slow: 0, failed: 0 },
  { id: 2, fullTime: '17:00', succeeded: 34, slow: 0, failed: 0 },
  { id: 3, label: '18:00', fullTime: '18:00', succeeded: 35, slow: 0, failed: 0 },
  { id: 4, fullTime: '19:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 5, fullTime: '20:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 6, fullTime: '21:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 7, label: '22:00', fullTime: '22:00', succeeded: 29, slow: 0, failed: 1 },
  { id: 8, fullTime: '23:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 9, fullTime: '00:00', succeeded: 31, slow: 0, failed: 0 },
  { id: 10, fullTime: '01:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 11, label: '02:00', fullTime: '02:00', succeeded: 27, slow: 4, failed: 0 },
  { id: 12, fullTime: '03:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 13, fullTime: '04:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 14, fullTime: '05:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 15, label: '06:00', fullTime: '06:00', succeeded: 30, slow: 1, failed: 0 },
  { id: 16, fullTime: '07:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 17, fullTime: '08:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 18, fullTime: '09:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 19, label: '10:00', fullTime: '10:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 20, fullTime: '11:00', succeeded: 30, slow: 0, failed: 0 },
  { id: 21, fullTime: '12:00', succeeded: 30, slow: 1, failed: 0 },
  { id: 22, fullTime: '13:00', succeeded: 26, slow: 0, failed: 4 },
  { id: 23, label: 'Now', fullTime: '14:00 (Now)', succeeded: 14, slow: 0, failed: 2 },
]

// Corresponding dataset for the "Rows" toggle
const ROWS_DATA: SyncHourData[] = [
  { id: 0, fullTime: '15:00', succeeded: 68, slow: 0, failed: 0 },
  { id: 1, fullTime: '16:00', succeeded: 67, slow: 0, failed: 0 },
  { id: 2, fullTime: '17:00', succeeded: 69, slow: 0, failed: 0 },
  { id: 3, label: '18:00', fullTime: '18:00', succeeded: 72, slow: 0, failed: 0 },
  { id: 4, fullTime: '19:00', succeeded: 58, slow: 0, failed: 0 },
  { id: 5, fullTime: '20:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 6, fullTime: '21:00', succeeded: 59, slow: 0, failed: 0 },
  { id: 7, label: '22:00', fullTime: '22:00', succeeded: 57, slow: 0, failed: 2 },
  { id: 8, fullTime: '23:00', succeeded: 61, slow: 0, failed: 0 },
  { id: 9, fullTime: '00:00', succeeded: 62, slow: 0, failed: 0 },
  { id: 10, fullTime: '01:00', succeeded: 59, slow: 0, failed: 0 },
  { id: 11, label: '02:00', fullTime: '02:00', succeeded: 54, slow: 7, failed: 0 },
  { id: 12, fullTime: '03:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 13, fullTime: '04:00', succeeded: 59, slow: 0, failed: 0 },
  { id: 14, fullTime: '05:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 15, label: '06:00', fullTime: '06:00', succeeded: 61, slow: 2, failed: 0 },
  { id: 16, fullTime: '07:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 17, fullTime: '08:00', succeeded: 59, slow: 0, failed: 0 },
  { id: 18, fullTime: '09:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 19, label: '10:00', fullTime: '10:00', succeeded: 61, slow: 0, failed: 0 },
  { id: 20, fullTime: '11:00', succeeded: 60, slow: 0, failed: 0 },
  { id: 21, fullTime: '12:00', succeeded: 58, slow: 2, failed: 0 },
  { id: 22, fullTime: '13:00', succeeded: 52, slow: 0, failed: 8 },
  { id: 23, label: 'Now', fullTime: '14:00 (Now)', succeeded: 28, slow: 0, failed: 4 },
]

export function SyncActivityChart() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [metricMode, setMetricMode] = useState<'runs' | 'rows'>('runs')
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const isRuns = metricMode === 'runs'
  const data = isRuns ? RUNS_DATA : ROWS_DATA
  const maxValue = isRuns ? 45 : 90

  // Summary statistics
  const totalRuns = 727
  const landedRate = '99.0%'

  // Diagonal hatched patterns optimized for both Dark and Light mode
  // Succeeded: mint green stripes
  const patternSucceeded = {
    background: isDark
      ? 'repeating-linear-gradient(-45deg, #10b981 0px, #10b981 2.5px, rgba(16, 185, 129, 0.25) 2.5px, rgba(16, 185, 129, 0.25) 5.5px)'
      : 'repeating-linear-gradient(-45deg, #26c281 0px, #26c281 2.5px, #a8ebd0 2.5px, #a8ebd0 5.5px)',
  }

  // Slow: golden amber stripes
  const patternSlow = {
    background: isDark
      ? 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 2.5px, rgba(245, 158, 11, 0.25) 2.5px, rgba(245, 158, 11, 0.25) 5.5px)'
      : 'repeating-linear-gradient(-45deg, #f59e0b 0px, #f59e0b 2.5px, #fde68a 2.5px, #fde68a 5.5px)',
  }

  // Failed: coral red stripes
  const patternFailed = {
    background: isDark
      ? 'repeating-linear-gradient(-45deg, #ef4444 0px, #ef4444 2.5px, rgba(239, 68, 68, 0.25) 2.5px, rgba(239, 68, 68, 0.25) 5.5px)'
      : 'repeating-linear-gradient(-45deg, #ef4444 0px, #ef4444 2.5px, #fca5a5 2.5px, #fca5a5 5.5px)',
  }

  return (
    <div className="relative flex flex-col rounded-xl border border-default bg-studio p-6 shadow-xs transition-colors hover:border-strong">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground tracking-tight leading-tight">
            Sync Activity
          </h2>
          <p className="text-xs text-foreground-lighter mt-1">
            {isRuns ? `${totalRuns} runs in 24 hours, ${landedRate} landed` : '1.42M rows in 24 hours, 99.4% landed'}
          </p>
        </div>

        {/* Legend and Toggle */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-5 self-start">
          {/* Legend Items */}
          <div className="flex items-center gap-3 text-xs text-foreground-lighter">
            <span className="flex items-center gap-1.5 font-normal">
              <span className="inline-block h-2 w-2 rounded-full bg-[#10b981]" />
              Succeeded
            </span>
            <span className="flex items-center gap-1.5 font-normal">
              <span className="inline-block h-2 w-2 rounded-full bg-[#f59e0b]" />
              Pending
            </span>
            <span className="flex items-center gap-1.5 font-normal">
              <span className="inline-block h-2 w-2 rounded-full bg-[#ef4444]" />
              Failed
            </span>
          </div>

          {/* Runs / Rows Toggle */}
          <div className="flex items-center rounded-lg border border-default bg-surface-100 p-0.5">
            <button
              type="button"
              onClick={() => setMetricMode('runs')}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                isRuns
                  ? 'bg-studio font-medium text-foreground shadow-xs border border-strong'
                  : 'font-normal text-foreground-lighter hover:text-foreground'
              }`}
            >
              Runs
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('rows')}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                !isRuns
                  ? 'bg-studio font-medium text-foreground shadow-xs border border-strong'
                  : 'font-normal text-foreground-lighter hover:text-foreground'
              }`}
            >
              Rows
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative pt-4">
        {/* Main Chart Area */}
        <div className="w-full flex items-end gap-1.5 sm:gap-2 md:gap-2.5 h-44 sm:h-48 md:h-52 relative">
            {data.map((item, index) => {
              const total = item.succeeded + item.slow + item.failed
              const totalPercent = Math.min(100, Math.max(0, (total / maxValue) * 100))
              const succeededPercent = total > 0 ? (item.succeeded / total) * 100 : 0
              const slowPercent = total > 0 ? (item.slow / total) * 100 : 0
              const failedPercent = total > 0 ? (item.failed / total) * 100 : 0

              const isHovered = hoveredIndex === index

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="flex-1 h-full relative flex flex-col justify-end items-center group cursor-pointer"
                >
                  {/* Floating Tooltip */}
                  {isHovered && (
                    <div className="absolute -top-14 z-30 pointer-events-none rounded-lg border border-strong bg-surface-100 px-2.5 py-1.5 text-[11px] font-sans text-foreground shadow-lg whitespace-nowrap transition-opacity">
                      <div className="font-semibold">{item.fullTime}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-foreground-lighter">
                        <span className="text-[#10b981] font-medium">Succeeded: {item.succeeded}</span>
                        {item.slow > 0 && <span className="text-[#f59e0b] font-medium">Slow: {item.slow}</span>}
                        {item.failed > 0 && <span className="text-[#ef4444] font-medium">Failed: {item.failed}</span>}
                      </div>
                    </div>
                  )}

                  {/* Column Pill: Full Height Track */}
                  <div className="relative w-full h-full flex flex-col justify-end">
                    {/* Background Soft Track (Theme Adapted) */}
                    <div
                      className={`absolute inset-0 rounded-md bg-surface-200 transition-colors ${
                        isHovered ? 'bg-surface-300' : ''
                      }`}
                    />

                    {/* Colored Stacked Bar with Hatched Pattern */}
                    <div
                      className="relative w-full rounded-md overflow-hidden flex flex-col justify-end shadow-2xs transition-all duration-300"
                      style={{ height: `${totalPercent}%` }}
                    >
                      {/* Failed Segment (Top) */}
                      {item.failed > 0 && (
                        <div
                          style={{
                            height: `${failedPercent}%`,
                            ...patternFailed,
                          }}
                          className="w-full shrink-0"
                        />
                      )}

                      {/* Slow Segment (Middle) */}
                      {item.slow > 0 && (
                        <div
                          style={{
                            height: `${slowPercent}%`,
                            ...patternSlow,
                          }}
                          className="w-full shrink-0"
                        />
                      )}

                      {/* Succeeded Segment (Bottom) */}
                      {item.succeeded > 0 && (
                        <div
                          style={{
                            height: `${succeededPercent}%`,
                            ...patternSucceeded,
                          }}
                          className="w-full shrink-0"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
        </div>

        {/* X-Axis Labels Row */}
        <div className="w-full flex items-center gap-1.5 sm:gap-2 md:gap-2.5 pt-2">
          {data.map((item) => (
            <div key={item.id} className="flex-1 text-center">
              {item.label ? (
                <span className="text-[11px] sm:text-xs text-foreground-lighter font-sans select-none block truncate">
                  {item.label}
                </span>
              ) : (
                <span className="invisible text-[11px] select-none block">&nbsp;</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
