'use client'

import React from 'react'
import {
    ArrowDown,
    ArrowUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    Lock,
    Plus,
    SquarePen,
    Trash,
    Unlock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PrimaryKeyIcon } from '@/components/ui/primary-key-icon'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnDefinition, TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

export type ColumnAction =
    | 'sort-asc'
    | 'sort-desc'
    | 'copy-name'
    | 'edit'
    | 'toggle-freeze'
    | 'delete'

/** Width used for frozen (sticky) columns so their left offsets can be computed */
const FROZEN_COL_WIDTH = 180
const CHECKBOX_COL_WIDTH = 40

interface TableDataGridProps {
    selectedTable: TableDefinition
    displayedRows: Record<string, any>[]
    selectedRowIds: Set<string>
    onToggleSelectAll: () => void
    onToggleSelectRow: (idx: string) => void
    onInsertColumn: () => void
    sortColumn?: string
    sortDirection?: 'asc' | 'desc'
    frozenColumnIds?: Set<string>
    onColumnAction?: (column: ColumnDefinition, action: ColumnAction) => void
    onUpdateCell?: (rowIdx: number, colName: string, value: any) => void
    hideFooter?: boolean
}

export function TableDataGrid({
    selectedTable,
    displayedRows,
    selectedRowIds,
    onToggleSelectAll,
    onToggleSelectRow,
    onInsertColumn,
    sortColumn,
    sortDirection,
    frozenColumnIds,
    onColumnAction,
    onUpdateCell,
    hideFooter,
}: TableDataGridProps) {
    const [editingCell, setEditingCell] = React.useState<{rowIdx: number, colName: string} | null>(null)
    const [editValue, setEditValue] = React.useState('')
    const saved = React.useRef(false)

    const handleCellDoubleClick = (rowIdx: number, colName: string, currentValue: any) => {
        if (!onUpdateCell) return
        saved.current = false
        setEditingCell({ rowIdx, colName })
        setEditValue(currentValue === null || currentValue === undefined ? '' : typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue))
    }

    const handleCellSave = () => {
        if (saved.current) return
        saved.current = true
        if (editingCell && onUpdateCell) {
            onUpdateCell(editingCell.rowIdx, editingCell.colName, editValue)
        }
        setEditingCell(null)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleCellSave()
        } else if (e.key === 'Escape') {
            setEditingCell(null)
        }
    }

    const frozen = frozenColumnIds ?? new Set<string>()
    // Frozen columns are rendered first so they can stick to the left edge
    const orderedColumns = [
        ...selectedTable.columns.filter((c) => frozen.has(c.id)),
        ...selectedTable.columns.filter((c) => !frozen.has(c.id)),
    ]
    const hasFrozen = frozen.size > 0
    const frozenStyle = (colIdx: number): React.CSSProperties | undefined =>
        colIdx < frozen.size
            ? {
                position: 'sticky',
                left: CHECKBOX_COL_WIDTH + colIdx * FROZEN_COL_WIDTH,
                width: FROZEN_COL_WIDTH,
                minWidth: FROZEN_COL_WIDTH,
                maxWidth: FROZEN_COL_WIDTH,
            }
            : undefined

    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <div className="flex-1 overflow-auto bg-studio">
                <table className="w-full border-collapse text-left text-xs font-mono select-text">
                    {/* Header Row */}
                    <thead className="sticky top-0 z-20 bg-white dark:bg-surface-100 border-b border-default">
                        <tr>
                            {/* Checkbox column */}
                            <th
                                className={cn(
                                    'w-10 px-3 py-2 text-center border-r border-default bg-white dark:bg-surface-100',
                                    hasFrozen && 'sticky left-0 z-10'
                                )}
                            >
                                <div className="flex items-center justify-center">
                                    <Checkbox
                                        checked={displayedRows.length > 0 && selectedRowIds.size === displayedRows.length}
                                        indeterminate={selectedRowIds.size > 0 && selectedRowIds.size < displayedRows.length}
                                        onCheckedChange={onToggleSelectAll}
                                        aria-label="Select all rows"
                                    />
                                </div>
                            </th>

                            {/* Columns header */}
                            {orderedColumns.map((col, colIdx) => {
                                const isFrozen = frozen.has(col.id)
                                const isSorted = sortColumn === col.name
                                const act = (action: ColumnAction) => onColumnAction?.(col, action)
                                return (
                                    <th
                                        key={col.id}
                                        style={frozenStyle(colIdx)}
                                        className={cn(
                                            'px-3 py-2 border-r border-default text-foreground font-medium whitespace-nowrap bg-white dark:bg-surface-100 group select-none',
                                            isFrozen && 'z-10'
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {col.isPrimaryKey && (
                                                    <PrimaryKeyIcon className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                                                )}
                                                <span className="font-semibold text-foreground truncate">{col.name}</span>
                                                <span className="text-[11px] font-normal text-foreground-lighter font-sans">
                                                    {col.format}
                                                </span>
                                                {isSorted &&
                                                    (sortDirection === 'desc' ? (
                                                        <ArrowDown className="h-3 w-3 text-foreground-lighter shrink-0" />
                                                    ) : (
                                                        <ArrowUp className="h-3 w-3 text-foreground-lighter shrink-0" />
                                                    ))}
                                                {isFrozen && <Lock className="h-3 w-3 text-foreground-lighter shrink-0" />}
                                            </div>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button
                                                        type="button"
                                                        aria-label={`Column options for ${col.name}`}
                                                        className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md bg-surface-200/60 hover:bg-surface-200 text-foreground-lighter hover:text-foreground data-[state=open]:bg-surface-200 data-[state=open]:text-foreground transition-colors cursor-pointer"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-48">
                                                    <DropdownMenuItem onSelect={() => act('sort-asc')}>
                                                        <ArrowUp className="shrink-0" />
                                                        <span>Sort Ascending</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => act('sort-desc')}>
                                                        <ArrowDown className="shrink-0" />
                                                        <span>Sort Descending</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem onSelect={() => act('copy-name')}>
                                                        <Copy className="shrink-0" />
                                                        <span>Copy name</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => act('edit')}>
                                                        <SquarePen className="shrink-0" />
                                                        <span>Edit column</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onSelect={() => act('toggle-freeze')}>
                                                        {isFrozen ? <Unlock className="shrink-0" /> : <Lock className="shrink-0" />}
                                                        <span>{isFrozen ? 'Unfreeze column' : 'Freeze column'}</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem
                                                        onSelect={() => act('delete')}
                                                        className="text-red-500 hover:text-red-500 focus:text-red-500 hover:bg-red-500/10 focus:bg-red-500/10"
                                                    >
                                                        <Trash className="shrink-0" />
                                                        <span>Delete column</span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </th>
                                )
                            })}

                            {/* Add Column Button Header */}
                            <th className="w-10 px-2 py-2 border-r border-default text-center bg-white dark:bg-surface-100">
                                <button
                                    onClick={onInsertColumn}
                                    className="w-5 h-5 inline-flex items-center justify-center rounded text-foreground-lighter hover:text-foreground hover:bg-surface-200 transition-colors cursor-pointer"
                                    title="Add column"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            </th>
                        </tr>
                    </thead>

                    {/* Body Rows */}
                    <tbody className="divide-y divide-default">
                        {displayedRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={selectedTable.columns.length + 2}
                                    className="text-center py-16 text-foreground-lighter font-sans"
                                >
                                    No rows found matching current filters.
                                </td>
                            </tr>
                        ) : (
                            displayedRows.map((row, idx) => {
                                const isRowSelected = selectedRowIds.has(String(idx))
                                return (
                                    <tr
                                        key={idx}
                                        className={cn(
                                            'hover:bg-surface-100 transition-colors group',
                                            isRowSelected && 'bg-brand-500/5'
                                        )}
                                    >
                                        {/* Row checkbox */}
                                        <td
                                            className={cn(
                                                'w-10 px-3 py-2 text-center border-r border-default bg-surface-75/30',
                                                hasFrozen && 'sticky left-0 z-[5] bg-studio'
                                            )}
                                        >
                                            <div className="flex items-center justify-center">
                                                <Checkbox
                                                    checked={isRowSelected}
                                                    onCheckedChange={() => onToggleSelectRow(String(idx))}
                                                    aria-label={`Select row ${idx + 1}`}
                                                />
                                            </div>
                                        </td>

                                        {/* Data cells */}
                                        {orderedColumns.map((col, colIdx) => {
                                            const val = row[col.name]
                                            const isNull = val === null || val === undefined
                                            const isFrozen = frozen.has(col.id)
                                            return (
                                                <td
                                                    key={col.id}
                                                    style={frozenStyle(colIdx)}
                                                    onDoubleClick={() => handleCellDoubleClick(idx, col.name, val)}
                                                    className={cn(
                                                        'px-3 py-2 border-r border-default whitespace-nowrap max-w-xs truncate text-foreground-light group-hover:text-foreground transition-colors cursor-text',
                                                        isFrozen && 'z-[5] bg-studio'
                                                    )}
                                                >
                                                    {editingCell?.rowIdx === idx && editingCell?.colName === col.name ? (
                                                        <input
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={(e) => setEditValue(e.target.value)}
                                                            onBlur={handleCellSave}
                                                            onKeyDown={handleKeyDown}
                                                            className="w-full bg-surface-200 text-foreground border border-brand-500 rounded px-1.5 py-0.5 outline-none -mx-1.5 -my-0.5 h-6"
                                                        />
                                                    ) : isNull ? (
                                                        <span className="text-foreground-muted italic font-sans text-[11px]">
                                                            null
                                                        </span>
                                                    ) : col.format === 'boolean' ? (
                                                        <span
                                                            className={cn(
                                                                'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase',
                                                                val ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                                            )}
                                                        >
                                                            {String(val)}
                                                        </span>
                                                    ) : col.format === 'uuid' ? (
                                                        <span className="text-foreground font-mono text-[11px]">
                                                            {val}
                                                        </span>
                                                    ) : col.format === 'timestamptz' ? (
                                                        <span className="text-foreground-lighter text-[11px]">
                                                            {val}
                                                        </span>
                                                    ) : (
                                                        <span>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                                                    )}
                                                </td>
                                            )
                                        })}

                                        {/* Extra empty cell for + column */}
                                        <td className="w-10 border-r border-default bg-surface-75/10"></td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Bottom Footer: Row counts & Pagination */}
            {!hideFooter && <div className="h-10 shrink-0 border-t border-default bg-dash-sidebar flex items-center justify-between px-3 text-xs select-none">
                <div className="flex items-center gap-3 text-foreground-lighter">
                    <span>
                        Showing{' '}
                        <strong className="text-foreground font-mono">
                            1 - {displayedRows.length}
                        </strong>{' '}
                        of{' '}
                        <strong className="text-foreground font-mono">
                            {selectedTable.estimatedRowCount.toLocaleString()}
                        </strong>{' '}
                        rows
                    </span>
                    {selectedRowIds.size > 0 && (
                        <span className="text-brand-500 font-medium">
                            ({selectedRowIds.size} selected)
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <Button variant="outline" size="tiny" disabled>
                        <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <span className="px-2 font-mono text-[11px] text-foreground">1</span>
                    <Button variant="outline" size="tiny" disabled>
                        <ChevronRight className="h-3 w-3" />
                    </Button>
                </div>
            </div>}
        </div>
    )
}
