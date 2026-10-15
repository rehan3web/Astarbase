'use client'

import React from 'react'
import {
  ChevronDown,
  Columns,
  FileSpreadsheet,
  ListFilter,
  MoreVertical,
  PlusCircle,
  RefreshCw,
  Rows,
  Search,
  Trash,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

interface TableToolbarProps {
  selectedTable: TableDefinition
  selectedRowIds: Set<string>
  filterSearch: string
  onFilterSearchChange: (value: string) => void
  sortColumn: string
  onSortColumnChange: (value: string) => void
  sortDirection: 'asc' | 'desc'
  onSortDirectionChange: (value: 'asc' | 'desc') => void
  onCopyCsv: () => void
  onCopyJson: () => void
  onCopySql: () => void
  onExportCsv: () => void
  onExportJson: () => void
  onDeleteSelected: () => void
  onAddRlsPolicy: () => void
  onRefresh: () => void
  onInsertRow: () => void
  onInsertColumn: () => void
}

export function TableToolbar({
  selectedTable,
  selectedRowIds,
  filterSearch,
  onFilterSearchChange,
  sortColumn,
  onSortColumnChange,
  sortDirection,
  onSortDirectionChange,
  onCopyCsv,
  onCopyJson,
  onCopySql,
  onExportCsv,
  onExportJson,
  onDeleteSelected,
  onAddRlsPolicy,
  onRefresh,
  onInsertRow,
  onInsertColumn,
}: TableToolbarProps) {
  return (
    <div className="h-11 shrink-0 border-b border-default bg-dash-sidebar flex items-center justify-between px-3 gap-2">
      {selectedRowIds.size > 0 ? (
        /* SELECTION STATE */
        <div className="flex items-center justify-between w-full">
          {/* Left side: Copy & Export dropdowns */}
          <div className="flex items-center gap-2">
            {/* Copy dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="small"
                  className="text-xs h-[28px] px-2.5 gap-1 bg-surface-100 hover:bg-surface-200 border-default font-medium text-foreground cursor-pointer"
                >
                  <span>Copy</span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={onCopyCsv}>Copy as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={onCopyJson}>Copy as JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={onCopySql}>Copy as SQL INSERT</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Export dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="small"
                  className="text-xs h-[28px] px-2.5 gap-1 bg-surface-100 hover:bg-surface-200 border-default font-medium text-foreground cursor-pointer"
                >
                  <span>Export</span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={onExportCsv}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJson}>Export as JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right side: Delete button */}
          <button
            type="button"
            onClick={onDeleteSelected}
            disabled={!selectedRowIds.size}
            title={selectedRowIds.size ? 'Delete the selected rows' : 'Select at least one row first'}
            className="inline-flex items-center gap-1.5 text-xs font-medium h-[28px] px-2.5 rounded-md bg-[#9E3735] hover:bg-[#9E3735]/90 text-white transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash className="h-3.5 w-3.5" />
            <span>
              Delete {selectedRowIds.size} row{selectedRowIds.size > 1 ? 's' : ''}
            </span>
          </button>
        </div>
      ) : (
        /* DEFAULT STATE */
        <>
          {/* Left toolbar: Filter search */}
          <div className="flex items-center gap-2 flex-1 max-w-md min-w-0">
            <div className="relative flex items-center w-full">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-foreground-lighter pointer-events-none" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => onFilterSearchChange(e.target.value)}
                placeholder={`Filter by ${selectedTable.columns.slice(0, 2).map((c) => c.name).join(', ')} or ask AI`}
                className="w-full h-[28px] pl-8 pr-2 text-xs bg-transparent border-0 text-foreground placeholder:text-foreground-lighter focus:outline-none focus:ring-0"
              />
              {filterSearch && (
                <button
                  onClick={() => onFilterSearchChange('')}
                  className="absolute right-2 text-foreground-lighter hover:text-foreground cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Right toolbar items */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Sort Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={sortColumn ? 'secondary' : 'default'}
                  size="small"
                  iconLeft={<ListFilter className="h-3.5 w-3.5 shrink-0" />}
                  className={cn(
                    'text-xs shrink-0 whitespace-nowrap px-2.5 h-[28px]',
                    sortColumn && 'border-brand-500/40 text-brand-500 bg-brand-500/10'
                  )}
                >
                  <span>Sort</span>
                  {sortColumn && <span className="ml-0.5 text-brand-500 font-bold">•</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3 bg-surface-100 border-overlay" align="end">
                <div className="space-y-3 text-xs">
                  <div className="font-medium text-foreground">Sort Table</div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-foreground-lighter block mb-1">Column</label>
                      <Select
                        value={sortColumn || '__default__'}
                        onValueChange={(val) => onSortColumnChange(val === '__default__' ? '' : val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Default order" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__default__">Default order</SelectItem>
                          {selectedTable.columns.map((c) => (
                            <SelectItem key={c.id} value={c.name}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {sortColumn && (
                      <div className="flex gap-2">
                        <Button
                          variant={sortDirection === 'asc' ? 'primary' : 'default'}
                          size="small"
                          className="flex-1"
                          onClick={() => onSortDirectionChange('asc')}
                        >
                          Ascending (ASC)
                        </Button>
                        <Button
                          variant={sortDirection === 'desc' ? 'primary' : 'default'}
                          size="small"
                          className="flex-1"
                          onClick={() => onSortDirectionChange('desc')}
                        >
                          Descending (DESC)
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Add RLS policy button */}
            <Button
              variant="default"
              size="small"
              iconLeft={<PlusCircle className="h-3.5 w-3.5 shrink-0" />}
              className="text-xs shrink-0 whitespace-nowrap px-2.5 h-[28px] text-foreground-light hover:text-foreground cursor-pointer"
              onClick={onAddRlsPolicy}
            >
              Add RLS policy
            </Button>

            <Button variant="default" size="small" disabled title="Role impersonation is not exposed by the connected API" className="text-xs shrink-0 whitespace-nowrap px-2.5 h-[28px] gap-1 text-foreground-muted">
              Role <span className="font-semibold font-mono">unavailable</span><ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
            </Button>

            {/* More options button */}
            <Button
              variant="default"
              size="small"
              className="h-[28px] w-[28px] p-0 flex items-center justify-center text-foreground-lighter hover:text-foreground shrink-0 cursor-pointer"
              title="More options"
              disabled
              aria-label="More table options unavailable"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>

            {/* Refresh button */}
            <Button
              variant="default"
              size="small"
              onClick={onRefresh}
              className="h-[28px] w-[28px] p-0 flex items-center justify-center text-foreground-lighter hover:text-foreground shrink-0 cursor-pointer"
              title="Refresh data"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>

            {/* Insert Dropdown Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="primary"
                  size="small"
                  className="gap-1 font-medium shadow-xs"
                >
                  <span>Insert</span>
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={onInsertRow}
                  className="flex items-center justify-between py-1.5 px-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Rows className="h-3.5 w-3.5 text-foreground-lighter" />
                    <span>Insert row</span>
                  </div>
                  <kbd className="text-[10px] font-mono text-foreground-lighter bg-surface-200 px-1 py-0.5 rounded">
                    I then R
                  </kbd>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onInsertColumn}
                  className="flex items-center justify-between py-1.5 px-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Columns className="h-3.5 w-3.5 text-foreground-lighter" />
                    <span>Insert column</span>
                  </div>
                  <kbd className="text-[10px] font-mono text-foreground-lighter bg-surface-200 px-1 py-0.5 rounded">
                    I then C
                  </kbd>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled
                  title="Bulk CSV import is not provided by the connected API"
                  className="flex items-center justify-between py-1.5 px-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-foreground-lighter" />
                    <span>Import data from CSV</span>
                  </div>
                  <kbd className="text-[10px] font-mono text-foreground-lighter bg-surface-200 px-1 py-0.5 rounded">
                    I then U
                  </kbd>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}
    </div>
  )
}
