'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, Check } from 'lucide-react'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { PrimaryKeyIcon } from '@/components/ui/primary-key-icon'

interface InsertRowModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTable: TableDefinition
  newRowData: Record<string, any>
  onNewRowDataChange: (data: Record<string, any>) => void
  onInsert: (keepOpen?: boolean) => void
}

export function InsertRowModal({
  open,
  onOpenChange,
  selectedTable,
  newRowData,
  onNewRowDataChange,
  onInsert,
}: InsertRowModalProps) {
  const [createMore, setCreateMore] = useState(false)
  const [nullFields, setNullFields] = useState<Record<string, boolean>>({})
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Focus first editable input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstInputRef.current?.focus(), 150)
    }
  }, [open])

  // Save handler
  const handleSave = useCallback(() => {
    // Check if user has entered data or if we should apply defaults/primary keys
    onInsert(createMore)

  }, [createMore, onInsert])

  // Keyboard shortcut Ctrl+Enter to save, Escape to close
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

  const toggleNull = (colName: string) => {
    const isNowNull = !nullFields[colName]
    setNullFields((prev) => ({ ...prev, [colName]: isNowNull }))
    if (isNowNull) {
      onNewRowDataChange({ ...newRowData, [colName]: null })
    } else {
      const next = { ...newRowData }
      delete next[colName]
      onNewRowDataChange(next)
    }
  }

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
                <span>Insert row into</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-white dark:bg-surface-200 text-foreground border border-gray-300 dark:border-strong font-normal">
                  {selectedTable.name}
                </span>
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="p-1 rounded-md text-foreground-lighter hover:text-foreground hover:bg-gray-100 dark:hover:bg-surface-200 transition-colors cursor-pointer">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 divide-y divide-gray-200 dark:divide-default">
            {selectedTable.columns.map((c, index) => {
              const isFieldNull = !!nullFields[c.name]
              const val = newRowData[c.name] ?? ''

              return (
                <div
                  key={c.id}
                  className="grid grid-cols-12 gap-4 py-4 items-start first:pt-0 last:pb-0"
                >
                  {/* Left Column: Field Metadata */}
                  <div className="col-span-4 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="font-mono text-xs font-semibold text-foreground truncate"
                        title={c.name}
                      >
                        {c.name}
                      </span>
                      {!c.isNullable && (
                        <span className="text-destructive font-bold text-xs" title="Required">
                          *
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-surface-200 text-foreground-lighter border border-gray-300 dark:border-strong">
                        {c.dataType}
                      </span>
                      {c.isPrimaryKey && (
                        <PrimaryKeyIcon className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                      )}
                    </div>

                    {c.defaultValue && (
                      <span
                        className="text-[10px] text-foreground-muted block truncate font-mono"
                        title={c.defaultValue}
                      >
                        default: {c.defaultValue}
                      </span>
                    )}
                  </div>

                  {/* Right Column: Input Controls */}
                  <div className="col-span-8 space-y-2">
                    {c.dataType === 'boolean' ? (
                      <Select
                        disabled={isFieldNull}
                        value={isFieldNull || val === '' || val === undefined || val === null ? undefined : String(val)}
                        onValueChange={(newVal) =>
                          onNewRowDataChange({
                            ...newRowData,
                            [c.name]: newVal === 'true',
                          })
                        }
                      >
                        <SelectTrigger className="w-full bg-white dark:bg-surface-200 border-gray-300 dark:border-strong hover:bg-white dark:hover:bg-surface-300/60 focus:border-gray-400 dark:focus:border-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0">
                          <SelectValue placeholder="Choose boolean..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (c.dataType.toLowerCase().includes('timestamp') ||
                        c.dataType.toLowerCase().includes('timestamptz') ||
                        c.dataType.toLowerCase() === 'date' ||
                        c.dataType.toLowerCase() === 'time' ||
                        c.name.endsWith('_at') ||
                        c.name.endsWith('_date')) ? (
                      <DateTimePicker
                        disabled={isFieldNull}
                        mode={
                          c.dataType.toLowerCase() === 'date'
                            ? 'date'
                            : c.dataType.toLowerCase() === 'time'
                            ? 'time'
                            : 'datetime'
                        }
                        placeholder={
                          isFieldNull
                            ? 'NULL'
                            : c.defaultValue
                            ? `Default: ${c.defaultValue}`
                            : c.dataType.toLowerCase() === 'date'
                            ? 'YYYY-MM-DD'
                            : 'YYYY-MM-DD HH:mm:ss'
                        }
                        value={isFieldNull ? '' : (val !== undefined && val !== null ? String(val) : '')}
                        onChange={(newVal) =>
                          onNewRowDataChange({ ...newRowData, [c.name]: newVal })
                        }
                      />
                    ) : c.dataType === 'json' || c.dataType === 'jsonb' ? (
                      <textarea
                        disabled={isFieldNull}
                        rows={3}
                        placeholder={c.defaultValue ? `Default: ${c.defaultValue}` : '{}'}
                        value={isFieldNull ? '' : val}
                        onChange={(e) =>
                          onNewRowDataChange({ ...newRowData, [c.name]: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs font-mono outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0 disabled:opacity-50 resize-y"
                      />
                    ) : (
                      <input
                        ref={index === 0 ? firstInputRef : undefined}
                        disabled={isFieldNull}
                        placeholder={
                          isFieldNull
                            ? 'NULL'
                            : c.defaultValue
                            ? `Default: ${c.defaultValue}`
                            : `Enter ${c.name}...`
                        }
                        value={isFieldNull ? '' : val}
                        onChange={(e) =>
                          onNewRowDataChange({ ...newRowData, [c.name]: e.target.value })
                        }
                        className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs font-mono outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0 disabled:opacity-50"
                      />
                    )}

                    {/* Set to NULL option for nullable columns */}
                    {c.isNullable && (
                      <div className="flex items-center justify-between text-[11px] text-foreground-lighter">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isFieldNull}
                            onChange={() => toggleNull(c.name)}
                            className="rounded border-gray-300 dark:border-strong bg-white dark:bg-surface-200 text-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0 cursor-pointer h-3.5 w-3.5"
                          />
                          <span>Set to NULL</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sticky Bottom Action Toolbar */}
          <div className="sticky bottom-0 bg-white dark:bg-surface-100 border-t border-gray-200 dark:border-default px-6 py-4 flex items-center justify-between shrink-0">
            {/* Left: Create More Switch */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={createMore}
                onClick={() => setCreateMore(!createMore)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                  createMore ? 'bg-[#086E43]' : 'bg-surface-300'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                    createMore ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
              <span className="text-xs text-foreground font-medium">Create more</span>
            </label>

            {/* Right: Cancel & Save Ctrl+Enter */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-3.5 py-1.5 rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-100 hover:bg-gray-100 dark:hover:bg-surface-200 text-foreground text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-md bg-[#086E43] hover:bg-[#065836] border border-[#338161] text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>Save</span>
                <span className="text-[10px] opacity-75 font-mono">Ctrl ↵</span>
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

