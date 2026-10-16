'use client'

import React, { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, Code2, Table as TableIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { buildPolicySql, parsePolicySql } from './policy-sql'
import type { PolicyCommand, PolicyMode, PolicyPayload, RlsPolicy, RlsRole } from './rls-types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: RlsRole[]
  policy: RlsPolicy | null
  schema: string
  table: string
  busy: boolean
  error: string
  onSave: (payload: PolicyPayload) => Promise<void>
}

const commands: PolicyCommand[] = ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']
const modes: PolicyMode[] = ['PERMISSIVE', 'RESTRICTIVE']

function initialPayload(policy: RlsPolicy | null): PolicyPayload {
  return policy
    ? { ...policy, roles: [...policy.roles] }
    : { name: 'new_policy', command: 'ALL', mode: 'PERMISSIVE', roles: ['public'], usingExpression: null, checkExpression: null }
}

export function PolicyDialog({ open, onOpenChange, roles, policy, schema, table, busy, error, onSave }: Props) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState<PolicyCommand>('ALL')
  const [mode, setMode] = useState<PolicyMode>('PERMISSIVE')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['public'])
  const [sql, setSql] = useState('')
  const [sqlError, setSqlError] = useState('')
  const roleOptions = [...new Set(['public', ...roles.map(role => role.name)])]
  const qualifiedTable = `${schema}.${table}`

  useEffect(() => {
    if (!open) return
    const payload = initialPayload(policy)
    setName(payload.name)
    setCommand(payload.command)
    setMode(payload.mode)
    setSelectedRoles(payload.roles)
    setSql(buildPolicySql(payload, schema, table))
    setSqlError('')
  }, [open, policy, schema, table])

  function syncFromSql(source: string) {
    const parsed = parsePolicySql(source, schema, table)
    setName(parsed.name)
    setCommand(parsed.command)
    setMode(parsed.mode)
    setSelectedRoles(parsed.roles)
    return parsed
  }

  function updateSqlForControl(change: Partial<Pick<PolicyPayload, 'name' | 'command' | 'mode' | 'roles'>>) {
    try {
      const parsed = parsePolicySql(sql, schema, table)
      const next = { ...parsed, ...change }
      if (change.command === 'INSERT') next.usingExpression = null
      if (change.command === 'SELECT' || change.command === 'DELETE') next.checkExpression = null
      const generated = buildPolicySql(next, schema, table)
      parsePolicySql(generated, schema, table)
      setSql(generated)
      setName(next.name)
      setCommand(next.command)
      setMode(next.mode)
      setSelectedRoles(next.roles)
      setSqlError('')
      return true
    } catch (cause) {
      setSqlError(cause instanceof Error ? cause.message : 'Could not parse policy SQL.')
      return false
    }
  }

  function changeName(value: string) {
    setName(value)
    updateSqlForControl({ name: value.trim() })
  }

  function toggleRole(role: string) {
    const nextRoles = selectedRoles.includes(role)
      ? selectedRoles.filter(item => item !== role)
      : [...selectedRoles, role]
    setSelectedRoles(nextRoles)
    updateSqlForControl({ roles: nextRoles })
  }

  function changeCommand(value: string) {
    const next = value as PolicyCommand
    if (updateSqlForControl({ command: next })) setCommand(next)
  }

  function changeMode(value: string) {
    const next = value as PolicyMode
    if (updateSqlForControl({ mode: next })) setMode(next)
  }

  function handleSqlBlur() {
    try {
      syncFromSql(sql)
      setSqlError('')
    } catch (cause) {
      setSqlError(cause instanceof Error ? cause.message : 'Could not parse policy SQL.')
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    try {
      const parsed = syncFromSql(sql)
      setSqlError('')
      if (!parsed.name.trim()) {
        setSqlError('Add a policy name in the SQL statement before saving.')
        return
      }
      if (!parsed.roles.length) {
        setSqlError('Select at least one target role in the SQL statement before saving.')
        return
      }
      await onSave(parsed)
    } catch (cause) {
      setSqlError(cause instanceof Error ? cause.message : 'Could not parse policy SQL.')
    }
  }

  return <Sheet open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }}>
    <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <form onSubmit={event => void submit(event)} className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-default px-5 py-4 sm:px-6">
          <SheetHeader className="flex-row items-start gap-3 space-y-0 border-0 p-0 pr-5 text-left">
            <div className="mt-0.5 rounded-md border border-brand/20 bg-brand/10 p-2 text-brand"><Code2 className="h-4 w-4" /></div>
            <div className="space-y-1">
              <SheetTitle className="text-sm">{policy ? 'Edit row level security policy' : 'Create a new row level security policy'}</SheetTitle>
              <SheetDescription>Define a PostgreSQL policy for the selected table. The SQL is editable and remains the source of truth.</SheetDescription>
            </div>
          </SheetHeader>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-red-400">{error}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-xs font-medium text-foreground">
              Policy name
              <Input autoFocus value={name} onChange={event => changeName(event.target.value)} maxLength={63} required placeholder="e.g. members_read_own_rows" className="h-9 font-mono text-xs" />
            </label>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-foreground">Table</span>
              <div className="flex h-9 items-center gap-2 rounded-md border border-default bg-surface-100 px-3 text-xs text-foreground">
                <TableIcon className="h-3.5 w-3.5 text-foreground-lighter" />
                <code className="truncate font-mono">{qualifiedTable}</code>
                <span className="ml-auto shrink-0 rounded border border-default bg-surface-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-foreground-lighter">ON</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5 text-xs font-medium text-foreground">
              Policy behavior
              <Select value={mode} onValueChange={changeMode}>
                <SelectTrigger aria-label="Policy mode"><SelectValue /></SelectTrigger>
                <SelectContent>{modes.map(value => <SelectItem key={value} value={value}>{value === 'PERMISSIVE' ? 'Permissive' : 'Restrictive'}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-foreground">
              Policy command
              <Select value={command} onValueChange={changeCommand}>
                <SelectTrigger aria-label="Policy command"><SelectValue /></SelectTrigger>
                <SelectContent>{commands.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-foreground">Target roles</legend>
            <p className="text-[11px] text-foreground-lighter">Choose one or more database roles. PUBLIC targets every role.</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="default" className="h-9 w-full justify-between" aria-label="Target roles">
                  <span className="truncate font-mono text-xs">{selectedRoles.length ? selectedRoles.map(role => role === 'public' ? 'PUBLIC' : role).join(', ') : 'Select roles'}</span>
                  <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-64 w-80 overflow-y-auto p-2" aria-label="Choose target roles">
              {roleOptions.map(role => <label key={role} className="flex min-w-0 items-center gap-2 rounded px-2 py-1.5 text-xs text-foreground hover:bg-surface-200">
                <input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} className="h-3.5 w-3.5 accent-[hsl(var(--brand))]" />
                <span className="truncate font-mono">{role === 'public' ? 'PUBLIC' : role}</span>
                {role !== 'public' && roles.some(item => item.name === role && (item.bypassRls || item.superuser)) && <span className="ml-auto text-[10px] text-amber-500">BYPASSRLS</span>}
              </label>)}
              </PopoverContent>
            </Popover>
            {!selectedRoles.length && <p role="alert" className="text-xs text-red-400">Select at least one target role.</p>}
          </fieldset>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="policy-sql" className="text-xs font-medium text-foreground">Policy SQL</label>
              <span className="text-[10px] text-foreground-lighter">PostgreSQL CREATE POLICY</span>
            </div>
            <textarea
              id="policy-sql"
              aria-label="Policy SQL"
              value={sql}
              onChange={event => { setSql(event.target.value); setSqlError('') }}
              onBlur={handleSqlBlur}
              rows={12}
              spellCheck={false}
              className={`w-full resize-y rounded-md border bg-studio px-4 py-3 font-mono text-xs leading-6 text-foreground outline-none placeholder:text-foreground-lighter focus:border-brand ${sqlError ? 'border-red-500/70' : 'border-default'}`}
            />
            <p className="text-[11px] leading-relaxed text-foreground-lighter">Edit the statement directly, including USING and WITH CHECK predicates. Changes to the controls above update this SQL while preserving its predicates.</p>
            {sqlError && <div role="alert" className="flex items-start gap-2 rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-red-400"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{sqlError}</div>}
          </div>
          <p className="text-[11px] leading-relaxed text-foreground-lighter">Permissive policies combine with OR; restrictive policies combine with AND and require an applicable permissive policy. Database grants remain separate from row policies.</p>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-default bg-surface-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="default" size="large" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" size="large" disabled={busy || !name.trim() || !selectedRoles.length || !!sqlError} loading={busy}>{busy ? 'Saving…' : 'Save policy'}</Button>
        </div>
      </form>
    </SheetContent>
  </Sheet>
}
