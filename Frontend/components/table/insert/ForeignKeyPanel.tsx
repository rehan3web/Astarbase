'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Info, RotateCcw, X } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStudio } from '@/components/providers/StudioProvider'
import { api, type Diagram, type SchemaNode, errorMessage } from '@/lib/api'
import { foreignKeyActions, type ForeignKeyAction, type ForeignKeyDraft } from '@/lib/foreign-keys'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

interface ForeignKeyPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tableName: string
  sourceColumn: string
  sourceType: string
  initialDraft: ForeignKeyDraft | null
  onSave: (draft: ForeignKeyDraft) => void
}

const tableKey = (table: Pick<SchemaNode, 'schema' | 'name'>) => JSON.stringify([table.schema, table.name])

export function ForeignKeyPanel({
  open,
  onOpenChange,
  tableName,
  sourceColumn,
  sourceType,
  initialDraft,
  onSave,
}: ForeignKeyPanelProps) {
  const { database } = useStudio()
  const [tables, setTables] = useState<SchemaNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [targetTableKey, setTargetTableKey] = useState('')
  const [targetColumn, setTargetColumn] = useState('')
  const [onDelete, setOnDelete] = useState<ForeignKeyAction>('NO ACTION')
  const [onUpdate, setOnUpdate] = useState<ForeignKeyAction>('NO ACTION')
  const [helpOpen, setHelpOpen] = useState(false)
  const previousDatabase = useRef(database)

  const targetTable = useMemo(
    () => tables.find((table) => tableKey(table) === targetTableKey),
    [tables, targetTableKey]
  )

  useEffect(() => {
    const databaseChanged = previousDatabase.current !== database
    previousDatabase.current = database
    if (!open) {
      setTargetTableKey('')
      setTargetColumn('')
      setOnDelete('NO ACTION')
      setOnUpdate('NO ACTION')
      setHelpOpen(false)
      return
    }
    if (databaseChanged) {
      setTargetTableKey('')
      setTargetColumn('')
      setOnDelete('NO ACTION')
      setOnUpdate('NO ACTION')
      return
    }
    if (initialDraft) {
      setTargetTableKey(JSON.stringify([initialDraft.targetSchema, initialDraft.targetTable]))
      setTargetColumn(initialDraft.targetColumn)
      setOnDelete(initialDraft.onDelete)
      setOnUpdate(initialDraft.onUpdate)
    } else {
      setTargetTableKey('')
      setTargetColumn('')
      setOnDelete('NO ACTION')
      setOnUpdate('NO ACTION')
    }
  }, [open, database, initialDraft])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setTables([])
    void api<Diagram>(`/databases/${encodeURIComponent(database)}/schema`, { signal: controller.signal })
      .then((diagram) => {
        if (!controller.signal.aborted) setTables(diagram.nodes || [])
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [open, database, retryCount])

  const canSave = !!targetTable && targetTable.columns.some(column => column.name === targetColumn) && !!sourceColumn.trim()

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (!canSave || !targetTable) return
      onSave({
        targetSchema: targetTable.schema,
        targetTable: targetTable.name,
        targetColumn,
        onDelete,
        onUpdate,
      })
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, canSave, targetTable, targetColumn, onDelete, onUpdate, onSave])

  const handleSave = () => {
    if (!canSave || !targetTable) return
    onSave({
      targetSchema: targetTable.schema,
      targetTable: targetTable.name,
      targetColumn,
      onDelete,
      onUpdate,
    })
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[1px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby="foreign-key-panel-description"
          className={cn(
            'fixed inset-y-0 right-0 z-[60] flex h-full w-full max-w-2xl flex-col border-l border-default bg-surface-100 text-foreground shadow-2xl outline-none',
            'duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
        >
          <header className="flex shrink-0 items-start justify-between gap-6 border-b border-default px-6 py-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight text-foreground">
                Add foreign key relationship to <span className="font-mono text-sm">{tableName}</span>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description id="foreign-key-panel-description" className="sr-only">
                Choose a table and column that this new column will reference.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close foreign key panel"
              className="rounded-md p-1.5 text-foreground-lighter transition-colors hover:bg-surface-200 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
            <section className="rounded-lg border border-default bg-surface-200/50">
              <button
                type="button"
                aria-expanded={helpOpen}
                onClick={() => setHelpOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-200"
              >
                <Info className="h-4 w-4 text-brand" />
                <span>What are foreign keys?</span>
                <span className="ml-auto text-[11px] text-foreground-lighter">{helpOpen ? 'Hide' : 'Learn more'}</span>
              </button>
              {helpOpen && (
                <p className="border-t border-default px-4 py-3 text-xs leading-relaxed text-foreground-lighter">
                  A foreign key links this column to a column in another table. The database enforces that
                  referenced values exist and applies the selected action when a referenced row changes.
                </p>
              )}
            </section>

            <section className="space-y-5">
              <div>
                <label htmlFor="foreign-key-target-table" className="mb-2 block text-xs font-medium text-foreground">
                  Table to reference
                </label>
                <Select
                  value={targetTableKey}
                  onValueChange={(value) => {
                    setTargetTableKey(value)
                    setTargetColumn('')
                  }}
                  disabled={loading || !!error || tables.length === 0}
                >
                  <SelectTrigger id="foreign-key-target-table" aria-label="Select a table to reference">
                    <SelectValue placeholder={loading ? <Spinner size={14} aria-label="Loading tables" /> : 'Select a table to reference…'} />
                  </SelectTrigger>
                  <SelectContent data-foreign-key-select>
                    {tables.map((table) => (
                      <SelectItem key={tableKey(table)} value={tableKey(table)}>
                        {table.schema}.{table.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {loading && <div role="status" aria-label="Loading tables" className="mt-3 flex justify-center"><Spinner size={18} /></div>}
                {error && (
                  <div role="alert" className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
                    <p className="text-xs text-foreground">{error}</p>
                    <button
                      type="button"
                      onClick={() => setRetryCount((value) => value + 1)}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )}
                {!loading && !error && tables.length === 0 && (
                  <p className="mt-3 rounded-md border border-default bg-surface-200/50 px-3 py-2.5 text-xs text-foreground-lighter">
                    No tables are available in this database yet.
                  </p>
                )}
              </div>

              {targetTable && (
                <div>
                  <label htmlFor="foreign-key-target-column" className="mb-2 block text-xs font-medium text-foreground">
                    Referenced column
                  </label>
                  <Select value={targetColumn} onValueChange={setTargetColumn}>
                    <SelectTrigger id="foreign-key-target-column" aria-label="Select a referenced column">
                      <SelectValue placeholder="Select a column…" />
                    </SelectTrigger>
                    <SelectContent data-foreign-key-select>
                      {targetTable.columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-[11px] leading-relaxed text-foreground-lighter">
                    The referenced column should have a PRIMARY KEY or UNIQUE constraint. The database validates
                    type compatibility and uniqueness when the column is saved.
                  </p>
                </div>
              )}
            </section>

            <section className="space-y-3 border-t border-default pt-5">
              <h2 className="text-xs font-semibold text-foreground">Column mapping</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-foreground-lighter">This column</label>
                  <div className="min-h-9 rounded-md border border-default bg-surface-200 px-3 py-2 font-mono text-xs text-foreground">
                    {sourceColumn.trim() ? sourceColumn : <span className="text-foreground-lighter">Name your column first</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-foreground-lighter">{sourceType || 'No type selected'}</p>
                </div>
                <span aria-hidden="true" className="hidden pb-5 text-foreground-lighter sm:block">→</span>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-foreground-lighter">References</label>
                  <div className="min-h-9 rounded-md border border-default bg-surface-200 px-3 py-2 font-mono text-xs text-foreground">
                    {targetTable && targetColumn
                      ? `${targetTable.schema}.${targetTable.name}.${targetColumn}`
                      : <span className="font-sans text-foreground-lighter">Choose a table and column</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-foreground-lighter">
                    {targetTable?.columns.find((column) => column.name === targetColumn)?.type || '—'}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 border-t border-default pt-5 sm:grid-cols-2">
              <div>
                <label htmlFor="foreign-key-on-delete" className="mb-2 block text-xs font-medium text-foreground">On delete</label>
                <Select value={onDelete} onValueChange={(value) => setOnDelete(value as ForeignKeyAction)}>
                  <SelectTrigger id="foreign-key-on-delete" aria-label="On delete action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-foreign-key-select>
                    {foreignKeyActions.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="foreign-key-on-update" className="mb-2 block text-xs font-medium text-foreground">On update</label>
                <Select value={onUpdate} onValueChange={(value) => setOnUpdate(value as ForeignKeyAction)}>
                  <SelectTrigger id="foreign-key-on-update" aria-label="On update action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent data-foreign-key-select>
                    {foreignKeyActions.map((action) => <SelectItem key={action} value={action}>{action}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-default bg-surface-100 px-6 py-4">
            <p className="hidden text-[11px] text-foreground-lighter sm:block">Applied when you save the column</p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-strong bg-surface-100 px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-surface-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSave}
                className="flex items-center gap-2 rounded-md border border-[#338161] bg-[#086E43] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#065836] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save
                <span className="font-mono text-[10px] opacity-75">Ctrl ↵</span>
              </button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
