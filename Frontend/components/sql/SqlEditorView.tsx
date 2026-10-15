'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { MOCK_SQL_SNIPPETS, SqlSnippet, SqlFolder } from '@/lib/mock-data'

// Sub-components
import { SqlSidebar } from '@/components/sql/editor/SqlSidebar'
import { SqlTabBar } from '@/components/sql/editor/SqlTabBar'
import { SqlActionToolbar } from '@/components/sql/editor/SqlActionToolbar'
import { SqlCodeEditor } from '@/components/sql/editor/SqlCodeEditor'
import { SqlResultsPane, QueryResult } from '@/components/sql/result/SqlResultsPane'
import { downloadResultsAsCsv } from '@/components/sql/export/SqlExportUtils'
import { api, SqlResponse, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { parseSqlOutput } from '@/lib/sql-results'

const INITIAL_FOLDERS: SqlFolder[] = [
  { id: 'folder_1', name: 'Untitled folder', visibility: 'private' },
]

const INITIAL_SNIPPETS: SqlSnippet[] = [
  {
    id: 'query_1',
    name: 'Untitled query',
    description: 'Run SQL against the selected live database',
    isFavorite: false,
    visibility: 'private',
    folderId: 'folder_1',
    sql: 'SELECT current_database(), current_user;',
    inserted_at: '2025-02-10T14:22:00Z',
    updated_at: '2025-03-28T09:15:00Z',
  },
]

export function SqlEditorView() {
  const { database } = useStudio()
  const [rawOutput, setRawOutput] = useState('')
  const executionVersion = useRef(0)
  const [folders, setFolders] = useState<SqlFolder[]>(INITIAL_FOLDERS)
  const [snippets, setSnippets] = useState<SqlSnippet[]>(INITIAL_SNIPPETS)
  const [search, setSearch] = useState('')
  const [activeSnippetId, setActiveSnippetId] = useState<string>('query_1')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  // Open tabs
  const [openTabIds, setOpenTabIds] = useState<string[]>(['query_1'])

  // Draft changes per snippet
  const [draftSqlMap, setDraftSqlMap] = useState<Record<string, string>>({})

  // Current query in editor
  const activeSnippet =
    snippets.find((s) => s.id === activeSnippetId) || snippets[0]
  const [currentSql, setCurrentSql] = useState<string>(
    INITIAL_SNIPPETS[0]?.sql || 'SELECT * FROM public.users LIMIT 10;'
  )

  // Unsaved snippets tracking
  const unsavedSnippetIds = useMemo(() => {
    const set = new Set<string>()
    Object.entries(draftSqlMap).forEach(([id, sql]) => {
      const snip = snippets.find((s) => s.id === id)
      if (snip && snip.sql !== sql) {
        set.add(id)
      }
    })
    if (activeSnippet && currentSql !== activeSnippet.sql) {
      set.add(activeSnippet.id)
    }
    return set
  }, [draftSqlMap, currentSql, activeSnippet, snippets])

  // Handle SQL changes
  const handleSqlChange = (val: string) => {
    setCurrentSql(val)
    setDraftSqlMap((prev) => ({ ...prev, [activeSnippetId]: val }))
  }

  // Execution state & Results (initially null until query is run)
  const [isExecuting, setIsExecuting] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'chart'>('results')

  // Switch snippet
  const handleSelectSnippet = (snippet: SqlSnippet) => {
    setActiveSnippetId(snippet.id)
    setCurrentSql(draftSqlMap[snippet.id] ?? snippet.sql)
    if (!openTabIds.includes(snippet.id)) {
      setOpenTabIds([...openTabIds, snippet.id])
    }
  }

  // Create new scratchpad query
  const handleCreateNewQuery = () => {
    const newId = `query_${Date.now()}`
    const newSnippet: SqlSnippet = {
      id: newId,
      name: `Untitled query`,
      sql: `-- Type your SQL query here\nSELECT current_database(), current_user;`,
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSnippets([newSnippet, ...snippets])
    setOpenTabIds([...openTabIds, newId])
    setActiveSnippetId(newId)
    setCurrentSql(newSnippet.sql)
  }

  // Add template as new snippet
  const handleAddTemplate = (snippet: SqlSnippet) => {
    setSnippets([snippet, ...snippets])
    handleSelectSnippet(snippet)
  }

  // Close tab
  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const nextTabs = openTabIds.filter((t) => t !== id)
    setOpenTabIds(nextTabs)
    if (activeSnippetId === id && nextTabs.length > 0) {
      const nextSnippet = snippets.find((s) => s.id === nextTabs[0])
      if (nextSnippet) {
        setActiveSnippetId(nextSnippet.id)
        setCurrentSql(draftSqlMap[nextSnippet.id] ?? nextSnippet.sql)
      }
    }
  }

  // Select tab
  const handleSelectTab = (snippet: SqlSnippet) => {
    setActiveSnippetId(snippet.id)
    setCurrentSql(draftSqlMap[snippet.id] ?? snippet.sql)
  }

  // Run Query
  const handleRunQuery = useCallback(async () => {
    if (isExecuting) return
    const version = ++executionVersion.current
    setIsExecuting(true)
    setRawOutput('')
    try {
      const result = await api<SqlResponse>('/sql', { method: 'POST', body: { database, sql: currentSql } })
      if (version !== executionVersion.current) return
      const parsed = currentSql.trim().replace(/;$/, '').includes(';')
        ? { columns: ['output'], rows: [{ output: result.stdout }] }
        : parseSqlOutput(result.stdout)
      setRawOutput(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ''}`)
      setQueryResult({ ...parsed, executionTimeMs: result.durationMs, rowCount: parsed.rows.length, status: 'success', message: result.stderr || (parsed.rows.length ? undefined : result.stdout) })
      setActiveBottomTab('results')
    } catch (error) {
      if (version !== executionVersion.current) return
      setQueryResult({ columns: [], rows: [], executionTimeMs: 0, rowCount: 0, status: 'error', message: errorMessage(error) })
    } finally { if (version === executionVersion.current) setIsExecuting(false) }
  }, [currentSql, database, isExecuting])
  useEffect(() => { executionVersion.current++; setQueryResult(null); setRawOutput(''); setIsExecuting(false) }, [database])

  // Format Query
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

  // Save current SQL back to snippet
  const handleSave = useCallback(() => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === activeSnippet.id ? { ...s, sql: currentSql } : s))
    )
    setDraftSqlMap((prev) => {
      const next = { ...prev }
      delete next[activeSnippet.id]
      return next
    })
  }, [activeSnippet.id, currentSql])

  // Duplicate current query
  const handleDuplicateQuery = () => {
    const newId = `query_${Date.now()}`
    const newSnippet: SqlSnippet = {
      id: newId,
      name: `${activeSnippet.name} (Duplicate)`,
      sql: currentSql,
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSnippets([newSnippet, ...snippets])
    setOpenTabIds([...openTabIds, newId])
    setActiveSnippetId(newId)
    setCurrentSql(newSnippet.sql)
  }

  // Delete current query
  const handleDeleteQuery = () => {
    if (snippets.length <= 1) return
    const nextSnippets = snippets.filter((s) => s.id !== activeSnippet.id)
    const nextTabs = openTabIds.filter((t) => t !== activeSnippet.id)
    setSnippets(nextSnippets)
    setOpenTabIds(nextTabs.length > 0 ? nextTabs : [nextSnippets[0].id])
    const nextActive = nextSnippets[0]
    setActiveSnippetId(nextActive.id)
    setCurrentSql(draftSqlMap[nextActive.id] ?? nextActive.sql)
  }

  // Rename current query
  const handleRenameQuery = () => {
    const newName = prompt('Enter query name:', activeSnippet.name)
    if (newName && newName.trim()) {
      setSnippets(
        snippets.map((s) =>
          s.id === activeSnippet.id ? { ...s, name: newName.trim() } : s
        )
      )
    }
  }

  // Folder CRUD handlers
  const handleCreateFolder = (name = 'New folder', visibility: 'private' | 'shared' = 'private') => {
    const newFolder: SqlFolder = {
      id: `folder_${Date.now()}`,
      name,
      visibility,
    }
    setFolders((prev) => [...prev, newFolder])
  }

  const handleRenameFolder = (folderId: string, newName: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f))
    )
  }

  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
    const remainingSnippets = snippets.filter((s) => s.folderId !== folderId)
    if (remainingSnippets.length === 0) {
      const fallback: SqlSnippet = {
        id: `query_${Date.now()}`,
        name: 'Untitled query',
        sql: 'SELECT * FROM public.users LIMIT 10;',
        inserted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        visibility: 'private',
      }
      setSnippets([fallback])
      setOpenTabIds([fallback.id])
      setActiveSnippetId(fallback.id)
      setCurrentSql(fallback.sql)
    } else {
      setSnippets(remainingSnippets)
      const nextTabs = openTabIds.filter(
        (id) => !snippets.some((s) => s.id === id && s.folderId === folderId)
      )
      const finalTabs = nextTabs.length > 0 ? nextTabs : [remainingSnippets[0].id]
      setOpenTabIds(finalTabs)
      if (!finalTabs.includes(activeSnippetId)) {
        setActiveSnippetId(finalTabs[0])
        setCurrentSql(draftSqlMap[finalTabs[0]] ?? remainingSnippets[0].sql)
      }
    }
  }

  const handleCreateQueryInFolder = (folderId: string) => {
    const newId = `query_${Date.now()}`
    const newSnippet: SqlSnippet = {
      id: newId,
      name: 'Untitled query',
      sql: `-- Type your SQL query here\nSELECT * FROM public.users LIMIT 10;`,
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      folderId,
      visibility: 'private',
    }
    setSnippets((prev) => [newSnippet, ...prev])
    setOpenTabIds((prev) => [...prev, newId])
    setActiveSnippetId(newId)
    setCurrentSql(newSnippet.sql)
  }

  // Snippet item handlers
  const handleToggleFavorite = (snippetId: string) => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === snippetId ? { ...s, isFavorite: !s.isFavorite } : s))
    )
  }

  const handleToggleVisibility = (snippetId: string) => {
    setSnippets((prev) =>
      prev.map((s) =>
        s.id === snippetId
          ? { ...s, visibility: s.visibility === 'shared' ? 'private' : 'shared' }
          : s
      )
    )
  }

  const handleRenameSnippet = (snippetId: string, newName: string) => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === snippetId ? { ...s, name: newName } : s))
    )
  }

  const handleDuplicateSnippet = (snippet: SqlSnippet) => {
    const newId = `query_${Date.now()}`
    const duplicate: SqlSnippet = {
      ...snippet,
      id: newId,
      name: `${snippet.name} (Duplicate)`,
      inserted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setSnippets((prev) => [duplicate, ...prev])
    setOpenTabIds((prev) => [...prev, newId])
    setActiveSnippetId(newId)
    setCurrentSql(duplicate.sql)
  }

  const handleDeleteSnippet = (snippetId: string) => {
    if (snippets.length <= 1) return
    const nextSnippets = snippets.filter((s) => s.id !== snippetId)
    const nextTabs = openTabIds.filter((t) => t !== snippetId)
    const finalTabs = nextTabs.length > 0 ? nextTabs : [nextSnippets[0].id]
    setSnippets(nextSnippets)
    setOpenTabIds(finalTabs)
    if (activeSnippetId === snippetId) {
      setActiveSnippetId(finalTabs[0])
      setCurrentSql(draftSqlMap[finalTabs[0]] ?? nextSnippets[0].sql)
    }
  }

  // Global Keyboard shortcuts: Ctrl+S to save, Ctrl+Enter to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleRunQuery()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, handleRunQuery])

  // Download Results CSV
  const handleDownloadCsv = () => {
    if (queryResult) {
      downloadResultsAsCsv(queryResult)
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-studio">
      {/* 1. Left Secondary Sidebar: Queries Menu */}
      {isSidebarOpen && (
        <SqlSidebar
          snippets={snippets}
          folders={folders}
          activeSnippetId={activeSnippetId}
          search={search}
          onSearchChange={setSearch}
          onSelectSnippet={handleSelectSnippet}
          onCreateNewQuery={handleCreateNewQuery}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onCreateQueryInFolder={handleCreateQueryInFolder}
          onToggleFavorite={handleToggleFavorite}
          onToggleVisibility={handleToggleVisibility}
          onRenameSnippet={handleRenameSnippet}
          onDuplicateSnippet={handleDuplicateSnippet}
          onDeleteSnippet={handleDeleteSnippet}
        />
      )}

      {/* 2. Main Editor & Results Container */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Tab Bar for Opened Queries */}
        <SqlTabBar
          snippets={snippets}
          openTabIds={openTabIds}
          activeSnippetId={activeSnippetId}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onCreateNewQuery={handleCreateNewQuery}
          unsavedSnippetIds={unsavedSnippetIds}
        />

        {/* Action Toolbar above Code Editor */}
        <SqlActionToolbar
          isExecuting={isExecuting}
          hasUnsavedEdits={unsavedSnippetIds.has(activeSnippetId)}
          onRunQuery={handleRunQuery}
          onFormatQuery={handleFormatQuery}
          onSave={handleSave}
          onDuplicateQuery={handleDuplicateQuery}
          onRenameQuery={handleRenameQuery}
          onDeleteQuery={snippets.length > 1 ? handleDeleteQuery : undefined}
        />

        {/* Split Pane: Monaco Editor on Top, Results Table on Bottom */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Top Monaco Editor Pane */}
          <SqlCodeEditor
            value={currentSql}
            onChange={handleSqlChange}
          />

          {/* Bottom Utility Results Pane */}
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

