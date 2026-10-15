'use client'

import React, { useEffect, useRef, useState } from 'react'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface EditTableValues {
  name: string
  comment: string
  rlsEnabled: boolean
  realtimeEnabled: boolean
}

interface EditTableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: TableDefinition | null
  /** Names already used in the schema (excluding the table being edited) */
  existingNames: string[]
  onSave: (table: TableDefinition, values: EditTableValues) => Promise<void> | void
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        checked ? 'bg-[#086E43]' : 'bg-surface-300'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition duration-200',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

export function EditTableModal({
  open,
  onOpenChange,
  table,
  existingNames,
  onSave,
}: EditTableModalProps) {
  const [values, setValues] = useState<EditTableValues>({
    name: '',
    comment: '',
    rlsEnabled: false,
    realtimeEnabled: false,
  })
  const [isSaving, setIsSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && table) {
      setValues({
        name: table.name,
        comment: table.comment ?? '',
        rlsEnabled: !!table.rlsEnabled,
        realtimeEnabled: !!table.realtimeEnabled,
      })
      setIsSaving(false)
      setTimeout(() => nameRef.current?.select(), 100)
    }
  }, [open, table])

  const trimmedName = values.name.trim()
  const nameError = !trimmedName
    ? 'Table name is required'
    : !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)
      ? 'Use letters, numbers and underscores only'
      : existingNames.includes(trimmedName)
        ? 'A table with this name already exists'
        : null

  const handleSave = async () => {
    if (!table || nameError || isSaving) return
    setIsSaving(true)
    try {
      await onSave(table, { ...values, name: trimmedName })
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-default">
          <DialogTitle className="text-sm font-medium pr-6">
            Edit table &quot;{table?.name}&quot;
          </DialogTitle>
          <DialogDescription className="mt-1">
            Update the table name, description and access settings.
          </DialogDescription>
        </div>

        <form
          className="px-5 py-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="edit-table-name" className="text-xs text-foreground-light">
              Name
            </label>
            <input
              id="edit-table-name"
              ref={nameRef}
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              className={cn(
                'w-full h-8 px-2.5 text-sm font-mono bg-surface-200 border rounded-md text-foreground focus:outline-none focus:ring-1',
                nameError ? 'border-red-500/60 focus:ring-red-500/50' : 'border-strong focus:ring-brand-500'
              )}
            />
            {nameError && <p className="text-[11px] text-red-500">{nameError}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-table-comment" className="text-xs text-foreground-light">
              Description <span className="text-foreground-muted">(optional)</span>
            </label>
            <input
              id="edit-table-comment"
              value={values.comment}
              onChange={(e) => setValues((v) => ({ ...v, comment: e.target.value }))}
              placeholder="Describe this table"
              className="w-full h-8 px-2.5 text-sm bg-surface-200 border border-strong rounded-md text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-start justify-between gap-4 pt-1">
            <div>
              <p className="text-sm text-foreground">Enable Row Level Security (RLS)</p>
              <p className="text-xs text-foreground-lighter">Restrict access to rows using policies</p>
            </div>
            <Toggle
              id="edit-table-rls"
              checked={values.rlsEnabled}
              onChange={(v) => setValues((s) => ({ ...s, rlsEnabled: v }))}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-foreground">Enable Realtime</p>
              <p className="text-xs text-foreground-lighter">Broadcast changes on this table</p>
            </div>
            <Toggle
              id="edit-table-realtime"
              checked={values.realtimeEnabled}
              onChange={(v) => setValues((s) => ({ ...s, realtimeEnabled: v }))}
            />
          </div>
          {/* Hidden submit so Enter saves */}
          <button type="submit" className="hidden" />
        </form>

        <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2">
          <Button
            id="edit-table-cancel"
            type="button"
            size="large"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            id="edit-table-save"
            type="button"
            variant="primary"
            size="large"
            loading={isSaving}
            disabled={!!nameError}
            onClick={handleSave}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
