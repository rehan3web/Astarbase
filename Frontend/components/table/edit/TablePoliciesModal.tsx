'use client'

import React from 'react'
import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { TableDefinition } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface TablePoliciesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: TableDefinition | null
  onToggleRls: (table: TableDefinition) => void
}

export function TablePoliciesModal({ open, onOpenChange, table, onToggleRls }: TablePoliciesModalProps) {
  const rlsOn = !!table?.rlsEnabled

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-default flex items-center gap-2 pr-12">
          <DialogTitle className="text-sm font-medium">
            Policies for <span className="font-mono">{table?.schema}.{table?.name}</span>
          </DialogTitle>
          <span
            className={cn(
              'ml-auto text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border',
              rlsOn
                ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                : 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10'
            )}
          >
            {rlsOn ? 'RLS enabled' : 'RLS disabled'}
          </span>
        </div>

        <div className="px-5 py-6">
          <div className="flex flex-col items-center text-center gap-3 py-4 rounded-md border border-dashed border-strong">
            <span
              className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center',
                rlsOn ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
              )}
            >
              {rlsOn ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </span>
            <div className="space-y-1 px-6">
              <p className="text-sm text-foreground">No policies created yet</p>
              <DialogDescription className="text-xs">
                {rlsOn
                  ? 'RLS is enabled, so no rows can be read or written through the API until you add a policy.'
                  : 'RLS is disabled. Anyone with your anon key can read and write all rows in this table.'}
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-default flex justify-end gap-2">
          <Button type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {table && (
            <Button
              id="policies-toggle-rls"
              type="button"
              variant={rlsOn ? 'default' : 'primary'}
              iconLeft={<Lock />}
              onClick={() => onToggleRls(table)}
            >
              {rlsOn ? 'Disable RLS' : 'Enable RLS'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
