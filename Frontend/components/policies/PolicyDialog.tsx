'use client'

import React, { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { PolicyCommand, PolicyMode, PolicyPayload, RlsPolicy, RlsRole } from './rls-types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RlsRole[]
  policy: RlsPolicy | null
  busy: boolean
  error: string
  onSave: (payload: PolicyPayload) => Promise<void>
}

const commands: PolicyCommand[] = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']
const modes: PolicyMode[] = ['PERMISSIVE', 'RESTRICTIVE']

export function PolicyDialog({ open, onOpenChange, roles, policy, busy, error, onSave }: Props) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState<PolicyCommand>('ALL')
  const [mode, setMode] = useState<PolicyMode>('PERMISSIVE')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['public'])
  const [usingExpression, setUsingExpression] = useState('')
  const [checkExpression, setCheckExpression] = useState('')
  const roleOptions = [...new Set(['public', ...roles.map(role => role.name)])]

  useEffect(() => {
    if (!open) return
    setName(policy?.name ?? '')
    setCommand(policy?.command ?? 'ALL')
    setMode(policy?.mode ?? 'PERMISSIVE')
    setSelectedRoles(policy ? [...policy.roles] : ['public'])
    setUsingExpression(policy?.usingExpression ?? '')
    setCheckExpression(policy?.checkExpression ?? '')
  }, [open, policy])

  const canUse = command === 'ALL' || command === 'SELECT' || command === 'UPDATE' || command === 'DELETE'
  const canCheck = command === 'ALL' || command === 'INSERT' || command === 'UPDATE'
  const toggleRole = (role: string) => setSelectedRoles(current =>
    current.includes(role) ? current.filter(item => item !== role) : [...current, role]
  )
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    void onSave({
      name: name.trim(),
      command,
      mode,
      roles: selectedRoles,
      usingExpression: canUse && usingExpression.trim() ? usingExpression.trim() : null,
      checkExpression: canCheck && checkExpression.trim() ? checkExpression.trim() : null,
    })
  }

  return <Dialog open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0 gap-0">
      <form onSubmit={submit}>
        <div className="border-b border-default px-5 py-4">
          <DialogHeader className="flex-row items-start gap-3 space-y-0">
            <div className="mt-0.5 rounded-md border border-brand/20 bg-brand/10 p-2 text-brand"><ShieldCheck className="h-4 w-4" /></div>
            <div className="space-y-1">
              <DialogTitle className="text-sm">{policy ? 'Edit policy' : 'Create policy'}</DialogTitle>
              <DialogDescription>Define the operations and rows this policy permits for the selected table.</DialogDescription>
            </div>
          </DialogHeader>
        </div>
        <div className="space-y-5 px-5 py-5">
          {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-red-400">{error}</div>}
          <label className="block space-y-1.5 text-xs font-medium text-foreground">
            Policy name
            <Input autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={63} required placeholder="e.g. members_read_own_rows" className="h-9 font-mono text-xs" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-xs font-medium text-foreground">
              Command
              <Select value={command} onValueChange={value => setCommand(value as PolicyCommand)}>
                <SelectTrigger aria-label="Policy command"><SelectValue /></SelectTrigger>
                <SelectContent>{commands.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-foreground">
              Policy mode
              <Select value={mode} onValueChange={value => setMode(value as PolicyMode)}>
                <SelectTrigger aria-label="Policy mode"><SelectValue /></SelectTrigger>
                <SelectContent>{modes.map(value => <SelectItem key={value} value={value}>{value === 'PERMISSIVE' ? 'Permissive' : 'Restrictive'}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-foreground">Target roles</legend>
            <p className="text-[11px] text-foreground-lighter">Choose one or more database roles. PUBLIC targets every role.</p>
            <div className="grid gap-1.5 rounded-md border border-default bg-studio p-2 sm:grid-cols-2">
              {roleOptions.map(role => <label key={role} className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground hover:bg-surface-200">
                <input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" />
                <span className="truncate font-mono">{role === 'public' ? 'PUBLIC' : role}</span>
                {role !== 'public' && roles.some(item => item.name === role && (item.bypassRls || item.superuser)) && <span className="ml-auto text-[10px] text-amber-500">BYPASSRLS</span>}
              </label>)}
            </div>
            {!selectedRoles.length && <p role="alert" className="text-xs text-red-400">Select at least one target role.</p>}
          </fieldset>
          <p className="text-[11px] text-foreground-lighter">Permissive policies combine with OR; restrictive policies combine with AND and require an applicable permissive policy. Empty USING allows every existing row. For ALL/UPDATE, an empty WITH CHECK inherits USING; otherwise an omitted check allows every new row.</p>
          {canUse && <label className="block space-y-1.5 text-xs font-medium text-foreground">
            USING expression
            <textarea value={usingExpression} onChange={event => setUsingExpression(event.target.value)} rows={4} spellCheck={false} placeholder="e.g. owner_role = current_user" className="w-full resize-y rounded-md border border-default bg-studio px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-foreground-lighter focus:border-brand" />
            <span className="block font-normal text-[11px] text-foreground-lighter">Controls which existing rows are visible or eligible for the operation. Leave empty for no expression.</span>
          </label>}
          {canCheck && <label className="block space-y-1.5 text-xs font-medium text-foreground">
            WITH CHECK expression
            <textarea value={checkExpression} onChange={event => setCheckExpression(event.target.value)} rows={4} spellCheck={false} placeholder="e.g. owner_role = current_user" className="w-full resize-y rounded-md border border-default bg-studio px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-foreground-lighter focus:border-brand" />
            <span className="block font-normal text-[11px] text-foreground-lighter">Controls rows created or updated by the operation. Leave empty for no expression.</span>
          </label>}
        </div>
        <DialogFooter className="gap-2 px-5 py-4">
          <Button type="button" variant="default" size="large" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" size="large" disabled={busy || !name.trim() || !selectedRoles.length} loading={busy}>{busy ? 'Saving…' : policy ? 'Save policy' : 'Create policy'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

