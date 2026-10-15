'use client'

import React, { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteTableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: TableDefinition | null
  /** Performs the deletion. May return a promise; the modal shows a loader until it resolves. */
  onConfirm: (table: TableDefinition, cascade: boolean) => Promise<void> | void
}

export function DeleteTableModal({ open, onOpenChange, table, onConfirm }: DeleteTableModalProps) {
  const [cascade, setCascade] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Reset state each time the modal opens
  useEffect(() => {
    if (open) {
      setCascade(false)
      setIsDeleting(false)
    }
  }, [open])

  const handleOpenChange = (next: boolean) => {
    // Block closing while the delete is in progress
    if (isDeleting) return
    onOpenChange(next)
  }

  const handleDelete = async () => {
    if (!table || isDeleting) return
    setIsDeleting(true)
    try {
      await onConfirm(table, cascade)
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-md p-0 gap-0 overflow-hidden"
        onEscapeKeyDown={(e) => isDeleting && e.preventDefault()}
        onPointerDownOutside={(e) => isDeleting && e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-default">
          <DialogTitle className="text-sm font-medium pr-6">
            Confirm deletion of table &quot;{table?.name}&quot;
          </DialogTitle>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <DialogDescription className="text-sm text-foreground-light leading-relaxed">
            Are you sure you want to delete the selected table? This action cannot be undone.
          </DialogDescription>

          <label
            htmlFor="delete-table-cascade"
            className={cn(
              'flex items-start gap-3 select-none',
              isDeleting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            )}
          >
            <button
              id="delete-table-cascade"
              type="button"
              role="checkbox"
              aria-checked={cascade}
              disabled={isDeleting}
              onClick={() => setCascade((c) => !c)}
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors outline-none',
                'focus-visible:ring-2 focus-visible:ring-brand-500/50',
                cascade
                  ? 'bg-foreground border-foreground text-background'
                  : 'bg-surface-200 border-strong hover:border-foreground-muted'
              )}
            >
              {cascade && <Check className="h-3 w-3 stroke-[3]" />}
            </button>
            <div className="flex flex-col gap-1">
              <span className="text-sm text-foreground">Drop table with cascade?</span>
              <span className="text-xs text-foreground-lighter">
                Deletes the table and its dependent objects
              </span>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2">
          <Button
            id="delete-table-cancel"
            type="button"
            variant="default"
            size="large"
            disabled={isDeleting}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            id="delete-table-confirm"
            type="button"
            variant="destructive"
            size="large"
            loading={isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
