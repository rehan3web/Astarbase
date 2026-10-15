'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  BarChart3,
  Check,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  copyResultsAsMarkdown,
  copyResultsAsJson,
  copyResultsAsCsv,
  downloadResultsAsCsv,
} from '@/components/sql/export/SqlExportUtils'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/providers/NotificationProvider'

export interface QueryResult {
  columns: string[]
  rows: Record<string, any>[]
  executionTimeMs: number
  status: 'success' | 'error'
  rowCount: number
  message?: string
}

interface SqlResultsPaneProps {
  queryResult: QueryResult | null
  activeBottomTab?: 'results' | 'chart'
  onActiveBottomTabChange?: (tab: 'results' | 'chart') => void
  onRunQuery?: () => void
  onDownloadCsv?: () => void
}

export function SqlResultsPane({
  queryResult,
  activeBottomTab = 'results',
  onActiveBottomTabChange,
  onRunQuery,
  onDownloadCsv,
}: SqlResultsPaneProps) {
  const [internalTab, setInternalTab] = useState<'results' | 'chart'>('results')
  const [isExpanded, setIsExpanded] = useState(false)
  const { notify } = useNotifications()

  const activeTab = onActiveBottomTabChange ? activeBottomTab : internalTab
  const handleTabChange = (tab: 'results' | 'chart') => {
    if (onActiveBottomTabChange) {
      onActiveBottomTabChange(tab)
    } else {
      setInternalTab(tab)
    }
  }

  const handleCopyMarkdown = useCallback(async () => {
    if (!queryResult) return
    try { await copyResultsAsMarkdown(queryResult); notify('Copied results as Markdown to clipboard') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not copy results to clipboard', 'error') }
  }, [queryResult, notify])

  const handleCopyJson = useCallback(async () => {
    if (!queryResult) return
    try { await copyResultsAsJson(queryResult); notify('Copied results as JSON to clipboard') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not copy results to clipboard', 'error') }
  }, [queryResult, notify])

  const handleCopyCsv = useCallback(async () => {
    if (!queryResult) return
    try { await copyResultsAsCsv(queryResult); notify('Copied results as CSV to clipboard') }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not copy results to clipboard', 'error') }
  }, [queryResult, notify])

  const handleDownload = useCallback(() => {
    if (!queryResult) return
    if (onDownloadCsv) onDownloadCsv()
    else {
      try { downloadResultsAsCsv(queryResult); notify('Query results exported as CSV') }
      catch (error) { notify(error instanceof Error ? error.message : 'Could not export query results', 'error') }
    }
  }, [queryResult, onDownloadCsv, notify])

  // Keyboard shortcuts matching Supabase Studio:
  // Shift + Ctrl + M: Markdown
  // Shift + Ctrl + J: JSON
  // Shift + Ctrl + C: CSV
  // Shift + Ctrl + D: Download CSV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && queryResult) {
        const key = e.key.toLowerCase()
        if (key === 'm') {
          e.preventDefault()
          handleCopyMarkdown()
        } else if (key === 'j') {
          e.preventDefault()
          handleCopyJson()
        } else if (key === 'c') {
          e.preventDefault()
          handleCopyCsv()
        } else if (key === 'd') {
          e.preventDefault()
          handleDownload()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [queryResult, handleCopyMarkdown, handleCopyJson, handleCopyCsv, handleDownload])

  return (
    <div
      className={cn(
        isExpanded ? 'h-[28rem]' : 'h-72',
        'shrink-0 flex flex-col bg-surface-100 overflow-hidden border-t border-default transition-all duration-200 relative'
      )}
    >
      {/* Results Tab Bar */}
      <div className="h-9 shrink-0 border-b border-default bg-dash-sidebar flex items-center justify-between px-3 select-none">
        {/* Tabs on Left: Results | Chart */}
        <div className="flex items-center gap-4 h-full">
          <button
            type="button"
            onClick={() => handleTabChange('results')}
            className={cn(
              'h-full text-xs font-medium border-b-2 px-1 transition-colors cursor-pointer flex items-center',
              activeTab === 'results'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-foreground-lighter hover:text-foreground'
            )}
          >
            <span>Results</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('chart')}
            disabled
            title="Chart configuration is not available"
            className={cn(
              'h-full text-xs font-medium border-b-2 px-1 transition-colors cursor-pointer flex items-center',
              activeTab === 'chart'
                ? 'border-foreground text-foreground'
                : 'border-transparent text-foreground-lighter hover:text-foreground'
            )}
          >
            <span>Chart</span>
          </button>
        </div>

        {/* Right side controls */}
        {queryResult ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-foreground font-normal">
              {queryResult.rowCount} {queryResult.rowCount === 1 ? 'row' : 'rows'}{' '}
              <span className="text-foreground-lighter">({queryResult.executionTimeMs} ms)</span>
            </span>

            {/* Export Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-7 px-2.5 flex items-center gap-1.5 text-xs text-foreground bg-surface-100 hover:bg-surface-200 border border-default rounded-md transition-colors cursor-pointer shadow-2xs"
                >
                  <span>Export</span>
                  <ChevronDown className="h-3 w-3 text-foreground-lighter" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[17.5rem] w-max p-1 bg-overlay border border-overlay shadow-xl rounded-md"
              >
                <DropdownMenuItem
                  onClick={handleCopyMarkdown}
                  className="flex items-center justify-between gap-4 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded text-foreground whitespace-nowrap"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Copy className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                    <span>Copy as Markdown</span>
                  </span>
                  <span className="text-[10px] text-foreground-lighter border border-default px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">
                    ⇧ Ctrl M
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleCopyJson}
                  className="flex items-center justify-between gap-4 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded text-foreground whitespace-nowrap"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Copy className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                    <span>Copy as JSON</span>
                  </span>
                  <span className="text-[10px] text-foreground-lighter border border-default px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">
                    ⇧ Ctrl J
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleCopyCsv}
                  className="flex items-center justify-between gap-4 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded text-foreground whitespace-nowrap"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Copy className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                    <span>Copy as CSV</span>
                  </span>
                  <span className="text-[10px] text-foreground-lighter border border-default px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">
                    ⇧ Ctrl C
                  </span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={handleDownload}
                  className="flex items-center justify-between gap-4 px-2.5 py-1.5 text-xs cursor-pointer hover:bg-surface-200 rounded text-foreground whitespace-nowrap"
                >
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Download className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                    <span>Download CSV</span>
                  </span>
                  <span className="text-[10px] text-foreground-lighter border border-default px-1.5 py-0.5 rounded font-mono shrink-0 whitespace-nowrap">
                    ⇧ Ctrl D
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Expand / Collapse Height Toggle */}
            <div className="flex flex-col items-center justify-center text-foreground-lighter hover:text-foreground cursor-pointer">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="p-1 hover:text-foreground transition-colors"
                title={isExpanded ? 'Restore pane height' : 'Expand pane height'}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="p-1 text-foreground-lighter hover:text-foreground transition-colors"
              title={isExpanded ? 'Restore pane height' : 'Expand pane height'}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Pane Content */}
      <div className="flex-1 overflow-auto bg-studio">
        {queryResult?.message && <pre role={queryResult.status === 'error' ? 'alert' : 'status'} className={cn('p-4 text-xs whitespace-pre-wrap', queryResult.status === 'error' ? 'text-red-400' : 'text-foreground-lighter')}>{queryResult.message}</pre>}
        {/* State 1: No query run yet */}
        {!queryResult ? (
          <div className="p-6 text-sm text-foreground-lighter flex items-center gap-1.5 select-none">
            <span>Click</span>
            <button
              type="button"
              onClick={onRunQuery}
              className="inline-flex items-center px-2 py-0.5 rounded-md border border-default bg-surface-100 text-xs font-medium text-foreground hover:bg-surface-200 transition-colors cursor-pointer"
            >
              Run
            </button>
            <span>to execute your query</span>
          </div>
        ) : activeTab === 'results' ? (
          /* State 2: Query result table */
          <table className="w-full border-collapse text-left text-xs font-mono select-text">
            <thead className="sticky top-0 z-10 bg-surface-100 border-b border-default">
              <tr>
                {queryResult.columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 border-r border-default text-foreground font-semibold whitespace-nowrap bg-surface-100"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {queryResult.rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-surface-100/60 transition-colors">
                  {queryResult.columns.map((col) => {
                    const val = row[col]
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 border-r border-default whitespace-nowrap max-w-sm truncate text-foreground"
                      >
                        {val === null || val === undefined ? (
                          <span className="text-foreground-muted italic">null</span>
                        ) : typeof val === 'boolean' ? (
                          <span className={val ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                            {String(val)}
                          </span>
                        ) : (
                          <span>{String(val)}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* State 3: Chart tab */
          <div className="p-6 flex flex-col items-center justify-center h-full text-center">
            <BarChart3 className="h-8 w-8 text-foreground-lighter mb-2" />
            <div className="text-sm font-medium text-foreground">Chart View</div>
            <p className="text-xs text-foreground-lighter mt-1 max-w-sm">
              Visual representation for {queryResult.rowCount} rows. Select numeric metrics to visualize query distributions.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
