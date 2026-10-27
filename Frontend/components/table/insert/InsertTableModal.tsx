'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GripVertical, Link2, Plus, Settings, X } from 'lucide-react'
import { TableDefinition, ColumnDefinition } from '@/lib/mock-data'
import type { ForeignKeyDraft } from '@/lib/foreign-keys'
import { applyColumnTypeChange, getColumnTypeOptions } from '@/lib/column-type-options'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { useInsertSave } from './useInsertSave'
import { ForeignKeyPanel } from './ForeignKeyPanel'
import { ColumnDefaultValueInput } from './ColumnDefaultValueInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface InsertTableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schemaName: string
  onInsertTable: (newTable: TableDefinition) => Promise<boolean>
}

interface TempColumn {
  id: string
  name: string
  type: string
  defaultValue: string
  isPrimaryKey: boolean
  isUnique: boolean
  isNullable: boolean
  isArray: boolean
  foreignKey: ForeignKeyDraft | null
}

const makeInitialColumns = (): TempColumn[] => [
  { id: 'column-id', name: 'id', type: 'int8', defaultValue: '', isPrimaryKey: true, isUnique: false, isNullable: false, isArray: false, foreignKey: null },
  { id: 'column-created-at', name: 'created_at', type: 'timestamptz', defaultValue: 'now()', isPrimaryKey: false, isUnique: false, isNullable: false, isArray: false, foreignKey: null },
]

const typeOptions = [
  ['text', 'text'], ['varchar', 'varchar'], ['int2', 'int2 (smallint)'],
  ['int4', 'int4 (integer)'], ['int8', 'int8 (bigint)'], ['float4', 'float4 (real)'],
  ['float8', 'float8 (double precision)'], ['numeric', 'numeric'], ['uuid', 'uuid'],
  ['boolean', 'boolean'], ['json', 'json'], ['jsonb', 'jsonb'], ['date', 'date'],
  ['time', 'time'], ['timestamptz', 'timestamptz'],
]

export function InsertTableModal({ open, onOpenChange, schemaName, onInsertTable }: InsertTableModalProps) {
  const { saving, save } = useInsertSave()
  const [tableName, setTableName] = useState('')
  const [tableDescription, setTableDescription] = useState('')
  const [enableRls, setEnableRls] = useState(true)
  const [columns, setColumns] = useState<TempColumn[]>(makeInitialColumns)
  const [settingsColumnId, setSettingsColumnId] = useState<string | null>(null)
  const [defaultColumnId, setDefaultColumnId] = useState<string | null>(null)
  const [foreignKeyOpen, setForeignKeyOpen] = useState(false)
  const [foreignKeySourceId, setForeignKeySourceId] = useState<string | null>(null)
  const idSequence = useRef(0)
  const draggedColumnId = useRef<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTimeout(() => nameInputRef.current?.focus(), 150)
    setTableName('')
    setTableDescription('')
    setEnableRls(true)
    setColumns(makeInitialColumns())
    setSettingsColumnId(null)
    setDefaultColumnId(null)
    setForeignKeyOpen(false)
    setForeignKeySourceId(null)
  }, [open])

  const handleAddColumn = () => {
    idSequence.current += 1
    setColumns((previous) => [...previous, {
      id: `column-${Date.now()}-${idSequence.current}`,
      name: `column_${previous.length + 1}`,
      type: 'text',
      defaultValue: '',
      isPrimaryKey: false,
      isUnique: false,
      isNullable: true,
      isArray: false,
      foreignKey: null,
    }])
  }

  const handleRemoveColumn = (id: string) => {
    setColumns((previous) => previous.length > 1 ? previous.filter((column) => column.id !== id) : previous)
    if (settingsColumnId === id) setSettingsColumnId(null)
    if (defaultColumnId === id) setDefaultColumnId(null)
    if (foreignKeySourceId === id) {
      setForeignKeySourceId(null)
      setForeignKeyOpen(false)
    }
  }

  const updateColumn = (id: string, updates: Partial<TempColumn>) => {
    setColumns((previous) => previous.map((column) => column.id === id
      ? ('type' in updates || 'isArray' in updates
        ? applyColumnTypeChange(column, updates)
        : { ...column, ...updates })
      : column))
  }

  const reorderColumn = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    setColumns((previous) => {
      const sourceIndex = previous.findIndex((column) => column.id === sourceId)
      const targetIndex = previous.findIndex((column) => column.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return previous
      const reordered = [...previous]
      const [moved] = reordered.splice(sourceIndex, 1)
      reordered.splice(targetIndex, 0, moved)
      return reordered
    })
  }

  const handleSave = useCallback(async () => {
    if (settingsColumnId || defaultColumnId || foreignKeyOpen || saving || !tableName.trim()) return
    const tableCols: ColumnDefinition[] = columns.map((column) => {
      const submittedType = `${column.type}${column.isArray ? '[]' : ''}`
      return {
        id: column.id,
        name: column.name.trim().toLowerCase() || 'column',
        format: submittedType,
        dataType: submittedType,
        isPrimaryKey: column.isPrimaryKey,
        isUnique: column.isUnique,
        isNullable: column.isNullable,
        defaultValue: column.defaultValue || null,
        description: '',
        ...(column.foreignKey ? { foreignKey: column.foreignKey } : {}),
      }
    })
    const newTable: TableDefinition = {
      id: `tbl-${Date.now()}`,
      name: tableName.trim().toLowerCase(),
      schema: schemaName,
      comment: tableDescription,
      rlsEnabled: enableRls,
      estimatedRowCount: 0,
      columns: tableCols,
      rows: [],
    }
    await save(() => onInsertTable(newTable))
  }, [columns, defaultColumnId, enableRls, foreignKeyOpen, onInsertTable, save, saving, schemaName, settingsColumnId, tableDescription, tableName])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (foreignKeyOpen || settingsColumnId || defaultColumnId || saving) return
        event.preventDefault()
        void handleSave()
      }
    }
    if (open) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [defaultColumnId, foreignKeyOpen, handleSave, open, saving, settingsColumnId])

  const activeForeignKeyColumn = columns.find((column) => column.id === foreignKeySourceId)
  const localSources = columns.map(({ id, name, type, isArray }) => ({ id, name, type: `${type}${isArray ? '[]' : ''}` }))
  const openForeignKeyEditor = (sourceId?: string) => {
    setForeignKeySourceId(sourceId ?? foreignKeySourceId ?? columns[0]?.id ?? null)
    setSettingsColumnId(null)
    setDefaultColumnId(null)
    setForeignKeyOpen(true)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next) }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className={cn(
          'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-4xl flex-col border-l border-gray-200 dark:border-default bg-white dark:bg-surface-100 text-foreground shadow-2xl outline-none',
          'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
        )}>
          <header className="flex shrink-0 items-center justify-between border-b border-gray-200 dark:border-default px-6 py-4">
            <div className="flex items-center gap-2">
              <DialogPrimitive.Title className="text-sm font-semibold">Create a new table</DialogPrimitive.Title>
              <span className="rounded border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 px-2 py-0.5 font-mono text-xs text-foreground-lighter">schema: {schemaName}</span>
            </div>
            <DialogPrimitive.Close disabled={saving} className="rounded-md p-1.5 text-foreground-lighter hover:bg-gray-100 dark:hover:bg-surface-200 hover:text-foreground">
              <X className="h-4 w-4" /><span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </header>

          <fieldset disabled={saving} className="min-w-0 flex-1 overflow-y-auto divide-y divide-gray-200 dark:divide-default px-6 py-5">
            <section className="grid grid-cols-12 items-start gap-4 py-5 first:pt-0">
              <div className="col-span-12 md:col-span-4">
                <span className="text-xs font-medium text-foreground-lighter">General</span>
              </div>
              <div className="col-span-12 space-y-4 md:col-span-8">
                <div>
                  <label className="mb-1 block text-xs font-medium">Name <span className="text-destructive">*</span></label>
                  <input ref={nameInputRef} value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="e.g. products" className="h-8 w-full rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 px-3 font-mono text-xs outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200" />
                  <p className="mt-1 text-[11px] text-foreground-lighter">Use lowercase names and underscores, for example <code className="font-mono text-foreground">table_name</code>.</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Description <span className="text-[11px] font-normal text-foreground-lighter">Optional</span></label>
                  <input value={tableDescription} onChange={(event) => setTableDescription(event.target.value)} placeholder="Optional description" className="h-8 w-full rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 px-3 text-xs outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200" />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-12 items-start gap-4 py-5">
              <div className="col-span-12 space-y-1 md:col-span-4">
                <span className="block text-xs font-medium text-foreground-lighter">Row Level Security</span>
                <span className="block text-[11px] leading-relaxed text-foreground-muted">Policies restrict access to data rows.</span>
              </div>
              <div className="col-span-12 md:col-span-8">
                <label className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium">Enable Row Level Security (RLS)</span>
                  <button type="button" role="switch" aria-checked={enableRls} onClick={() => setEnableRls((value) => !value)} className={cn('relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors', enableRls ? 'bg-[#086E43]' : 'bg-surface-300')}>
                    <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', enableRls ? 'translate-x-4' : 'translate-x-0')} />
                  </button>
                </label>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground-lighter">Restricts access to rows through PostgreSQL security policies.</p>
              </div>
            </section>

            <section className="py-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xs font-medium text-foreground-lighter">Columns</h2>
                  <p className="mt-1 text-[11px] text-foreground-muted">Define the fields in this table. An id primary key is included by default.</p>
                </div>
                <button type="button" onClick={() => openForeignKeyEditor()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 px-3 text-xs font-medium hover:bg-gray-100 dark:hover:bg-surface-300">
                  <Link2 className="h-3.5 w-3.5" /> Add foreign key relationship{columns.some((column) => column.foreignKey) ? ` · ${columns.filter((column) => column.foreignKey).length}` : ''}
                </button>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[690px]">
                  <div className="grid grid-cols-[28px_minmax(150px,1.15fr)_minmax(150px,1fr)_minmax(130px,.95fr)_64px_76px] items-center gap-2 px-2 pb-2 text-[11px] font-medium text-foreground-lighter">
                    <span aria-hidden="true" />
                    <span>Name</span><span>Type</span><span>Default value</span><span className="text-center">Primary</span><span className="sr-only">Settings</span>
                  </div>
                  <div className="space-y-1">
                    {columns.map((column) => (
                      <div
                        key={column.id}
                        data-column-row={column.id}
                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }}
                        onDrop={(event) => {
                          event.preventDefault()
                          if (draggedColumnId.current) reorderColumn(draggedColumnId.current, column.id)
                          draggedColumnId.current = null
                        }}
                        className="group grid grid-cols-[28px_minmax(150px,1.15fr)_minmax(150px,1fr)_minmax(130px,.95fr)_64px_76px] items-center gap-2 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-gray-200 hover:bg-gray-50 dark:hover:border-default dark:hover:bg-surface-200/60"
                      >
                        <button
                          type="button"
                          draggable
                          aria-label={`Reorder ${column.name}`}
                          title="Drag to reorder · Alt + Arrow Up/Down to move"
                          onDragStart={(event) => {
                            draggedColumnId.current = column.id
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', column.id)
                          }}
                          onDragEnd={() => { draggedColumnId.current = null }}
                          onKeyDown={(event) => {
                            if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
                            const currentIndex = columns.findIndex((item) => item.id === column.id)
                            const target = columns[currentIndex + (event.key === 'ArrowUp' ? -1 : 1)]
                            if (!target) return
                            event.preventDefault()
                            reorderColumn(column.id, target.id)
                          }}
                          className="flex h-8 w-7 cursor-grab items-center justify-center rounded text-foreground-lighter hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 active:cursor-grabbing dark:hover:bg-surface-300"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <div className="relative flex min-w-0 items-center">
                          <input aria-label="Column name" value={column.name} onChange={(event) => updateColumn(column.id, { name: event.target.value })} placeholder="column_name" className="h-10 min-w-0 w-full rounded-lg border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 py-2 pl-3 pr-9 font-mono text-xs outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200" />
                          <button type="button" title={column.foreignKey ? 'Edit foreign key' : 'Add foreign key'} aria-label={column.foreignKey ? `Edit foreign key for ${column.name}` : `Add foreign key for ${column.name}`} onClick={() => openForeignKeyEditor(column.id)} className={cn('absolute right-2 rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-surface-300', column.foreignKey ? 'text-[#086E43]' : 'text-foreground-lighter')}>
                            <Link2 className="h-4 w-4" />
                          </button>
                        </div>
                        <Select value={column.type} onValueChange={(value) => updateColumn(column.id, { type: value })}>
                          <SelectTrigger aria-label={`Type for ${column.name}`} className="h-10 w-full rounded-lg border-gray-300 dark:border-strong bg-white dark:bg-surface-200 font-mono text-xs hover:bg-white dark:hover:bg-surface-300/60 focus:bg-white dark:focus:bg-surface-200 focus:border-gray-400 dark:focus:border-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0"><SelectValue placeholder="Select type…" /></SelectTrigger>
                          <SelectContent className="max-h-56">{typeOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                        <ColumnDefaultValueInput
                          label={`Default value for ${column.name}`}
                          value={column.defaultValue}
                          type={column.type}
                          isArray={column.isArray}
                          open={defaultColumnId === column.id}
                          onOpenChange={(isOpen) => {
                            if (isOpen) setSettingsColumnId(null)
                            setDefaultColumnId(isOpen ? column.id : null)
                          }}
                          onChange={(value) => updateColumn(column.id, { defaultValue: value })}
                          inputClassName="h-10"
                        />
                        <div className="flex justify-center">
                          <Checkbox aria-label={`Primary key ${column.name}`} checked={column.isPrimaryKey} disabled={!getColumnTypeOptions(column.type, column.isArray).supportsUnique} onCheckedChange={(checked) => updateColumn(column.id, { isPrimaryKey: checked, isNullable: checked ? false : column.isNullable, isUnique: checked ? false : column.isUnique })} className="h-[18px] w-[18px]" />
                        </div>
                        <div className="flex items-center justify-end gap-1">
                          <Popover open={settingsColumnId === column.id} onOpenChange={(isOpen) => {
                            if (isOpen) setDefaultColumnId(null)
                            setSettingsColumnId(isOpen ? column.id : null)
                          }}>
                            <PopoverTrigger asChild>
                              <button type="button" aria-label={`Settings for ${column.name}`} aria-expanded={settingsColumnId === column.id} className={cn('relative rounded-md border p-2 transition-colors', settingsColumnId === column.id ? 'border-gray-400 bg-gray-100 dark:bg-surface-300' : 'border-transparent text-foreground-lighter hover:border-gray-300 hover:bg-white dark:hover:border-strong dark:hover:bg-surface-200')}>
                              <Settings className="h-4 w-4" />
                              {(column.isNullable || column.isUnique || column.isArray) && <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-black px-1 text-[9px] font-semibold leading-none text-white dark:border-surface-100 dark:bg-white dark:text-black">{Number(column.isNullable) + Number(column.isUnique) + Number(column.isArray)}</span>}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" side="bottom" className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-gray-200 bg-white p-0 text-foreground shadow-lg dark:border-default dark:bg-surface-100" onKeyDown={(event) => event.stopPropagation()}>
                                <div className="relative flex h-12 items-center justify-center border-b border-gray-200 bg-gray-50/80 px-4 dark:border-default dark:bg-surface-200/70">
                                  <h3 className="text-sm font-semibold">Extra options</h3>
                                  <button type="button" aria-label="Close column settings" onClick={() => setSettingsColumnId(null)} className="absolute right-3 top-2.5 rounded p-1 text-foreground-lighter hover:bg-gray-100 dark:hover:bg-surface-200"><X className="h-3.5 w-3.5" /></button>
                                </div>
                                <div className="space-y-1 px-4 py-3">
                                <label className="flex cursor-pointer items-start gap-4 rounded-lg px-1 py-2.5">
                                  <Checkbox aria-label={`Is nullable for ${column.name}`} checked={column.isNullable} disabled={column.isPrimaryKey} onCheckedChange={(checked) => updateColumn(column.id, { isNullable: checked })} className="mt-0.5 h-5 w-5 rounded-[6px] [&_svg]:h-3.5 [&_svg]:w-3.5" />
                                  <span><span className="block text-base font-medium leading-6">Is nullable</span><span className="block text-sm leading-relaxed text-foreground-lighter">Specify if the column can assume a NULL value if no value is provided</span></span>
                                </label>
                                {getColumnTypeOptions(column.type, column.isArray).supportsUnique && !column.isPrimaryKey && (
                                <label className="flex cursor-pointer items-start gap-4 rounded-lg px-1 py-2.5">
                                  <Checkbox aria-label={`Is unique for ${column.name}`} checked={column.isUnique} onCheckedChange={(checked) => updateColumn(column.id, { isUnique: checked })} className="mt-0.5 h-5 w-5 rounded-[6px] [&_svg]:h-3.5 [&_svg]:w-3.5" />
                                  <span><span className="block text-base font-medium leading-6">Is unique</span><span className="block text-sm leading-relaxed text-foreground-lighter">Enforce if values in the column should be unique across rows</span></span>
                                </label>
                                )}
                                <label className="flex cursor-pointer items-start gap-4 rounded-lg px-1 py-2.5">
                                  <Checkbox aria-label={`Define ${column.name} as array`} checked={column.isArray} onCheckedChange={(checked) => updateColumn(column.id, { isArray: checked })} className="mt-0.5 h-5 w-5 rounded-[6px] [&_svg]:h-3.5 [&_svg]:w-3.5" />
                                  <span><span className="block text-base font-medium leading-6">Define as array</span><span className="block text-sm leading-relaxed text-foreground-lighter">Define your column as a variable-length multidimensional array</span></span>
                                </label>
                                {column.foreignKey && (
                                  <button type="button" onClick={() => updateColumn(column.id, { foreignKey: null })} className="flex w-full items-center gap-2 border-t border-gray-200 dark:border-default pt-2 text-left text-xs text-destructive hover:text-destructive/80">
                                    <X className="h-3.5 w-3.5" />Remove foreign key mapping
                                  </button>
                                )}
                                </div>
                            </PopoverContent>
                          </Popover>
                          <button type="button" aria-label={`Remove ${column.name}`} title="Remove column" onClick={() => handleRemoveColumn(column.id)} disabled={columns.length <= 1} className="rounded-md p-2 text-foreground-lighter transition-colors hover:bg-red-50 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-destructive/10">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={handleAddColumn} className="mt-3 flex min-h-[58px] w-full items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-strong bg-white dark:bg-surface-100 text-xs font-medium text-foreground transition-colors hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-surface-200">
                <span className="inline-flex items-center gap-2 rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 px-3 py-1.5 shadow-xs"><Plus className="h-3.5 w-3.5" />Add column</span>
              </button>
            </section>
          </fieldset>

          <footer className="sticky bottom-0 flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 dark:border-default bg-white dark:bg-surface-100 px-6 py-4">
            <button type="button" disabled={saving} onClick={() => onOpenChange(false)} className="rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-100 px-3.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-100 dark:hover:bg-surface-200 disabled:opacity-50">Cancel</button>
            <button type="button" disabled={saving || !tableName.trim() || !!settingsColumnId || !!defaultColumnId || foreignKeyOpen} aria-busy={saving} onClick={() => void handleSave()} className="flex items-center gap-1.5 rounded-md border border-[#338161] bg-[#086E43] px-4 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-[#065836] disabled:cursor-not-allowed disabled:opacity-50">
              {saving && <Spinner size={14} decorative />}<span>{saving ? 'Saving…' : 'Save'}</span>{!saving && <span className="font-mono text-[10px] opacity-75">Ctrl ↵</span>}
            </button>
          </footer>

          {activeForeignKeyColumn && (
            <ForeignKeyPanel
              key={activeForeignKeyColumn.id}
              open={open && foreignKeyOpen}
              onOpenChange={setForeignKeyOpen}
              tableName={tableName || 'new table'}
              sourceColumn={activeForeignKeyColumn.name}
              sourceType={`${activeForeignKeyColumn.type}${activeForeignKeyColumn.isArray ? '[]' : ''}`}
              initialDraft={activeForeignKeyColumn.foreignKey}
              sourceColumns={localSources}
              sourceColumnId={activeForeignKeyColumn.id}
              onSourceColumnChange={setForeignKeySourceId}
              onSave={(draft) => {
                if (foreignKeySourceId) updateColumn(foreignKeySourceId, { foreignKey: draft })
                setForeignKeyOpen(false)
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
