'use client'

import React from 'react'
import { AlignLeft, Copy, Edit3, Loader2, MoreVertical, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface SqlActionToolbarProps {
  isExecuting: boolean
  hasUnsavedEdits?: boolean
  onRunQuery: () => void
  onFormatQuery: () => void
  onSave: () => void
  onDuplicateQuery?: () => void
  onRenameQuery?: () => void
  onDeleteQuery?: () => void
}

export function SqlActionToolbar({
  isExecuting,
  hasUnsavedEdits = false,
  onRunQuery,
  onFormatQuery,
  onSave,
  onDuplicateQuery,
  onRenameQuery,
  onDeleteQuery,
}: SqlActionToolbarProps) {
  return (
    <div className="h-10 shrink-0 border-b border-default bg-dash-sidebar flex items-center justify-end px-3 gap-2.5 select-none">
      {/* "Unsaved edits" indicator */}
      {hasUnsavedEdits && (
        <span className="text-xs text-foreground-lighter font-normal tracking-tight">
          Unsaved edits
        </span>
      )}

      {/* 3-dots More Actions Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="h-7 w-7 flex items-center justify-center rounded-md text-foreground-lighter hover:text-foreground hover:bg-surface-200 transition-colors border border-transparent hover:border-strong cursor-pointer"
            title="More actions"
            aria-label="More options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 bg-surface-100 border-overlay">
          <DropdownMenuItem onClick={onFormatQuery} className="gap-2 cursor-pointer">
            <AlignLeft className="h-3.5 w-3.5" />
            <span>Format query</span>
            <span className="ml-auto text-[10px] text-foreground-muted font-mono">⇧⌥F</span>
          </DropdownMenuItem>
          {onDuplicateQuery && (
            <DropdownMenuItem onClick={onDuplicateQuery} className="gap-2 cursor-pointer">
              <Copy className="h-3.5 w-3.5" />
              <span>Duplicate query</span>
            </DropdownMenuItem>
          )}
          {onRenameQuery && (
            <DropdownMenuItem onClick={onRenameQuery} className="gap-2 cursor-pointer">
              <Edit3 className="h-3.5 w-3.5" />
              <span>Rename query</span>
            </DropdownMenuItem>
          )}
          {onDeleteQuery && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDeleteQuery}
                className="gap-2 text-destructive focus:text-destructive cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete query</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Connected Split Button Group: [ Save  Ctrl S | Run  Ctrl ↵ ] */}
      <div className="inline-flex items-stretch rounded-md overflow-hidden border border-strong shadow-xs">
        {/* Left: Save */}
        <button
          type="button"
          onClick={onSave}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-surface-100 hover:bg-surface-200 text-foreground transition-colors cursor-pointer border-r border-strong active:bg-surface-300"
          title="Save query (Ctrl+S)"
        >
          <span>Save</span>
          <kbd className="text-[10px] text-foreground-lighter font-mono">Ctrl S</kbd>
        </button>

        {/* Right: Run */}
        <button
          type="button"
          onClick={onRunQuery}
          disabled={isExecuting}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer',
            'bg-[var(--primary-solid)] hover:bg-[var(--primary-solid-hover)] active:opacity-90',
            isExecuting && 'opacity-70 cursor-not-allowed'
          )}
          title="Run query (Ctrl+Enter)"
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <span>Run</span>
          )}
          <kbd className="text-[10px] text-white/70 font-mono">Ctrl ↵</kbd>
        </button>
      </div>
    </div>
  )
}

