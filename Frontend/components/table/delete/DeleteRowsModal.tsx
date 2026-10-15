'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'

interface DeleteRowsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rowCount: number
  onConfirm: () => Promise<void> | void
}

export function DeleteRowsModal({ open, onOpenChange, rowCount, onConfirm }: DeleteRowsModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      setIsDeleting(false)
    }
  }, [open])

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return
    onOpenChange(next)
  }

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await onConfirm()
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
        <div className="px-5 py-4 border-b border-default flex items-center gap-3 bg-surface-100">
          <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div>
            <DialogTitle className="text-base font-medium">Confirm Deletion</DialogTitle>
            <DialogDescription className="text-sm text-foreground-lighter">
              Are you sure you want to delete {rowCount} selected row{rowCount !== 1 ? 's' : ''}?
            </DialogDescription>
          </div>
        </div>

        <div className="p-5 text-sm text-foreground-light bg-studio">
          <p>
            This action cannot be undone. This will permanently delete the selected {rowCount} row{rowCount !== 1 ? 's' : ''} from the table.
          </p>
        </div>

        <div className="px-5 py-4 border-t border-default flex items-center justify-end gap-2 bg-surface-100">
          <Button variant="default" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-[#9E3735] hover:bg-[#9E3735]/90 text-white border-none"
            onClick={handleDelete}
            loading={isDeleting}
          >
            Delete {rowCount} row{rowCount !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
