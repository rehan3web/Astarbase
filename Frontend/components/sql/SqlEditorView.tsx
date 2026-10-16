'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SqlFolder, SqlSnippet } from '@/lib/mock-data'
import { SqlSidebar } from '@/components/sql/editor/SqlSidebar'
import { SqlTabBar } from '@/components/sql/editor/SqlTabBar'
import { SqlActionToolbar } from '@/components/sql/editor/SqlActionToolbar'
import { SqlCodeEditor } from '@/components/sql/editor/SqlCodeEditor'
import { SqlResultsPane, QueryResult } from '@/components/sql/result/SqlResultsPane'
import { downloadResultsAsCsv } from '@/components/sql/export/SqlExportUtils'
import { api, SqlResponse, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { parseSqlExecutionOutput } from '@/lib/sql-results'
import { useNotifications } from '@/components/providers/NotificationProvider'

type SqlLibrary = { folders: SqlFolder[]; snippets: SqlSnippet[] }
type Visibility = 'private' | 'shared'

const isScratchSnippet = (snippet: SqlSnippet) => snippet.id.startsWith('scratch-')

const makeScratch = (): SqlSnippet => ({
  id: 'scratch-initial',
  name: 'Untitled query',
  description: 'Run SQL against the selected live database',
  sql: 'SELECT current_database(), current_user;',
  inserted_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  isFavorite: false,
  visibility: 'private',
})

export function SqlEditorView() {
  const { database } = useStudio()
  const { notify } = useNotifications()
  const [rawOutput, setRawOutput] = useState('')
  const executionVersion = useRef(0)
  const [folders, setFolders] = useState<SqlFolder[]>([])
  const [snippets, setSnippets] = useState<SqlSnippet[]>([makeScratch()])
  const [search, setSearch] = useState('')
  const [activeSnippetId, setActiveSnippetId] = useState('scratch-initial')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [openTabIds, setOpenTabIds] = useState<string[]>(['scratch-initial'])
  const [draftSqlMap, setDraftSqlMap] = useState<Record<string, string>>({})
  const [currentSql, setCurrentSql] = useState('SELECT current_database(), current_user;')
  const [isExecuting, setIsExecuting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [busyAction, setBusyAction] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'chart'>('results')

  const libraryMutationLock = useRef(false)
  const snippetsRef = useRef(snippets)
  const activeSnippetIdRef = useRef(activeSnippetId)
  const currentSqlRef = useRef(currentSql)
  const draftSqlMapRef = useRef(draftSqlMap)

  const activeSnippet = snippets.find((snippet) => snippet.id === activeSnippetId) ?? snippets[0]

  const setSnippetsSnapshot = useCallback((next: SqlSnippet[]) => {
    snippetsRef.current = next
    setSnippets(next)
  }, [])
  const setActiveSnippetSnapshot = useCallback((id: string) => {
    activeSnippetIdRef.current = id
    setActiveSnippetId(id)
  }, [])
  const setCurrentSqlSnapshot = useCallback((sql: string) => {
    currentSqlRef.current = sql
    setCurrentSql(sql)
  }, [])
  const setDraftSqlSnapshot = useCallback((next: Record<string, string>) => {
    draftSqlMapRef.current = next
    setDraftSqlMap(next)
  }, [])
  const beginLibraryMutation = useCallback(() => {
    if (isLoading) {
      notify('The snippet library is still loading', 'warning')
      return false
    }
    if (libraryMutationLock.current) {
      notify('A snippet library change is already in progress', 'warning')
      return false
    }
    libraryMutationLock.current = true
    setBusyAction(true)
    return true
  }, [isLoading, notify])
  const endLibraryMutation = useCallback(() => {
    libraryMutationLock.current = false
    setBusyAction(false)
  }, [])

  const applyLibrary = useCallback((library: SqlLibrary, excludedScratchIds: string[] = []) => {
    const excluded = new Set(excludedScratchIds)
    const scratchSnippets = snippetsRef.current.filter(
      (snippet) => isScratchSnippet(snippet) && !excluded.has(snippet.id)
    )
    const nextSnippets = [...(library.snippets ?? []), ...scratchSnippets]
    setFolders(library.folders ?? [])
    snippetsRef.current = nextSnippets
    setSnippets(nextSnippets)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    api<SqlLibrary>('/sql/library', { signal: controller.signal })
      .then((library) => {
        if (controller.signal.aborted) return
        setFolders(library.folders ?? [])
        const savedSnippets = library.snippets ?? []
        const scratch = snippetsRef.current.find(isScratchSnippet)
        const hasScratchEdits = !!scratch && (
          currentSqlRef.current !== scratch.sql ||
          draftSqlMapRef.current[scratch.id] !== undefined
        )
        if (savedSnippets.length) {
          setSnippetsSnapshot([...savedSnippets, ...(hasScratchEdits && scratch ? [scratch] : [])])
          if (!hasScratchEdits || !scratch) {
            setActiveSnippetSnapshot(savedSnippets[0].id)
            setOpenTabIds([savedSnippets[0].id])
            setCurrentSqlSnapshot(savedSnippets[0].sql)
          } else {
            setOpenTabIds([savedSnippets[0].id, scratch.id])
          }
        } else {
          const initial = scratch ?? makeScratch()
          setSnippetsSnapshot([initial])
          if (!hasScratchEdits) setCurrentSqlSnapshot(initial.sql)
          setActiveSnippetSnapshot(initial.id)
          setOpenTabIds([initial.id])
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) notify(errorMessage(error), 'error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })
    return () => controller.abort()
  }, [notify, setSnippetsSnapshot, setActiveSnippetSnapshot, setCurrentSqlSnapshot])

  const unsavedSnippetIds = useMemo(() => {
    const unsaved = new Set<string>()
    for (const [id, sql] of Object.entries(draftSqlMap)) {
      const snippet = snippets.find((item) => item.id === id)
      if (snippet && snippet.sql !== sql) unsaved.add(id)
    }
    if (activeSnippet && currentSql !== activeSnippet.sql) unsaved.add(activeSnippet.id)
    return unsaved
  }, [draftSqlMap, currentSql, activeSnippet, snippets])

  const handleSqlChange = (value: string) => {
    setCurrentSqlSnapshot(value)
    setDraftSqlSnapshot({ ...draftSqlMapRef.current, [activeSnippetIdRef.current]: value })
  }

  const selectSnippet = (snippet: SqlSnippet) => {
    setActiveSnippetSnapshot(snippet.id)
    setCurrentSqlSnapshot(draftSqlMapRef.current[snippet.id] ?? snippet.sql)
    setOpenTabIds((previous) => previous.includes(snippet.id) ? previous : [...previous, snippet.id])
  }

  const addCreatedSnippet = (snippet: SqlSnippet, selectedIdAtStart: string, sqlAtStart: string) => {
    setSnippetsSnapshot([snippet, ...snippetsRef.current.filter((item) => item.id !== snippet.id)])
    setOpenTabIds((previous) => previous.includes(snippet.id) ? previous : [...previous, snippet.id])
    if (activeSnippetIdRef.current === selectedIdAtStart && currentSqlRef.current === sqlAtStart) {
      setActiveSnippetSnapshot(snippet.id)
      setCurrentSqlSnapshot(snippet.sql)
    }
  }

  const createSnippet = async (name = 'Untitled query', folderId: string | null = null) => {
    if (!beginLibraryMutation()) return
    const selectedIdAtStart = activeSnippetIdRef.current
    const sqlAtStart = currentSqlRef.current
    const folder = folders.find((item) => item.id === folderId)
    const sql = '-- Type your SQL query here\nSELECT current_database(), current_user;'
    const previousIds = new Set(snippetsRef.current.map((item) => item.id))
    try {
      const library = await api<SqlLibrary>('/sql/snippets', {
        method: 'POST',
        body: { name, sql, folderId, visibility: folder?.visibility ?? 'private' },
      })
      applyLibrary(library)
      const created = library.snippets.find((item) => !previousIds.has(item.id))
      if (!created) throw new Error('Created snippet was not returned by the library')
      addCreatedSnippet(created, selectedIdAtStart, sqlAtStart)
      notify('Snippet created')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const handleCreateNewQuery = () => void createSnippet()
  const handleCreateQueryInFolder = (folderId: string) => void createSnippet('Untitled query', folderId)

  const handleCloseTab = (id: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const nextTabs = openTabIds.filter((tabId) => tabId !== id)
    setOpenTabIds(nextTabs)
    if (activeSnippetId === id && nextTabs.length) {
      const next = snippets.find((snippet) => snippet.id === nextTabs[0])
      if (next) {
        setActiveSnippetSnapshot(next.id)
        setCurrentSqlSnapshot(draftSqlMapRef.current[next.id] ?? next.sql)
      }
    }
  }

  const handleFormatQuery = () => {
    const formatted = currentSql
      .replace(/\s+/g, ' ')
      .replace(/ select /gi, '\nSELECT ')
      .replace(/ from /gi, '\nFROM ')
      .replace(/ where /gi, '\nWHERE ')
      .replace(/ join /gi, '\nJOIN ')
      .replace(/ group by /gi, '\nGROUP BY ')
      .replace(/ order by /gi, '\nORDER BY ')
      .replace(/ limit /gi, '\nLIMIT ')
      .trim()
    handleSqlChange(formatted)
  }

  const handleRunQuery = useCallback(async () => {
    if (isExecuting) return
    const version = ++executionVersion.current
    setIsExecuting(true)
    setRawOutput('')
    try {
      const result = await api<SqlResponse>('/sql', { method: 'POST', body: { database, sql: currentSql } })
      if (version !== executionVersion.current) return
      const parsed = parseSqlExecutionOutput(currentSql, result.stdout)
      setRawOutput(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ''}`)
      setQueryResult({ ...parsed, executionTimeMs: result.durationMs, rowCount: parsed.rows.length, status: 'success', message: parsed.rows.length ? (result.stderr || undefined) : 'Query executed successfully' })
      setActiveBottomTab('results')
      notify('Query executed successfully')
    } catch (error) {
      if (version !== executionVersion.current) return
      setQueryResult({ columns: [], rows: [], executionTimeMs: 0, rowCount: 0, status: 'error', message: errorMessage(error) })
      notify(errorMessage(error), 'error')
    } finally {
      if (version === executionVersion.current) setIsExecuting(false)
    }
  }, [currentSql, database, isExecuting, notify])

  useEffect(() => {
    executionVersion.current++
    setQueryResult(null)
    setRawOutput('')
    setIsExecuting(false)
  }, [database])

  const handleSave = useCallback(async () => {
    if (!beginLibraryMutation()) return
    const snippetId = activeSnippetIdRef.current
    const snippetSnapshot = snippetsRef.current.find((item) => item.id === snippetId)
    if (!snippetSnapshot) {
      endLibraryMutation()
      return
    }
    const savedSql = currentSqlRef.current
    const wasScratch = isScratchSnippet(snippetSnapshot)
    const previousIds = new Set(snippetsRef.current.map((item) => item.id))
    setIsSaving(true)
    const payload = {
      name: snippetSnapshot.name,
      sql: savedSql,
      description: snippetSnapshot.description,
      visibility: snippetSnapshot.visibility ?? 'private',
      folderId: snippetSnapshot.folderId ?? null,
      isFavorite: snippetSnapshot.isFavorite ?? false,
    }
    try {
      const library = await api<SqlLibrary>(
        wasScratch ? '/sql/snippets' : `/sql/snippets/${encodeURIComponent(snippetId)}`,
        { method: wasScratch ? 'POST' : 'PATCH', body: payload }
      )
      const updated = wasScratch
        ? library.snippets.find((item) => !previousIds.has(item.id))
        : library.snippets.find((item) => item.id === snippetId)
      if (!updated) throw new Error('Saved snippet was not returned by the library')

      applyLibrary(library, wasScratch ? [snippetId] : [])
      const nextDrafts = { ...draftSqlMapRef.current }
      const latestDraft = nextDrafts[snippetId]
      delete nextDrafts[snippetId]
      if (wasScratch && latestDraft !== undefined && latestDraft !== savedSql) {
        nextDrafts[updated.id] = latestDraft
      } else if (!wasScratch && latestDraft !== undefined && latestDraft !== savedSql) {
        nextDrafts[snippetId] = latestDraft
      }
      setDraftSqlSnapshot(nextDrafts)

      if (wasScratch) {
        setOpenTabIds((previous) => previous.map((id) => id === snippetId ? updated.id : id))
        if (activeSnippetIdRef.current === snippetId) setActiveSnippetSnapshot(updated.id)
      }
      notify('Snippet saved')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      setIsSaving(false)
      endLibraryMutation()
    }
  }, [applyLibrary, beginLibraryMutation, endLibraryMutation, notify, setActiveSnippetSnapshot, setDraftSqlSnapshot])

  const updateSnippet = async (snippetId: string, patch: Partial<SqlSnippet>) => {
    const target = snippetsRef.current.find((item) => item.id === snippetId)
    if (!target) return
    if (!beginLibraryMutation()) return
    const wasScratch = isScratchSnippet(target)
    const savedSql = draftSqlMapRef.current[snippetId]
      ?? (activeSnippetIdRef.current === snippetId ? currentSqlRef.current : target.sql)
    const previousIds = new Set(snippetsRef.current.map((item) => item.id))
    try {
      const library = await api<SqlLibrary>(
        wasScratch ? '/sql/snippets' : `/sql/snippets/${encodeURIComponent(snippetId)}`,
        {
          method: wasScratch ? 'POST' : 'PATCH',
          body: wasScratch ? {
            name: target.name, sql: savedSql, description: target.description ?? '',
            visibility: target.visibility ?? 'private', folderId: target.folderId ?? null,
            isFavorite: target.isFavorite ?? false, ...patch,
          } : patch,
        }
      )
      const updated = library.snippets.find((item) => wasScratch ? !previousIds.has(item.id) : item.id === snippetId)
      if (!updated) throw new Error('Updated snippet was not returned by the library')
      applyLibrary(library, wasScratch ? [snippetId] : [])
      if (wasScratch) {
        const nextDrafts = { ...draftSqlMapRef.current }
        const latestDraft = nextDrafts[snippetId]
        delete nextDrafts[snippetId]
        if (latestDraft !== undefined && latestDraft !== savedSql) nextDrafts[updated.id] = latestDraft
        setDraftSqlSnapshot(nextDrafts)
        setOpenTabIds((previous) => previous.map((id) => id === snippetId ? updated.id : id))
        if (activeSnippetIdRef.current === snippetId) setActiveSnippetSnapshot(updated.id)
      }
      notify('Snippet updated')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const updateFolder = async (folderId: string, patch: Partial<SqlFolder>) => {
    if (!beginLibraryMutation()) return
    try {
      const library = await api<SqlLibrary>(`/sql/folders/${encodeURIComponent(folderId)}`, { method: 'PATCH', body: patch })
      applyLibrary(library)
      notify('Folder updated')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const handleCreateFolder = async (name = 'New folder', visibility: Visibility = 'private') => {
    if (!beginLibraryMutation()) return
    try {
      const library = await api<SqlLibrary>('/sql/folders', { method: 'POST', body: { name, visibility } })
      applyLibrary(library)
      notify('Folder created')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const handleRenameFolder = (folderId: string, name: string) => void updateFolder(folderId, { name })

  const handleDeleteFolder = async (folderId: string) => {
    if (!beginLibraryMutation()) return
    try {
      const library = await api<SqlLibrary>(`/sql/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' })
      applyLibrary(library)
      notify('Folder deleted')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const handleToggleFavorite = (id: string) => {
    const snippet = snippets.find((item) => item.id === id)
    if (snippet) void updateSnippet(id, { isFavorite: !snippet.isFavorite })
  }
  const handleToggleVisibility = (id: string) => {
    const snippet = snippets.find((item) => item.id === id)
    if (snippet) void updateSnippet(id, { visibility: snippet.visibility === 'shared' ? 'private' : 'shared' })
  }
  const handleRenameSnippet = (id: string, name: string) => void updateSnippet(id, { name })

  const handleDuplicateSnippet = async (snippet: SqlSnippet) => {
    if (!beginLibraryMutation()) return
    const selectedIdAtStart = activeSnippetIdRef.current
    const sqlAtStart = currentSqlRef.current
    const previousIds = new Set(snippetsRef.current.map((item) => item.id))
    const sqlSnapshot = draftSqlMapRef.current[snippet.id]
      ?? (snippet.id === selectedIdAtStart ? currentSqlRef.current : snippet.sql)
    try {
      const library = await api<SqlLibrary>('/sql/snippets', {
        method: 'POST',
        body: {
          name: `${snippet.name} (Duplicate)`,
          sql: sqlSnapshot,
          description: snippet.description,
          visibility: snippet.visibility ?? 'private',
          folderId: snippet.folderId ?? null,
          isFavorite: false,
        },
      })
      applyLibrary(library)
      const duplicate = library.snippets.find((item) => !previousIds.has(item.id))
      if (!duplicate) throw new Error('Duplicated snippet was not returned by the library')
      addCreatedSnippet(duplicate, selectedIdAtStart, sqlAtStart)
      notify('Snippet duplicated')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const deleteSnippet = async (id: string) => {
    if (!beginLibraryMutation()) return
    try {
      const library = await api<SqlLibrary>(`/sql/snippets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      applyLibrary(library)
      setOpenTabIds((previous) => {
        const remaining = previous.filter((tabId) => tabId !== id && library.snippets.some((item) => item.id === tabId))
        return remaining.length ? remaining : library.snippets.slice(0, 1).map((item) => item.id)
      })
      if (activeSnippetIdRef.current === id) {
        const next = library.snippets[0]
        if (next) {
          setActiveSnippetSnapshot(next.id)
          setCurrentSqlSnapshot(draftSqlMapRef.current[next.id] ?? next.sql)
        } else {
          const scratch = makeScratch()
          setSnippetsSnapshot([...library.snippets, scratch])
          setActiveSnippetSnapshot(scratch.id)
          setOpenTabIds([scratch.id])
          setCurrentSqlSnapshot(scratch.sql)
        }
      }
      const nextDrafts = { ...draftSqlMapRef.current }
      delete nextDrafts[id]
      setDraftSqlSnapshot(nextDrafts)
      notify('Snippet deleted')
    } catch (error) {
      notify(errorMessage(error), 'error')
    } finally {
      endLibraryMutation()
    }
  }

  const handleRenameQuery = () => {
    if (!activeSnippet) return
    const name = window.prompt('Enter query name:', activeSnippet.name)?.trim()
    if (name && name !== activeSnippet.name) void updateSnippet(activeSnippet.id, { name })
  }
  const handleDuplicateQuery = () => {
    if (activeSnippet) void handleDuplicateSnippet(activeSnippet)
  }
  const handleDeleteQuery = () => {
    if (activeSnippet && snippets.length > 1) void deleteSnippet(activeSnippet.id)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        void handleRunQuery()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave, handleRunQuery])

  const handleDownloadCsv = () => {
    if (!queryResult) return
    try {
      downloadResultsAsCsv(queryResult)
      notify('Query results exported as CSV')
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-studio">
      {isSidebarOpen && (
        <SqlSidebar
          snippets={snippets}
          folders={folders}
          activeSnippetId={activeSnippetId}
          search={search}
          onSearchChange={setSearch}
          onSelectSnippet={selectSnippet}
          onCreateNewQuery={handleCreateNewQuery}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateQueryInFolder={handleCreateQueryInFolder}
          onToggleFavorite={handleToggleFavorite}
          onToggleVisibility={handleToggleVisibility}
          onRenameSnippet={handleRenameSnippet}
          onDuplicateSnippet={handleDuplicateSnippet}
          onDeleteSnippet={(id) => void deleteSnippet(id)}
        />
      )}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <SqlTabBar
          snippets={snippets}
          openTabIds={openTabIds}
          activeSnippetId={activeSnippetId}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((previous) => !previous)}
          onSelectTab={selectSnippet}
          onCloseTab={handleCloseTab}
          onCreateNewQuery={handleCreateNewQuery}
          unsavedSnippetIds={unsavedSnippetIds}
        />
        {isLoading && (
          <div className="h-10 shrink-0 border-b border-default bg-dash-sidebar px-4 flex items-center gap-2 text-xs text-foreground-lighter">
            <span className="h-3 w-3 rounded-full border-2 border-foreground-muted/30 border-t-foreground-muted animate-spin" />
            Loading saved snippets…
          </div>
        )}
        <SqlActionToolbar
          isExecuting={isExecuting}
          isLibraryBusy={busyAction}
          hasUnsavedEdits={unsavedSnippetIds.has(activeSnippetId)}
          isSaving={isSaving}
          onRunQuery={handleRunQuery}
          onFormatQuery={handleFormatQuery}
          onSave={() => void handleSave()}
          onDuplicateQuery={handleDuplicateQuery}
          onRenameQuery={handleRenameQuery}
          onDeleteQuery={snippets.length > 1 ? handleDeleteQuery : undefined}
        />
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <SqlCodeEditor value={currentSql} onChange={handleSqlChange} />
          <SqlResultsPane
            queryResult={queryResult}
            activeBottomTab={activeBottomTab}
            onActiveBottomTabChange={setActiveBottomTab}
            onRunQuery={handleRunQuery}
            onDownloadCsv={handleDownloadCsv}
          />
          {rawOutput && <details className="shrink-0 border-t border-default p-2 text-xs max-h-40 overflow-auto"><summary className="cursor-pointer text-foreground-lighter">Complete raw output (all statements and notices)</summary><pre className="whitespace-pre-wrap p-2">{rawOutput}</pre></details>}
        </div>
      </div>
    </div>
  )
}
