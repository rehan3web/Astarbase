'use client'

import React, { useEffect, useState } from 'react'
import { Table2 as TableIcon } from 'lucide-react'
import { TableDefinition } from '@/lib/mock-data'

export interface RecentTableItem {
  tableId: string
  openedAt: number
}

interface TableNewTabViewProps {
  recentItems: RecentTableItem[]
  getTable: (id: string) => TableDefinition | undefined
  onCreateTable: () => void
  onOpenTable: (table: TableDefinition) => void
}

function formatRelativeTime(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 45) return 'a few seconds ago'
  if (seconds < 90) return 'a minute ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 45) return `${minutes} minutes ago`
  if (minutes < 90) return 'an hour ago'
  const hours = Math.round(minutes / 60)
  if (hours < 22) return `${hours} hours ago`
  if (hours < 36) return 'a day ago'
  return `${Math.round(hours / 24)} days ago`
}

export function TableNewTabView({
  recentItems,
  getTable,
  onCreateTable,
  onOpenTable,
}: TableNewTabViewProps) {
  // Re-render periodically so relative times stay fresh
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [])

  const items = recentItems
    .map((r) => ({ ...r, table: getTable(r.tableId) }))
    .filter((r): r is RecentTableItem & { table: TableDefinition } => !!r.table)

  return (
    <div className="flex-1 overflow-y-auto bg-studio">
      <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
        {/* Create a table card */}
        <button
          id="new-tab-create-table"
          type="button"
          onClick={onCreateTable}
          className="group w-full max-w-[300px] flex items-start gap-3 p-3 rounded-lg border border-default bg-surface-100 hover:bg-surface-200 hover:border-strong shadow-xs transition-colors text-left cursor-pointer"
        >
          <span className="h-8 w-8 shrink-0 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center transition-transform group-hover:scale-105">
            <TableIcon className="h-4 w-4" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">Create a table</span>
            <span className="text-xs text-foreground-light leading-snug">
              Design and create a new database table
            </span>
          </span>
        </button>

        {/* Recent items */}
        <section className="space-y-3">
          <h2 className="text-sm text-foreground">Recent items</h2>
          {items.length === 0 ? (
            <p className="text-xs text-foreground-lighter">No recently opened tables.</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map(({ tableId, openedAt, table }) => (
                <li key={tableId}>
                  <button
                    type="button"
                    onClick={() => onOpenTable(table)}
                    className="group w-full flex items-center gap-3 py-1.5 px-1 -mx-1 rounded text-left cursor-pointer hover:bg-surface-100 transition-colors"
                  >
                    <span className="h-6 w-6 shrink-0 rounded border border-default bg-surface-100 flex items-center justify-center text-foreground-lighter group-hover:text-foreground transition-colors">
                      <TableIcon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm truncate">
                      <span className="text-foreground-lighter">{table.schema}.</span>
                      <span className="text-foreground">{table.name}</span>
                    </span>
                    <span className="flex-1 border-t border-default mx-2 min-w-[24px]" />
                    <span className="text-xs text-foreground-lighter shrink-0">
                      {formatRelativeTime(openedAt, now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
