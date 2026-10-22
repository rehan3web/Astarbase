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
import type { ForeignKeyDraft } from '@/lib/foreign-keys'
import { ForeignKeyPanel } from './ForeignKeyPanel'

interface InsertColumnModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTable: TableDefinition
  newColumnData: {
    name: string
    type: string
    defaultValue: string
    description?: string
    isArray?: boolean
    isPrimaryKey?: boolean
    isNullable?: boolean
    foreignKey?: ForeignKeyDraft | null
  }
  onNewColumnDataChange: (data: any) => void
  onInsert: (keepOpen?: boolean) => void
  /** 'edit' changes the title and hides the "Create more" toggle */
  mode?: 'create' | 'edit'
}

export function InsertColumnModal({
  open,
  onOpenChange,
  selectedTable,
  newColumnData,
  onNewColumnDataChange,
  onInsert,
  mode = 'create',
}: InsertColumnModalProps) {
  const isEdit = mode === 'edit'
  const [createMore, setCreateMore] = useState(false)
  const [foreignKeyOpen, setForeignKeyOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus name input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => nameInputRef.current?.focus(), 150)
    }
  }, [open])

  const handleSave = useCallback(() => {
    if (foreignKeyOpen) return
    if (!newColumnData.name.trim()) return
    const keepOpen = createMore && !isEdit
    onInsert(keepOpen)

  }, [createMore, foreignKeyOpen, isEdit, newColumnData.name, onInsert])

  const handleParentOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setForeignKeyOpen(false)
    onOpenChange(nextOpen)
  }

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
    <DialogPrimitive.Root open={open} onOpenChange={handleParentOpenChange}>
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
                <span>{isEdit ? 'Update column in' : 'Add new column to'}</span>
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
            {/* 1. General Section */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start first:pt-0">
              <div className="col-span-4">
                <span className="text-xs font-medium text-foreground-lighter">General</span>
              </div>
              <div className="col-span-8 space-y-4">
                <div>
                  <label className="text-xs text-foreground block mb-1 font-medium">Name</label>
                  <input
                    ref={nameInputRef}
                    placeholder="column_name"
                    value={newColumnData.name}
                    onChange={(e) =>
                      onNewColumnDataChange({ ...newColumnData, name: e.target.value })
                    }
                    className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs font-mono outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                  />
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Recommended to use lowercase and use an underscore to separate words e.g.{' '}
                    <code className="text-foreground font-mono bg-white dark:bg-surface-200 px-1 py-0.5 rounded text-[10px]">
                      column_name
                    </code>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-foreground font-medium">Description</label>
                    <span className="text-[11px] text-foreground-lighter">Optional</span>
                  </div>
                  <input
                    placeholder=""
                    value={newColumnData.description || ''}
                    onChange={(e) =>
                      onNewColumnDataChange({ ...newColumnData, description: e.target.value })
                    }
                    className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                  />
                </div>
              </div>
            </div>

            {/* 2. Data Type Section */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start">
              <div className="col-span-4 space-y-2">
                <span className="text-xs font-medium text-foreground-lighter block">
                  Data Type
                </span>
                <div className="space-y-1.5 pt-1">
                  <button
                    type="button"
                    className="w-full px-2.5 py-1 text-[11px] rounded border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 hover:bg-gray-100 dark:hover:bg-surface-300 text-foreground transition-colors cursor-pointer text-left font-mono"
                  >
                    + Create enum types
                  </button>
                  <button
                    type="button"
                    className="w-full px-2.5 py-1 text-[11px] rounded border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 hover:bg-gray-100 dark:hover:bg-surface-300 text-foreground transition-colors cursor-pointer text-left"
                  >
                    About data types
                  </button>
                </div>
              </div>

              <div className="col-span-8 space-y-4">
                <div>
                  <label className="text-xs text-foreground block mb-1 font-medium">Type</label>
                  <Select
                    value={newColumnData.type}
                    onValueChange={(val) =>
                      onNewColumnDataChange({ ...newColumnData, type: val })
                    }
                  >
                    <SelectTrigger className="w-full bg-white dark:bg-surface-200 border-gray-300 dark:border-strong hover:bg-white dark:hover:bg-surface-300/60 focus:border-gray-400 dark:focus:border-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
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

                <div>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!newColumnData.isArray}
                      onChange={(e) =>
                        onNewColumnDataChange({
                          ...newColumnData,
                          isArray: e.target.checked,
                        })
                      }
                      className="rounded border-gray-300 dark:border-strong bg-white dark:bg-surface-200 text-brand focus:ring-2 focus:ring-gray-200 dark:focus:ring-0 cursor-pointer h-4 w-4 mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-medium text-foreground block">
                        Define as array
                      </span>
                      <span className="text-[11px] text-foreground-lighter block leading-relaxed">
                        Allow column to be defined as variable-length multidimensional arrays
                      </span>
                    </div>
                  </label>
                </div>

                <div>
                  <label className="text-xs text-foreground block mb-1 font-medium">
                    Default Value
                  </label>
                  <input
                    placeholder="NULL"
                    value={newColumnData.defaultValue}
                    onChange={(e) =>
                      onNewColumnDataChange({ ...newColumnData, defaultValue: e.target.value })
                    }
                    className="w-full h-8 px-3 rounded-md bg-white dark:bg-surface-200 border border-gray-300 dark:border-strong text-foreground text-xs font-mono outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:focus:border-brand dark:focus:ring-0"
                  />
                  <p className="text-[11px] text-foreground-lighter mt-1 leading-relaxed">
                    Can either be a literal or an expression. When using an expression wrap your
                    expression in brackets, e.g.{' '}
                    <code className="text-foreground font-mono bg-white dark:bg-surface-200 px-1 py-0.5 rounded text-[10px]">
                      (gen_random_uuid())
                    </code>
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Foreign Keys Section */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start">
              <div className="col-span-4">
                <span className="text-xs font-medium text-foreground-lighter">Foreign Keys</span>
              </div>
              <div className="col-span-8">
                <button
                  type="button"
                  onClick={() => setForeignKeyOpen(true)}
                  className="px-3 py-1.5 rounded-md border border-gray-300 dark:border-strong bg-white dark:bg-surface-200 hover:bg-gray-100 dark:hover:bg-surface-300 text-foreground text-xs font-medium transition-colors cursor-pointer"
                >
                  {newColumnData.foreignKey ? 'Edit foreign key' : 'Add foreign key'}
                </button>
                {newColumnData.foreignKey && (
                  <div className="mt-3 rounded-md border border-gray-200 dark:border-default bg-white dark:bg-surface-200/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-foreground-lighter">References</p>
                        <p className="mt-1 break-all font-mono text-xs text-foreground">
                          {newColumnData.foreignKey.targetSchema}.{newColumnData.foreignKey.targetTable}.{newColumnData.foreignKey.targetColumn}
                        </p>
                        <p className="mt-1 text-[10px] text-foreground-lighter">
                          Applied when you save the column
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNewColumnDataChange({ ...newColumnData, foreignKey: null })}
                        className="shrink-0 rounded px-2 py-1 text-[11px] text-foreground-lighter hover:bg-gray-100 dark:hover:bg-surface-300 hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. Constraints Section */}
            <div className="grid grid-cols-12 gap-4 py-5 items-start last:pb-0">
              <div className="col-span-4">
                <span className="text-xs font-medium text-foreground-lighter">Constraints</span>
              </div>
              <div className="col-span-8 space-y-4">
                {/* Is Primary Key */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-foreground block">
                      Is Primary Key
                    </span>
                    <span className="text-[11px] text-foreground-lighter leading-relaxed block">
                      A primary key indicates that a column or group of columns can be used as a
                      unique identifier for rows in the table
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!newColumnData.isPrimaryKey}
                    onClick={() =>
                      onNewColumnDataChange({
                        ...newColumnData,
                        isPrimaryKey: !newColumnData.isPrimaryKey,
                      })
                    }
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      newColumnData.isPrimaryKey ? 'bg-[#086E43]' : 'bg-surface-300'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                        newColumnData.isPrimaryKey ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Allow Nullable */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-xs font-medium text-foreground block">
                      Allow Nullable
                    </span>
                    <span className="text-[11px] text-foreground-lighter leading-relaxed block">
                      Allow the column to assume a NULL value if no value is provided
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={newColumnData.isNullable !== false}
                    onClick={() =>
                      onNewColumnDataChange({
                        ...newColumnData,
                        isNullable: newColumnData.isNullable === false ? true : false,
                      })
                    }
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      newColumnData.isNullable !== false ? 'bg-[#086E43]' : 'bg-surface-300'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                        newColumnData.isNullable !== false ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Action Toolbar */}
          <div className="sticky bottom-0 bg-white dark:bg-surface-100 border-t border-gray-200 dark:border-default px-6 py-4 flex items-center justify-between shrink-0">
            {/* Left: Create more switch (create mode only) */}
            {isEdit ? <span /> : (
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
            )}

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
                disabled={!newColumnData.name.trim()}
                onClick={handleSave}
                className="px-4 py-1.5 rounded-md bg-[#086E43] hover:bg-[#065836] border border-[#338161] text-white text-xs font-medium shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>Save</span>
                <span className="text-[10px] opacity-75 font-mono">Ctrl ↵</span>
              </button>
            </div>
          </div>
          <ForeignKeyPanel
            open={open && foreignKeyOpen}
            onOpenChange={setForeignKeyOpen}
            tableName={selectedTable.name}
            sourceColumn={newColumnData.name}
            sourceType={newColumnData.type}
            initialDraft={newColumnData.foreignKey ?? null}
            onSave={(draft) => {
              onNewColumnDataChange({ ...newColumnData, foreignKey: draft })
              setForeignKeyOpen(false)
            }}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

