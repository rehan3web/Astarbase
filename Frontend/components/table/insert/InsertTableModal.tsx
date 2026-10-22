'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Plus, Trash2, X } from 'lucide-react'
import { TableDefinition, ColumnDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { PrimaryKeyIcon } from '@/components/ui/primary-key-icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface InsertTableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schemaName: string
  onInsertTable: (newTable: TableDefinition) => void
}

interface TempColumn {
  id: string
  name: string
  type: string
  defaultValue: string
  isPrimaryKey: boolean
  isNullable: boolean
  isArray?: boolean
}

export function InsertTableModal({
  open,
  onOpenChange,
  schemaName,
  onInsertTable,
}: InsertTableModalProps) {
  const [tableName, setTableName] = useState('')
  const [tableDescription, setTableDescription] = useState('')
  const [enableRls, setEnableRls] = useState(true)
  const [enableRealtime, setEnableRealtime] = useState(false)
  const [columns, setColumns] = useState<TempColumn[]>([
    {
      id: 'col-1',
      name: 'id',
      type: 'int8',
      defaultValue: '',
      isPrimaryKey: true,
      isNullable: false,
    },
    {
      id: 'col-2',
      name: 'created_at',
      type: 'timestamptz',
      defaultValue: 'now()',
      isPrimaryKey: false,
      isNullable: false,
    },
  ])
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => nameInputRef.current?.focus(), 150)
      setTableName('')
      setTableDescription('')
      setEnableRls(true)
      setEnableRealtime(false)
      setColumns([
        {
          id: 'col-1',
          name: 'id',
          type: 'int8',
          defaultValue: '',
          isPrimaryKey: true,
          isNullable: false,
        },
        {
          id: 'col-2',
          name: 'created_at',
          type: 'timestamptz',
          defaultValue: 'now()',
          isPrimaryKey: false,
          isNullable: false,
        },
      ])
    }
  }, [open])

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      {
        id: `col-${Date.now()}`,
        name: `column_${prev.length + 1}`,
        type: 'text',
        defaultValue: '',
        isPrimaryKey: false,
        isNullable: true,
      },
    ])
  }

  const handleRemoveColumn = (id: string) => {
    if (columns.length <= 1) return
    setColumns((prev) => prev.filter((c) => c.id !== id))
  }

  const handleUpdateColumn = (id: string, updates: Partial<TempColumn>) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    )
  }

  const handleSave = useCallback(() => {
    if (!tableName.trim()) return

    const tableCols: ColumnDefinition[] = columns.map((c) => ({
      id: c.id,
      name: c.name.trim().toLowerCase() || 'column',
      format: c.type,
      dataType: c.type,
      isPrimaryKey: c.isPrimaryKey,
      isNullable: c.isNullable,
      defaultValue: c.defaultValue || null,
      description: '',
    }))

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

    onInsertTable(newTable)
  }, [tableName, tableDescription, enableRls, columns, schemaName, onInsertTable, onOpenChange])

  // Keyboard shortcut Ctrl+Enter to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      }
    }
    if (open) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handleSave])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Dimmed backdrop overlay */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Slide-over Right Panel */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 h-full w-full max-w-2xl bg-white dark:bg-surface-100 border-l border-gray-200 dark:border-default shadow-2xl flex flex-col outline-none select-none',
            'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-default shrink-0">
            <div className="flex items-center gap-2">
              <DialogPrimitive.Title className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span>Create a new table</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white dark:bg-surface-200 text-foreground-lighter border border-gray-300 dark:border-strong font-normal">
                  schema: {schemaName}
                </span>
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="p-1 rounded-md text-foreground-lighter hover:text-foreground hover:bg-gray-100 dark:hover:bg-surface-200 transition-colors cursor-pointer">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable Form Body matching InsertColumnModal layout */}
          <div className="flex-1 overflow-y-auto px-6 py-5 divide-y divide-gray-200 dark:divide-default">
            {/* 1. General Section */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start first:pt-0">
              <div className="col-span-4">
                <span className="text-xs font-medium text-foreground-lighter">General</span>
              </div>
              <div className="col-span-8 space-y-4">
                <div>
                  <label className="text-xs text-foreground block mb-1 font-medium">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    ref={nameInputRef}
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="e.g. products"
                    className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs font-mono outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                  />
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Recommended to use lowercase and use an underscore to separate words e.g.{' '}
                    <code className="text-foreground font-mono bg-white dark:bg-surface-200 px-1 py-0.5 rounded text-[10px]">
                      table_name
                    </code>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-foreground font-medium">Description</label>
                    <span className="text-[11px] text-foreground-lighter">Optional</span>
                  </div>
                  <input
                    value={tableDescription}
                    onChange={(e) => setTableDescription(e.target.value)}
                    placeholder="Optional description"
                    className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                  />
                </div>
              </div>
            </div>

            {/* 2. Row Level Security (RLS) Section - Same Switch styling as InsertColumnModal */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start">
              <div className="col-span-4 space-y-1">
                <span className="text-xs font-medium text-foreground-lighter block">
                  Row Level Security
                </span>
                <span className="text-[11px] text-foreground-muted block leading-relaxed">
                  Policies restrict access to data rows for authenticated or anonymous users.
                </span>
              </div>

              <div className="col-span-8 space-y-5">
                {/* Enable RLS */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-foreground block">
                      Enable Row Level Security (RLS)
                    </span>
                    <span className="text-[11px] text-foreground-lighter leading-relaxed block">
                      Restricts access to rows in this table by applying PostgreSQL security policies.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableRls}
                    onClick={() => setEnableRls(!enableRls)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      enableRls ? 'bg-[#086E43]' : 'bg-surface-300'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                        enableRls ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Enable Realtime */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-foreground block">
                      Enable Realtime
                    </span>
                    <span className="text-[11px] text-foreground-lighter leading-relaxed block">
                      Broadcast changes on this table to authorized subscribers in real-time.
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enableRealtime}
                    onClick={() => setEnableRealtime(!enableRealtime)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      enableRealtime ? 'bg-[#086E43]' : 'bg-surface-300'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                        enableRealtime ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Columns Section - Same Select component as InsertColumnModal */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start">
              <div className="col-span-4 space-y-2">
                <span className="text-xs font-medium text-foreground-lighter block">
                  Columns
                </span>
                <span className="text-[11px] text-foreground-muted block leading-relaxed">
                  Specify the columns for this table. An id primary key is included by default.
                </span>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="w-full px-2.5 py-1.5 text-xs rounded border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 hover:bg-gray-100 dark:hover:bg-surface-300 text-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5 font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add column</span>
                  </button>
                </div>
              </div>

              <div className="col-span-8 space-y-3">
                {columns.map((col, idx) => (
                  <div
                    key={col.id}
                    className="p-3 rounded-md border border-gray-200 dark:border-default bg-white dark:bg-surface-200/50 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-default pb-2">
                      <span className="text-xs font-medium text-foreground flex items-center gap-1.5 font-mono">
                        {col.isPrimaryKey && <PrimaryKeyIcon className="h-3 w-3 text-amber-400" />}
                        <span>{col.name || `Column ${idx + 1}`}</span>
                      </span>
                      {columns.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(col.id)}
                          className="p-1 rounded text-foreground-lighter hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Remove column"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-foreground-lighter block mb-1 font-medium">
                          Name
                        </label>
                        <input
                          value={col.name}
                          onChange={(e) =>
                            handleUpdateColumn(col.id, { name: e.target.value })
                          }
                          placeholder="Column name"
                          className="w-full h-8 px-2.5 text-xs bg-white dark:bg-surface-100 border border-gray-300 dark:border-strong rounded text-foreground font-mono placeholder:text-foreground-lighter focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                        />
                      </div>

                      {/* Custom Select matching InsertColumnModal exactly */}
                      <div>
                        <label className="text-[11px] text-foreground-lighter block mb-1 font-medium">
                          Type
                        </label>
                        <Select
                          value={col.type}
                          onValueChange={(val) =>
                            handleUpdateColumn(col.id, { type: val })
                          }
                        >
                          <SelectTrigger className="w-full h-8 text-xs font-mono bg-white dark:bg-surface-100 border border-gray-300 dark:border-strong hover:bg-white dark:hover:bg-surface-300/60 focus:border-gray-400 dark:focus:border-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0">
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-56">
                            <SelectItem value="text">text</SelectItem>
                            <SelectItem value="varchar">varchar</SelectItem>
                            <SelectItem value="int2">int2 (smallint)</SelectItem>
                            <SelectItem value="int4">int4 (integer)</SelectItem>
                            <SelectItem value="int8">int8 (bigint)</SelectItem>
                            <SelectItem value="float4">float4 (real)</SelectItem>
                            <SelectItem value="float8">float8 (double precision)</SelectItem>
                            <SelectItem value="numeric">numeric</SelectItem>
                            <SelectItem value="uuid">uuid</SelectItem>
                            <SelectItem value="boolean">boolean</SelectItem>
                            <SelectItem value="json">json</SelectItem>
                            <SelectItem value="jsonb">jsonb</SelectItem>
                            <SelectItem value="date">date</SelectItem>
                            <SelectItem value="time">time</SelectItem>
                            <SelectItem value="timestamptz">timestamptz</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] text-foreground-lighter block mb-1 font-medium">
                        Default Value
                      </label>
                      <input
                        value={col.defaultValue}
                        onChange={(e) =>
                          handleUpdateColumn(col.id, { defaultValue: e.target.value })
                        }
                        placeholder="NULL or expression e.g. now()"
                        className="w-full h-8 px-2.5 text-xs bg-white dark:bg-surface-100 border border-gray-300 dark:border-strong rounded text-foreground font-mono placeholder:text-foreground-lighter focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                      />
                    </div>

                    <div className="flex items-center gap-6 pt-1">
                      {/* Is Primary Key Switch */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={col.isPrimaryKey}
                          onClick={() =>
                            handleUpdateColumn(col.id, { isPrimaryKey: !col.isPrimaryKey })
                          }
                          className={cn(
                            'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                            col.isPrimaryKey ? 'bg-[#086E43]' : 'bg-surface-300'
                          )}
                        >
                          <span
                            className={cn(
                              'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                              col.isPrimaryKey ? 'translate-x-3' : 'translate-x-0'
                            )}
                          />
                        </button>
                        <span className="text-[11px] font-medium text-foreground">Primary Key</span>
                      </label>

                      {/* Allow Nullable Switch */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={col.isNullable}
                          onClick={() =>
                            handleUpdateColumn(col.id, { isNullable: !col.isNullable })
                          }
                          className={cn(
                            'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                            col.isNullable ? 'bg-[#086E43]' : 'bg-surface-300'
                          )}
                        >
                          <span
                            className={cn(
                              'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                              col.isNullable ? 'translate-x-3' : 'translate-x-0'
                            )}
                          />
                        </button>
                        <span className="text-[11px] font-medium text-foreground">Allow Nullable</span>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sticky Bottom Action Toolbar - Matching InsertRowModal / InsertColumnModal */}
          <div className="sticky bottom-0 bg-white dark:bg-surface-100 border-t border-gray-200 dark:border-default px-6 py-4 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3.5 py-1.5 rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-100 hover:bg-gray-100 dark:hover:bg-surface-200 text-foreground text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!tableName.trim()}
              onClick={handleSave}
              className="px-4 py-1.5 rounded-md bg-[#086E43] hover:bg-[#065836] border border-[#338161] text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>Save</span>
              <span className="text-[10px] opacity-75 font-mono">Ctrl ↵</span>
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
