'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Code2,
  Database,
  FileCode2,
  GitBranch,
  LayoutDashboard,
  Search,
  Table2 as Table,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'

type LiveTable = { schema: string; name: string; estimated_rows: string | number }

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tables, setTables] = useState<LiveTable[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const router = useRouter()
  const { database, branches, selectBranch } = useStudio()

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen(value => !value)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const loadTables = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true)
    setLoadError('')
    try {
      const liveTables = await api<LiveTable[]>(`/databases/${encodeURIComponent(database)}/tables`, { signal })
      if (!signal?.aborted) setTables(liveTables)
    } catch (error) {
      if (!signal?.aborted) setLoadError(errorMessage(error))
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [database])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void loadTables(controller.signal)
    return () => controller.abort()
  }, [open, loadTables])

  const navigateTo = (path: string) => {
    setOpen(false)
    setSearch('')
    router.push(path)
  }

  const filteredTables = useMemo(() => tables.filter(table =>
    `${table.schema}.${table.name}`.toLowerCase().includes(search.toLowerCase())
  ), [tables, search])
  const filteredBranches = useMemo(() => branches.filter(branch =>
    `${branch.name} ${branch.database_name}`.toLowerCase().includes(search.toLowerCase())
  ), [branches, search])
  const navigation = [
    { path: '/', name: 'Dashboard Home', icon: LayoutDashboard },
    { path: '/tables', name: 'Table Editor', icon: Table },
    { path: '/sql', name: 'SQL Editor', icon: Code2 },
    { path: '/visualizer', name: 'Schema Visualizer', icon: Database },
  ].filter(item => item.name.toLowerCase().includes(search.toLowerCase()))
  const showSnippetSection = !search || 'saved sql snippets'.includes(search.toLowerCase())

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search or jump to"
        className="flex items-center gap-2 px-2.5 py-1 text-xs text-foreground-lighter bg-surface-100 hover:bg-surface-200 border border-strong rounded-md transition-colors w-48 justify-between cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" />
          <span>Search or jump to...</span>
        </span>
        <kbd className="text-[10px] font-mono bg-surface-200 border border-default px-1 rounded text-foreground-muted">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 overflow-hidden sm:max-w-xl bg-overlay border-overlay">
          <div className="flex items-center border-b border-default px-3 py-2">
            <Search className="h-4 w-4 text-foreground-lighter mr-2 shrink-0" />
            <input
              aria-label="Search sections, tables, and branches"
              placeholder="Search sections, tables, branches..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-foreground-lighter outline-none"
              autoFocus
            />
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-4 text-xs">
            {navigation.length > 0 && (
              <div>
                <div className="text-[10px] font-medium tracking-wider uppercase text-foreground-lighter px-2 mb-1">
                  Navigation
                </div>
                <div className="space-y-0.5">
                  {navigation.map(item => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => navigateTo(item.path)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground text-left transition-colors cursor-pointer"
                      >
                        <Icon className="h-4 w-4 text-foreground-light" />
                        <span>{item.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {filteredTables.length > 0 && (
              <div>
                <div className="text-[10px] font-medium tracking-wider uppercase text-foreground-lighter px-2 mb-1">
                  Tables ({database})
                </div>
                <div className="space-y-0.5">
                  {filteredTables.map(table => (
                    <button
                      key={`${table.schema}.${table.name}`}
                      type="button"
                      onClick={() => navigateTo(`/tables?table=${encodeURIComponent(table.name)}&schema=${encodeURIComponent(table.schema)}`)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground text-left transition-colors cursor-pointer font-mono"
                    >
                      <span className="flex items-center gap-2">
                        <Table className="h-3.5 w-3.5 text-foreground-lighter" />
                        <span>{table.schema}.{table.name}</span>
                      </span>
                      <span className="text-[11px] text-foreground-lighter font-sans">
                        {Number(table.estimated_rows).toLocaleString()} rows
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {filteredBranches.length > 0 && (
              <div>
                <div className="text-[10px] font-medium tracking-wider uppercase text-foreground-lighter px-2 mb-1">
                  Branches
                </div>
                <div className="space-y-0.5">
                  {filteredBranches.map(branch => (
                    <button
                      key={branch.name}
                      type="button"
                      onClick={() => {
                        selectBranch(branch.name)
                        setOpen(false)
                        setSearch('')
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-surface-200 text-foreground text-left transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-foreground-lighter" />
                        <span>{branch.name}</span>
                      </span>
                      <span className="text-[11px] text-foreground-lighter font-mono">{branch.database_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showSnippetSection && (
              <div>
                <div className="text-[10px] font-medium tracking-wider uppercase text-foreground-lighter px-2 mb-1">
                  Saved SQL Snippets
                </div>
                <div className="flex items-start gap-2 px-2.5 py-2 text-foreground-lighter">
                  <FileCode2 className="h-3.5 w-3.5 text-foreground-muted shrink-0" />
                  <span>Saved snippets are not exposed by the connected API.</span>
                </div>
              </div>
            )}

            {isLoading && <div className="px-2 py-2 text-foreground-lighter">Loading live tables…</div>}
            {loadError && <div role="alert" className="px-2 py-2 text-red-400">{loadError}<button type="button" onClick={() => void loadTables()} className="ml-2 underline">Retry</button></div>}
            {!isLoading && !loadError && search && !navigation.length && !filteredTables.length && !filteredBranches.length && !showSnippetSection && (
              <div className="px-2 py-4 text-center text-xs text-foreground-lighter">No results found matching “{search}”</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
