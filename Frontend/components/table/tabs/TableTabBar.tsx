import React from 'react'
import {
  PanelLeft,
  PanelLeftClose,
  Plus,
  Table2 as TableIcon,
  X,
} from 'lucide-react'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export const NEW_TAB_ID = '__new__'

interface TableTabBarProps {
  openTabIds: string[]
  activeTabId: string
  getTable: (id: string) => TableDefinition | undefined
  isSidebarOpen: boolean
  onToggleSidebar: () => void
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onNewTab: () => void
  onTableAction?: (table: TableDefinition, action: string) => void
}

export function TableTabBar({
  openTabIds,
  activeTabId,
  getTable,
  isSidebarOpen,
  onToggleSidebar,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onTableAction,
}: TableTabBarProps) {


  return (
    <div className="h-10 shrink-0 border-b border-default bg-dash-sidebar flex items-stretch select-none overflow-x-auto no-scrollbar">
      {/* Sidebar toggle */}
      <button
        id="table-tabs-toggle-sidebar"
        type="button"
        onClick={onToggleSidebar}
        className="w-10 flex items-center justify-center border-r border-default text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
        title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label="Toggle sidebar"
      >
        {isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </button>

      {/* Tabs */}
      {openTabIds.map((id) => {
        const isActive = id === activeTabId
        const isNew = id === NEW_TAB_ID
        const table = isNew ? undefined : getTable(id)
        if (!isNew && !table) return null



        return (
          <div
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(id)}
            onMouseDown={(e) => {
              // Middle-click closes the tab
              if (e.button === 1) {
                e.preventDefault()
                onCloseTab(id)
              }
            }}
            className={cn(
              'group relative pl-3.5 pr-2 flex items-center gap-2 text-xs border-r border-default transition-colors cursor-pointer whitespace-nowrap min-w-[130px]',
              isActive
                ? 'bg-studio text-foreground'
                : 'bg-transparent text-foreground-lighter hover:bg-surface-100/60 hover:text-foreground'
            )}
          >
            {/* Active Left indicator bar matching Supabase UI */}
            {isActive && (
              <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-foreground dark:bg-foreground z-10" />
            )}

            {/* Hides the bottom border under the active tab so it merges with the content */}
            {isActive && <span className="absolute -bottom-px left-0 right-0 h-px bg-studio" />}

            {isNew ? (
              <>
                <Plus className="h-3.5 w-3.5 shrink-0 text-foreground-lighter" />
                <span className="font-medium pr-4">New</span>
              </>
            ) : (
              <>
                <TableIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isActive ? 'text-foreground' : 'text-foreground-muted group-hover:text-foreground'
                  )}
                />
                <span className="truncate max-w-[160px] flex items-center gap-1 font-mono">
                  {table!.schema !== 'public' && (
                    <span className="text-foreground-lighter">{table!.schema}.</span>
                  )}
                  <span className={cn(isActive && 'font-semibold text-foreground')}>{table!.name}</span>
                </span>
              </>
            )}

            {/* Close tab button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(id)
              }}
              className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 rounded text-foreground-lighter hover:text-foreground hover:bg-surface-200 transition-all cursor-pointer shrink-0"
              title="Close tab"
              aria-label={`Close ${isNew ? 'new tab' : table?.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}

      {/* New tab (+) */}
      <button
        id="table-tabs-new"
        type="button"
        onClick={onNewTab}
        className="px-3 flex items-center justify-center text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors cursor-pointer shrink-0"
        title="New tab"
        aria-label="New tab"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
