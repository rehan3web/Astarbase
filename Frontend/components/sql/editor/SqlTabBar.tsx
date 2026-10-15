'use client'

import React from 'react'
import { PanelLeft, PanelLeftClose, Plus, X } from 'lucide-react'
import { SqlSnippet } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { SqlFileIcon } from './SqlFileIcon'

interface SqlTabBarProps {
  snippets: SqlSnippet[]
  openTabIds: string[]
  activeSnippetId: string
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onSelectTab: (snippet: SqlSnippet) => void
  onCloseTab: (id: string, e: React.MouseEvent) => void
  onCreateNewQuery: () => void
  unsavedSnippetIds?: Set<string> | string[]
}

export function SqlTabBar({
  snippets,
  openTabIds,
  activeSnippetId,
  isSidebarOpen,
  onToggleSidebar,
  onSelectTab,
  onCloseTab,
  onCreateNewQuery,
  unsavedSnippetIds,
}: SqlTabBarProps) {
  const unsavedSet = React.useMemo(() => {
    if (!unsavedSnippetIds) return new Set<string>()
    return unsavedSnippetIds instanceof Set
      ? unsavedSnippetIds
      : new Set(unsavedSnippetIds)
  }, [unsavedSnippetIds])

  return (
    <div className="h-9 shrink-0 border-b border-default bg-dash-sidebar flex items-center select-none overflow-x-auto no-scrollbar">
      {/* Sidebar toggle button [ <| ] */}
      <button
        onClick={onToggleSidebar}
        className="h-full w-9 flex items-center justify-center border-r border-default text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
        title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label="Toggle sidebar"
      >
        {isSidebarOpen ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeft className="h-4 w-4" />
        )}
      </button>

      {/* Query Tabs */}
      <div className="flex items-center h-full">
        {openTabIds.map((id) => {
          const snip = snippets.find((s) => s.id === id)
          if (!snip) return null
          const isActive = snip.id === activeSnippetId
          const hasUnsaved = unsavedSet.has(snip.id)

          return (
            <div
              key={snip.id}
              onClick={() => onSelectTab(snip)}
              className={cn(
                'group relative h-full px-3 flex items-center gap-2 text-xs border-r border-default transition-colors cursor-pointer whitespace-nowrap',
                isActive
                  ? 'bg-surface-100 text-foreground font-medium'
                  : 'bg-transparent text-foreground-lighter hover:bg-surface-100/50 hover:text-foreground'
              )}
            >
              {/* White active top indicator bar */}
              {isActive && (
                <span className="absolute top-0 left-0 right-0 h-[2px] bg-foreground" />
              )}

              {/* [SQL] File Icon */}
              <SqlFileIcon
                className={cn(
                  'w-4 h-4 shrink-0 transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'text-foreground-muted group-hover:text-foreground'
                )}
              />

              {/* Snippet Name (italicized if duplicate or unsaved) */}
              <span
                className={cn(
                  'truncate max-w-[160px]',
                  (hasUnsaved || snip.name.includes('Duplicate')) && 'italic'
                )}
              >
                {snip.name}
              </span>

              {/* Orange unsaved dot */}
              {hasUnsaved && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 shrink-0 shadow-xs"
                  title="Unsaved changes"
                />
              )}

              {/* Close tab button */}
              {openTabIds.length > 1 && (
                <button
                  onClick={(e) => onCloseTab(snip.id, e)}
                  className="opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-surface-200 p-0.5 rounded transition-all ml-0.5 cursor-pointer"
                  title="Close tab"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )
        })}

        {/* Plus (+) Button for new query */}
        <button
          onClick={onCreateNewQuery}
          className="h-full px-3 flex items-center justify-center text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors cursor-pointer border-r border-default shrink-0"
          title="New query"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

