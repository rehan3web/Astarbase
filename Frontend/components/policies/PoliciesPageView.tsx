'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CircleHelp, LockKeyhole, Pencil, Plus, RefreshCw, Search, Shield, ShieldOff, Table as TableIcon, Trash2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmRlsChangeDialog } from './ConfirmRlsChangeDialog'
import type { RlsConfirmation } from './ConfirmRlsChangeDialog'
import { PolicyDialog } from './PolicyDialog'
import { policyPath, PolicyPayload, RlsCatalog, RlsPolicy, RlsTable } from './rls-types'

const tableId = (table: Pick<RlsTable, 'schema' | 'name'>) => JSON.stringify([table.schema, table.name])
const commandLabel = (command: string) => command === 'ALL' ? 'All commands' : command
const showExpression = (value: string | null) => value?.trim() || 'No expression'

export function PoliciesPageView() {
  const { database } = useStudio()
  const { notify } = useNotifications()
  const searchParams = useSearchParams()
  const requestedSchema = searchParams.get('schema') ?? ''
  const requestedTable = searchParams.get('table') ?? ''
  const requestedTarget = requestedSchema && requestedTable ? JSON.stringify([requestedSchema, requestedTable]) : ''
  const databaseScope = useRef(database)
  databaseScope.current = database
  const [catalog, setCatalog] = useState<RlsCatalog | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [operationError, setOperationError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmationBusy, setConfirmationBusy] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorPolicy, setEditorPolicy] = useState<RlsPolicy | null>(null)
  const [editorError, setEditorError] = useState('')
  const [confirmation, setConfirmation] = useState<RlsConfirmation | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const result = await api<RlsCatalog>(`/databases/${encodeURIComponent(database)}/rls`, { signal })
      if (signal?.aborted || databaseScope.current !== database) return
      setCatalog(result)
      setSelectedId(current => {
        if (!current && requestedTarget && result.tables.some(table => tableId(table) === requestedTarget)) return requestedTarget
        return result.tables.some(table => tableId(table) === current) ? current : result.tables[0] ? tableId(result.tables[0]) : ''
      })
    } catch (cause) {
      if (!signal?.aborted && databaseScope.current === database) setError(errorMessage(cause))
    } finally {
      if (!signal?.aborted && databaseScope.current === database) setLoading(false)
    }
  }, [database, requestedTarget])

  useEffect(() => {
    const controller = new AbortController()
    setCatalog(null)
    setSelectedId('')
    setSearch('')
    setError('')
    setOperationError('')
    setSaving(false)
    setConfirmationBusy(false)
    setEditorOpen(false)
    setEditorPolicy(null)
    setEditorError('')
    setConfirmation(null)
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const filteredTables = useMemo(() => (catalog?.tables ?? []).filter(table =>
    `${table.schema}.${table.name}`.toLowerCase().includes(search.trim().toLowerCase())
  ), [catalog, search])
  const current = catalog?.tables.find(table => tableId(table) === selectedId)

  function openCreate() {
    setEditorPolicy(null)
    setEditorError('')
    setEditorOpen(true)
  }

  function openEdit(policy: RlsPolicy) {
    setEditorPolicy(policy)
    setEditorError('')
    setEditorOpen(true)
  }

  async function savePolicy(payload: PolicyPayload) {
    if (!current || saving) return
    setSaving(true)
    setEditorError('')
    setOperationError('')
    const path = `${policyPath(database, current.schema, current.name)}/policies`
      + (editorPolicy ? `/${encodeURIComponent(editorPolicy.name)}` : '')
    try {
      await api<{ saved: true }>(path, { method: editorPolicy ? 'PUT' : 'POST', body: payload })
      if (databaseScope.current !== database) return
      notify(editorPolicy ? 'Policy updated' : 'Policy created')
      setEditorOpen(false)
      setEditorPolicy(null)
      await load()
    } catch (cause) {
      if (databaseScope.current !== database) return
      const message = errorMessage(cause)
      setEditorError(message)
      setOperationError(message)
      notify(message, 'error')
    } finally {
      if (databaseScope.current === database) setSaving(false)
    }
  }

  async function applyConfirmedChange() {
    if (!current || !confirmation || confirmationBusy) return
    const action = confirmation
    setConfirmationBusy(true)
    setOperationError('')
    try {
      let successMessage = ''
      if (action.kind === 'delete') {
        await api(`${policyPath(database, current.schema, current.name)}/policies/${encodeURIComponent(action.policyName ?? '')}`, { method: 'DELETE' })
        successMessage = 'Policy deleted'
      } else {
        const body = action.kind === 'enable' ? { enabled: true }
          : action.kind === 'disable' ? { enabled: false }
          : action.kind === 'force' ? { forced: true }
          : { forced: false }
        await api(`${policyPath(database, current.schema, current.name)}`, { method: 'PATCH', body })
        successMessage = action.kind === 'enable' ? 'Row level security enabled'
          : action.kind === 'disable' ? 'Row level security disabled'
          : action.kind === 'force' ? 'Force row level security enabled'
          : 'Force row level security disabled'
      }
      if (databaseScope.current !== database) return
      notify(successMessage)
      setConfirmation(null)
      await load()
    } catch (cause) {
      if (databaseScope.current !== database) return
      const message = errorMessage(cause)
      setOperationError(message)
      notify(message, 'error')
    } finally {
      if (databaseScope.current === database) setConfirmationBusy(false)
    }
  }

  const selection = <Select value={current ? selectedId : undefined} onValueChange={setSelectedId}>
    <SelectTrigger aria-label="Policy table" className="h-9 min-w-0 max-w-full bg-surface-100 text-xs sm:w-[19rem]">
      <SelectValue placeholder={loading ? 'Loading tables…' : 'Select a table'} />
    </SelectTrigger>
    <SelectContent className="max-h-80">
      {filteredTables.map(table => <SelectItem key={tableId(table)} value={tableId(table)}>{table.schema}.{table.name}</SelectItem>)}
      {!filteredTables.length && <div className="px-3 py-2 text-xs text-foreground-lighter">No tables match this search.</div>}
    </SelectContent>
  </Select>

  return <div className="h-full w-full flex-1 overflow-y-auto p-5 md:p-9">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-default pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-foreground-lighter">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Database security <span className="text-foreground-lighter/50">/</span> {database}
          </div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">Row level security</h1>
          <p className="mt-1 max-w-2xl text-sm text-foreground-lighter">Control which rows each database role can read or change.</p>
        </div>
        <Button variant="default" size="small" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
      </header>

      <section className="overflow-hidden rounded-lg border border-default bg-studio">
        <div className="flex flex-col gap-4 border-b border-default bg-dash-sidebar p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground-lighter"><Shield className="h-4 w-4" /> Table policies</div>
            <div className="relative flex min-w-0 items-center sm:w-48">
              <Input aria-label="Search tables" placeholder="Filter tables…" iconLeft={<Search aria-hidden="true" className="h-3.5 w-3.5" />} value={search} onChange={event => setSearch(event.target.value)} className="h-8 w-full bg-studio text-xs" />
            </div>
            {selection}
          </div>
          {current && !current.enabled
            ? <Button variant="primary" size="small" onClick={() => setConfirmation({ kind: 'enable' })} disabled={loading}><Shield className="mr-1.5 h-3.5 w-3.5" /> Enable RLS</Button>
            : <Button variant="primary" size="small" onClick={openCreate} disabled={!current || loading}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add RLS policy</Button>}
        </div>

        <div className="flex flex-col gap-3 border-b border-default bg-studio p-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 rounded-md border p-2 ${current?.enabled ? 'border-brand/25 bg-brand/10 text-brand' : 'border-default bg-surface-100 text-foreground-lighter'}`}>
              {current?.enabled ? <TableIcon className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {current ? <code className="font-mono">{current.schema}.{current.name}</code> : loading ? 'Loading tables…' : 'No table selected'}
                {current?.forced && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-500">Forced</span>}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground-lighter">
                {current?.enabled
                  ? 'Row access is governed by table privileges and applicable policies. Table owners bypass RLS unless FORCE is enabled.'
                  : current ? 'Policies are stored even while RLS is disabled. Enabling RLS without applicable policies denies normal clients access to rows.'
                  : 'Select a table to view and manage its policies.'}
              </p>
            </div>
          </div>
          {current && <div className="flex shrink-0 flex-wrap gap-2">
            {current.enabled && <Button variant="default" size="small" onClick={() => setConfirmation({ kind: 'disable' })}>Disable RLS</Button>}
            <Button variant="default" size="small" onClick={() => setConfirmation({ kind: current.forced ? 'unforce' : 'force' })}>
              {current.forced ? 'Remove FORCE' : 'Force RLS'}
            </Button>
          </div>}
        </div>

        {current && !current.enabled && <div className="flex items-start gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p><strong>RLS is off.</strong> These policies do not currently filter rows. Enabling RLS without policies denies normal clients; RLS does not grant table privileges. Superusers and BYPASSRLS roles always bypass.</p>
        </div>}
        {current?.enabled && <div className="flex items-start gap-2 border-b border-default bg-surface-100/60 px-4 py-2.5 text-[11px] text-foreground-lighter">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Table privileges remain separate from row policies. Superusers and BYPASSRLS roles always bypass RLS; owners bypass unless FORCE is enabled.
        </div>}

        {(error || operationError) && <div role="alert" className="m-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-red-400">
          <span>{operationError || error}</span>
          {error && !operationError && <button type="button" onClick={() => void load()} className="ml-3 underline">Retry</button>}
          {operationError && <button type="button" onClick={() => setOperationError('')} className="ml-3 underline">Dismiss</button>}
        </div>}

        {loading && !catalog ? <div aria-label="Loading policies" className="space-y-3 p-5">
          <div className="h-5 w-48 animate-pulse rounded bg-surface-200" />
          <div className="h-14 animate-pulse rounded bg-surface-200/70" />
          <div className="h-14 animate-pulse rounded bg-surface-200/70" />
        </div> : error && !catalog ? <div className="p-10 text-center">
          <p className="text-sm text-foreground">Could not load row security settings.</p><p className="mt-1 text-xs text-foreground-lighter">{error}</p>
          <Button variant="default" size="small" className="mt-4" onClick={() => void load()}>Retry</Button>
        </div> : !current ? <div className="p-10 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-default bg-surface-100 text-foreground-lighter"><Search className="h-4 w-4" /></div>
          <p className="text-sm font-medium text-foreground">{catalog?.tables.length ? 'No tables match this search' : 'No tables in this database'}</p>
          <p className="mt-1 text-xs text-foreground-lighter">{catalog?.tables.length ? 'Try a different schema or table name.' : 'Create a table before configuring row security.'}</p>
        </div> : <div>
          <div className="flex items-center justify-between border-b border-default px-4 py-3">
            <div><h2 className="text-xs font-medium text-foreground">Policies</h2><p className="mt-0.5 text-[11px] text-foreground-lighter">{current.policies.length} defined · active only while RLS is enabled</p></div>
            <span className="text-[10px] font-mono text-foreground-lighter">{current.schema}.{current.name}</span>
          </div>
          {current.policies.length ? <div className="divide-y divide-default">
            {current.policies.map(policy => <article key={policy.name} className="group grid gap-3 px-4 py-4 transition-colors hover:bg-surface-100/60 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-mono text-sm text-foreground">{policy.name}</span>
                  <span className="rounded border border-default bg-surface-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-foreground-lighter">{policy.mode}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {policy.roles.map(role => <span key={role} className="rounded bg-surface-200 px-1.5 py-0.5 font-mono text-[10px] text-foreground-lighter">{role === 'public' ? 'PUBLIC' : role}</span>)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <span className="text-foreground-lighter">Command</span><span className="font-mono text-foreground">{commandLabel(policy.command)}</span>
                {policy.usingExpression !== null && <><span className="text-foreground-lighter">USING</span><code className="truncate font-mono text-foreground" title={policy.usingExpression || 'No expression'}>{showExpression(policy.usingExpression)}</code></>}
                {policy.checkExpression !== null && <><span className="text-foreground-lighter">WITH CHECK</span><code className="truncate font-mono text-foreground" title={policy.checkExpression || 'No expression'}>{showExpression(policy.checkExpression)}</code></>}
                {policy.usingExpression === null && policy.checkExpression === null && <><span className="text-foreground-lighter">Predicates</span><span className="text-foreground-lighter">None</span></>}
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="small" aria-label={`Edit policy ${policy.name}`} title="Edit policy" onClick={() => openEdit(policy)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="small" aria-label={`Delete policy ${policy.name}`} title="Delete policy" className="text-foreground-lighter hover:text-red-400" onClick={() => setConfirmation({ kind: 'delete', policyName: policy.name })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </article>)}
          </div> : <div className="px-5 py-10 text-center">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full border border-default bg-surface-100 text-foreground-lighter"><LockKeyhole className="h-4 w-4" /></div>
            <p className="text-sm font-medium text-foreground">No policies defined</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-foreground-lighter">{current.enabled ? 'No applicable policies means normal clients cannot access rows in this table.' : 'You can define policies before enabling RLS. They take effect when row level security is enabled.'}</p>
            {current.enabled
              ? <Button variant="default" size="small" className="mt-4" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first policy</Button>
              : <Button variant="primary" size="small" className="mt-4" onClick={() => setConfirmation({ kind: 'enable' })}><Shield className="mr-1.5 h-3.5 w-3.5" /> Enable RLS</Button>}
          </div>}
        </div>}
      </section>

    </div>

    <PolicyDialog open={editorOpen} onOpenChange={setEditorOpen} roles={catalog?.roles ?? []} policy={editorPolicy} schema={current?.schema ?? ''} table={current?.name ?? ''} busy={saving} error={editorError} onSave={savePolicy} />
    <ConfirmRlsChangeDialog action={confirmation} busy={confirmationBusy} error={operationError} onOpenChange={open => { if (!open) { setConfirmation(null); setOperationError('') } }} onConfirm={() => void applyConfirmedChange()} />
  </div>
}
