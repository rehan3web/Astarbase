'use client'

import React, { useState } from 'react'
import {
  Copy,
  Download,
  Filter,
  Lock,
  MoreVertical,
  Plus,
  Search,
  SquarePen,
  Table2 as TableIcon,
  Trash,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { useTheme } from '@/components/providers/ThemeProvider'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type TableAction =
  | 'copy-name'
  | 'copy-schema'
  | 'edit'
  | 'duplicate'
  | 'view-policies'
  | 'export-csv'
  | 'export-json'
  | 'export-sql'
  | 'delete'

interface TableExplorerProps {
  selectedSchema?: string
  schemas?: string[]
  onSelectSchema?: (schema: string) => void
  tableSearch: string
  onTableSearchChange: (value: string) => void
  filteredTables: TableDefinition[]
  selectedTable: TableDefinition | null
  onSelectTable: (table: TableDefinition) => void
  onNewTable: () => void
  onTableAction?: (table: TableDefinition, action: TableAction) => void
}

export function TableExplorer({
  tableSearch,
  onTableSearchChange,
  filteredTables,
  selectedTable,
  onSelectTable,
  onNewTable,
  onTableAction,
}: TableExplorerProps) {
  const { theme } = useTheme()
  const [openMenuTableId, setOpenMenuTableId] = useState<string | null>(null)
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<string[]>([
    'table',
    'view',
    'materialized_view',
    'foreign_table',
    'partitioned_table',
  ])

  const toggleEntityType = (type: string) => {
    setSelectedEntityTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  return (
    <aside className="w-64 shrink-0 border-r border-default bg-dash-sidebar flex flex-col h-full select-none">
      {/* Header / New Table Button */}
      <div className="p-2 border-b border-default">
        <button
          type="button"
          onClick={onNewTable}
          className="w-full h-7 px-2.5 rounded-md border border-strong bg-surface-100 hover:bg-surface-200 text-foreground text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-left"
        >
          <Plus className="h-3 w-3 text-foreground-lighter" />
          <span>New table</span>
        </button>
      </div>

      {/* Filter / Search Tables */}
      <div className="p-2 border-b border-default flex items-center gap-1.5">
        <div className="relative flex items-center flex-1 min-w-0">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-foreground-lighter" />
          <input
            placeholder="Search tables..."
            value={tableSearch}
            onChange={(e) => onTableSearchChange(e.target.value)}
            className="w-full h-7 pl-8 pr-2 text-xs bg-surface-100 border border-strong rounded text-foreground placeholder:text-foreground-lighter focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-7 w-7 flex shrink-0 items-center justify-center rounded border border-strong bg-surface-100 hover:bg-surface-200 text-foreground-lighter hover:text-foreground transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-brand-500 border-dashed"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 p-1.5">
            <div className="text-[11px] font-semibold text-foreground-lighter uppercase tracking-wider mb-1.5 px-2 mt-1">
              Filter entity types
            </div>
            <div className="space-y-0.5">
              {[
                { id: 'table', label: 'Table' },
                { id: 'view', label: 'View' },
                { id: 'materialized_view', label: 'Materialized View' },
                { id: 'foreign_table', label: 'Foreign Table' },
                { id: 'partitioned_table', label: 'Partitioned Table' },
              ].map((type) => (
                <label
                  key={type.id}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-surface-200 cursor-pointer rounded transition-colors"
                >
                  <Checkbox
                    checked={selectedEntityTypes.includes(type.id)}
                    onCheckedChange={() => toggleEntityType(type.id)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table List */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3.5 py-1 text-[10px] font-medium uppercase tracking-wider text-foreground-lighter">
          Tables ({filteredTables.length})
        </div>
        {filteredTables.map((tbl) => {
          const isSelected = selectedTable?.id === tbl.id
          const isMenuOpen = openMenuTableId === tbl.id
          const act = (action: TableAction) => onTableAction?.(tbl, action)
          return (
            <div
              key={tbl.id}
              onClick={() => onSelectTable(tbl)}
              className={cn(
                'w-full flex items-center justify-between px-3.5 py-1.5 text-xs transition-colors cursor-pointer group text-left font-mono border-y border-x-0',
                isSelected
                  ? 'bg-[#F3F3F3] dark:bg-[#1E1F1E] text-foreground dark:text-[#F3F3F3] font-medium border-strong shadow-2xs'
                  : 'text-foreground-light hover:bg-surface-100 hover:text-foreground border-transparent',
                isMenuOpen && !isSelected && 'bg-surface-100 text-foreground'
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <TableIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-colors',
                    isSelected
                      ? 'text-foreground dark:text-[#F3F3F3]'
                      : 'text-foreground-lighter group-hover:text-foreground'
                  )}
                />
                <span className="truncate">{tbl.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={cn(
                    'text-[10px] font-sans transition-colors',
                    isSelected
                      ? 'text-foreground-muted dark:text-[#F3F3F3]/70'
                      : 'text-foreground-muted'
                  )}
                >
                  {tbl.estimatedRowCount.toLocaleString()}
                </span>
                {onTableAction && (
                  <DropdownMenu
                    open={isMenuOpen}
                    onOpenChange={(open) => setOpenMenuTableId(open ? tbl.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        title={`Actions for "${tbl.name}"`}
                        aria-label={`Actions for ${tbl.name}`}
                        className={cn(
                          'items-center justify-center p-0.5 rounded text-foreground-lighter hover:text-foreground hover:bg-surface-200 transition-colors cursor-pointer',
                          isSelected || isMenuOpen ? 'flex' : 'hidden'
                        )}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="bottom"
                      className="w-52"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuItem onSelect={() => act('copy-name')}>
                        <Copy className="shrink-0" />
                        <span>Copy name</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act('copy-schema')}>
                        <Copy className="shrink-0" />
                        <span>Copy table schema</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => act('edit')}>
                        <SquarePen className="shrink-0" />
                        <span>Edit table</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act('duplicate')}>
                        <Copy className="shrink-0" />
                        <span>Duplicate table</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => act('view-policies')}>
                        <Lock className="shrink-0" />
                        <span>View policies</span>
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Download className="shrink-0" />
                          <span>Export data</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-44">
                          <DropdownMenuItem onSelect={() => act('export-csv')}>
                            <span>Export as CSV</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => act('export-json')}>
                            <span>Export as JSON</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => act('export-sql')}>
                            <span>Export as SQL</span>
                          </DropdownMenuItem>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => act('delete')}>
                        <Trash className="shrink-0" />
                        <span>Delete table</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}
