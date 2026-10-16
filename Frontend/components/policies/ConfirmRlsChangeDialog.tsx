'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type RlsConfirmation = { kind: 'enable' | 'disable' | 'force' | 'unforce' | 'delete'; policyName?: string }

type Props = {
  action: RlsConfirmation | null
  busy: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

const copy: Record<RlsConfirmation['kind'], { title: string; description: React.ReactNode; button: string }> = {
  enable: {
    title: 'Enable row level security?',
    description: <>Enabling RLS without any applicable policies denies normal clients access to table rows. RLS does not grant table privileges; database grants are still required.</>,
    button: 'Enable RLS',
  },
  disable: {
    title: 'Disable row level security?',
    description: <>Policies remain defined, but row filtering stops applying while RLS is disabled. Normal table privileges will govern access.</>,
    button: 'Disable RLS',
  },
  force: {
    title: 'Force row level security?',
    description: <>FORCE RLS also subjects the table owner to policies. Superusers and roles with BYPASSRLS continue to bypass row security.</>,
    button: 'Force RLS',
  },
  unforce: {
    title: 'Stop forcing row level security?',
    description: <>The table owner will bypass RLS again unless another database role restriction applies. Superusers and BYPASSRLS roles always bypass.</>,
    button: 'Remove FORCE',
  },
  delete: {
    title: 'Delete this policy?',
    description: <>This permanently deletes policy <code className="font-mono text-foreground">{'{{name}}'}</code>. This change affects row access wherever RLS is enabled.</>,
    button: 'Delete policy',
  },
}

export function ConfirmRlsChangeDialog({ action, busy, error, onOpenChange, onConfirm }: Props) {
  const detail = action ? copy[action.kind] : null
  const description = action?.kind === 'delete'
    ? <>This permanently deletes policy <code className="font-mono text-foreground">{action.policyName}</code>. This change affects row access wherever RLS is enabled.</>
    : detail?.description
  return <Dialog open={!!action} onOpenChange={open => { if (!busy) onOpenChange(open) }}>
    <DialogContent className="max-w-md gap-0 p-0">
      <div className="border-b border-default px-5 py-4">
        <DialogHeader className="flex-row items-start gap-3 space-y-0">
          <div className="mt-0.5 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-amber-500"><AlertTriangle className="h-4 w-4" /></div>
          <div className="space-y-1"><DialogTitle className="text-sm">{detail?.title}</DialogTitle><DialogDescription>{description}</DialogDescription></div>
        </DialogHeader>
      </div>
      {error && <div role="alert" className="mx-5 mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-red-400">{error}</div>}
      <DialogFooter className="gap-2 px-5 py-4">
        <Button variant="default" size="large" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={action?.kind === 'delete' || action?.kind === 'disable' ? 'destructive' : 'primary'} size="large" disabled={busy} loading={busy} onClick={onConfirm}>{busy ? 'Applying…' : detail?.button}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

