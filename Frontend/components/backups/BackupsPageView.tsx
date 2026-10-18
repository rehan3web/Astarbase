'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Archive,
  Download,
  HardDrive,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { api, Backup, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { LoadingIndicator, Spinner } from '@/components/ui/spinner'

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size < 0) return '—'
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function BackupsPageView() {
  const { database, branches } = useStudio()
  const { notify } = useNotifications()
  const [backups, setBackups] = useState<Backup[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [targetBackup, setTargetBackup] = useState<Backup | null>(null)
  const [newBackupName, setNewBackupName] = useState('')
  const [targetDatabase, setTargetDatabase] = useState(database)
  const [confirmation, setConfirmation] = useState('')

  const loadBackups = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const rows = await api<Backup[]>(`/backups?database=${encodeURIComponent(database)}`, { signal })
      if (!signal?.aborted) setBackups(rows)
    } finally { if (!signal?.aborted) setLoading(false) }
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    setBackups([])
    loadBackups(controller.signal).catch(reason => { if (!controller.signal.aborted) setError(errorMessage(reason)) })
    return () => controller.abort()
  }, [loadBackups])

  const filtered = useMemo(() => backups.filter(item => `${item.label} ${item.id}`.toLowerCase().includes(search.toLowerCase())), [backups, search])
  const totalBytes = backups.reduce((total, item) => total + (Number.isFinite(item.size_bytes) ? item.size_bytes : 0), 0)
  const dismissRestore = () => { setRestoreOpen(false); setTargetBackup(null); setConfirmation('') }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newBackupName.trim() || busy) return
    setBusy('create'); setError('')
    try {
      await api('/backups', { method: 'POST', body: { database, label: newBackupName.trim() } })
      await loadBackups()
      setCreateOpen(false); setNewBackupName('')
      notify(`Backup "${newBackupName.trim()}" created`, 'success')
    } catch (reason) { const message = errorMessage(reason); setError(message); notify(message, 'error') } finally { setBusy('') }
  }

  const handleRestore = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!targetBackup || busy || !targetBackup.available || confirmation !== targetDatabase) return
    setBusy('restore'); setError('')
    try {
      const result = await api<{ cleanupWarning?: string }>(`/backups/${encodeURIComponent(targetBackup.id)}/restore`, {
        method: 'POST',
        body: { database: targetDatabase, confirmDatabase: confirmation },
      })
      dismissRestore()
      await loadBackups()
      if (result.cleanupWarning) notify(result.cleanupWarning, 'warning')
      else notify(`Backup restored into ${targetDatabase}. Clients must reconnect.`, 'success')
    } catch (reason) { const message = errorMessage(reason); setError(message); notify(message, 'error') } finally { setBusy('') }
  }

  const handleDownload = async (backup: Backup) => {
    if (busy) return
    setBusy(`download:${backup.id}`); setError('')
    try {
      const response = await fetch(`/api/studio/backups/${encodeURIComponent(backup.id)}/download`, {
        credentials: 'same-origin', cache: 'no-store',
      })
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('studio-session-expired'))
        const body = await response.json()
        throw new Error(body.error || 'SQL dump download failed')
      }
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href; link.download = `backup-${backup.id}.sql`
      document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(href), 60000)
      notify('SQL dump downloaded', 'success')
    } catch (reason) { const message = errorMessage(reason); setError(message); notify(message, 'error') }
    finally { setBusy('') }
  }

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!targetBackup || busy || confirmation !== targetBackup.id) return
    setBusy('delete'); setError('')
    try {
      await api(`/backups/${encodeURIComponent(targetBackup.id)}`, {
        method: 'DELETE', body: { confirmBackupId: confirmation },
      })
      setDeleteOpen(false); setTargetBackup(null); setConfirmation('')
      await loadBackups()
      notify('Backup deleted', 'success')
    } catch (reason) { const message = errorMessage(reason); setError(message); notify(message, 'error') }
    finally { setBusy('') }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-6 w-full">
      {/* Header — original database-backup title and action */}
      <div className="flex items-center justify-between pb-4 border-b border-default">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
            <Archive className="h-5 w-5 text-foreground-lighter" />
            Database Backups
          </h1>
          <p className="text-sm text-foreground-lighter mt-1">
            Create manual snapshots and restore the database from an available backup.
          </p>
        </div>
        <Button
          variant="default"
          size="small"
          iconLeft={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            const now = new Date()
            const stamp = `${now.toISOString().split('T')[0]}_${now.getHours()}-${now.getMinutes()}`
            setNewBackupName(`manual-backup-${stamp}`)
            setCreateOpen(true)
          }}
          className="gap-1.5 font-medium shadow-xs"
        >
          Create backup
        </Button>
      </div>

      {error && <div role="alert" className="border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* Search & Stats Bar — live server values */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground-lighter" />
          <Input placeholder="Search backups..." value={search} onChange={event => setSearch(event.target.value)} className="pl-9 bg-surface-100 border-default text-xs h-8 text-foreground placeholder:text-foreground-muted focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" />
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground-lighter flex-wrap">
          <span>{loading ? <><Spinner size={14} decorative /><span className="sr-only">Loading backups</span></> : `${backups.length} backups`}</span>
          <span className="text-border-strong">•</span>
          <span>Total storage: {loading ? <Spinner size={14} decorative /> : formatBytes(totalBytes)}</span>
          <Button variant="default" size="tiny" disabled={loading || !!busy} iconLeft={<RotateCcw className="h-3 w-3" />} onClick={() => loadBackups().then(() => notify('Backups refreshed')).catch(reason => { const message = errorMessage(reason); setError(message); notify(message, 'error') })}>Refresh</Button>
        </div>
      </div>

      {/* Backups List — original 12-column row and action-menu composition */}
      <div role="region" aria-label={loading ? 'Loading backups' : 'Backups list'} aria-busy={loading} className="rounded-lg border border-default overflow-hidden shadow-xs">
        <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-2.5 bg-surface-200/60 border-b border-default text-[11px] font-medium uppercase tracking-wider text-foreground-lighter">
          <div className="col-span-4">Backup name</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Size</div>
          <div className="col-span-3">Created at</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {loading && filtered.length > 0 && <LoadingIndicator label="Refreshing backups" className="py-6" size={20} />}
        {filtered.map(backup => (
          <div key={backup.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center border-b border-default last:border-b-0 hover:bg-surface-200/40 transition-colors group text-sm">
            <div className="col-span-12 sm:col-span-4 flex items-center gap-2.5 min-w-0">
              <Archive className="h-4 w-4 text-foreground-lighter shrink-0" />
              <div className="min-w-0">
                <span className="font-medium text-foreground truncate font-mono text-xs block">{backup.label}</span>
                <span className="text-[10px] text-foreground-muted font-mono">{backup.database_name} · {backup.id}</span>
              </div>
            </div>
            <div className="col-span-4 sm:col-span-2"><span title="Backup type is not included in the live backup response" className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-strong text-foreground-lighter bg-surface-200">Not exposed</span></div>
            <div className="col-span-3 sm:col-span-2 flex items-center gap-1.5 text-foreground-lighter">
              <HardDrive className="h-3 w-3 text-foreground-muted" />
              <span className="font-mono text-xs">{formatBytes(backup.size_bytes)}</span>
            </div>
            <span className="col-span-4 sm:col-span-3 text-xs text-foreground-lighter font-mono">{backup.created_at ? new Date(backup.created_at).toLocaleString() : '—'}</span>
            <div className="col-span-1 flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label={`Actions for backup ${backup.label}`} className="h-7 w-7 flex items-center justify-center rounded-md text-foreground-lighter hover:text-foreground hover:bg-surface-300 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 bg-surface-100 border-default text-foreground shadow-xl">
                  <DropdownMenuItem disabled={!backup.available || !!busy} title={!backup.available ? 'Backup archive is missing from storage' : undefined} onSelect={() => void handleDownload(backup)} className="text-xs gap-2 cursor-pointer">
                    <Download className="h-3.5 w-3.5 text-foreground-lighter" />Download SQL dump
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!backup.available} className="text-xs gap-2 cursor-pointer" onSelect={() => {
                    setTargetBackup(backup); setTargetDatabase(database); setConfirmation(''); setRestoreOpen(true)
                  }}>
                    <RotateCcw className="h-3.5 w-3.5 text-foreground-lighter" />Restore backup
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border-muted" />
                  <DropdownMenuItem disabled={!!busy} onSelect={() => {
                    setTargetBackup(backup); setConfirmation(''); setDeleteOpen(true)
                  }} className="text-xs gap-2 text-destructive cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />Delete backup
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-foreground-lighter">
            {loading ? <LoadingIndicator label="Loading backups" className="py-2" size={20} /> : backups.length ? 'No backups found matching your search.' : 'No backups found. Create your first backup snapshot to protect your data.'}
          </div>
        )}
      </div>

      {/* Create Backup Dialog — original fields; unsupported retention remains visible and disabled */}
      <Dialog open={createOpen} onOpenChange={open => { if (!busy) setCreateOpen(open) }}>
        <DialogContent className="max-w-md p-6 bg-surface-100 border-default text-foreground shadow-2xl rounded-lg">
          <form onSubmit={handleCreate}>
            <DialogHeader className="pb-3 border-b border-default text-left">
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2"><Archive className="h-4 w-4 text-foreground-lighter" />Create database backup</DialogTitle>
              <DialogDescription className="text-xs text-foreground-lighter mt-1">Take an immediate point-in-time manual snapshot of your database.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-1.5"><label htmlFor="backup-name" className="text-xs font-medium text-foreground">Backup name <span className="text-destructive">*</span></label><Input id="backup-name" aria-label="Backup name" placeholder="e.g. pre-migration-v2, weekly-snapshot" value={newBackupName} onChange={event => setNewBackupName(event.target.value)} disabled={!!busy} required autoFocus className="bg-surface-200 border-strong text-foreground placeholder:text-foreground-muted text-xs h-9 focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" /></div>
              <div className="space-y-1.5"><label htmlFor="backup-retention" className="text-xs font-medium text-foreground">Retention policy</label><select id="backup-retention" disabled value="managed" className="w-full bg-surface-200 border border-strong rounded-md text-xs h-9 px-2.5 text-foreground outline-none cursor-not-allowed opacity-60"><option value="managed">Managed by backup service</option></select><p className="text-[11px] text-foreground-muted">Retention options are not exposed by the backup API.</p></div>
            </div>
            {error && <p role="alert" className="mb-3 text-xs text-destructive">{error}</p>}
            <DialogFooter className="pt-3 border-t border-default flex items-center justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} disabled={!!busy} className="px-3 py-1.5 text-xs font-medium text-foreground-lighter hover:text-foreground hover:bg-surface-200 rounded-md transition-colors">Cancel</button>
              <button type="submit" disabled={!newBackupName.trim() || !!busy} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-foreground bg-surface-300 hover:bg-surface-200 disabled:opacity-50 disabled:pointer-events-none border border-strong rounded-md transition-colors shadow-xs">
                {busy === 'create' ? <><Spinner size={14} decorative />Creating backup...</> : 'Create backup'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation Dialog — target DB selection and typed confirmation protect real restore */}
      <Dialog open={restoreOpen} onOpenChange={open => { if (!open && !busy) dismissRestore() }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden" onEscapeKeyDown={event => busy && event.preventDefault()} onPointerDownOutside={event => busy && event.preventDefault()}>
          <form onSubmit={handleRestore}>
            {error && <p role="alert" className="mx-5 mt-4 text-xs text-destructive">{error}</p>}
            <div className="px-5 py-4 border-b border-default"><DialogTitle className="text-sm font-medium pr-6 flex items-center gap-2"><RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />Confirm restore of backup &quot;{targetBackup?.label}&quot;</DialogTitle></div>
            <div className="px-5 py-4 space-y-4">
              <DialogDescription className="text-sm text-foreground-light leading-relaxed">Restoring replaces the selected target database contents and disconnects its clients. This action cannot be undone.</DialogDescription>
              <label className="block text-xs font-medium">Target database<select aria-label="Target database" value={targetDatabase} disabled={!!busy} onChange={event => { setTargetDatabase(event.target.value); setConfirmation('') }} className="block w-full mt-2 bg-surface-200 border border-strong rounded-md h-9 px-2 text-xs">{branches.map(branch => <option key={branch.name} value={branch.database_name}>{branch.name} · {branch.database_name}</option>)}</select></label>
              <label className="block text-xs text-foreground-lighter">Type <code className="font-mono text-foreground">{targetDatabase}</code> to confirm<Input aria-label="Confirm restore database" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={!!busy} className="mt-2 bg-surface-200 border-strong font-mono text-xs" /></label>
            </div>
            <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2"><Button type="button" variant="default" size="large" disabled={!!busy} onClick={dismissRestore}>Cancel</Button><Button type="submit" variant="warning" size="large" disabled={!!busy || !targetBackup?.available || confirmation !== targetDatabase} loading={!!busy}>{busy === 'restore' ? 'Restoring...' : 'Restore backup'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={open => {
        if (busy) return
        setDeleteOpen(open)
        if (!open) { setTargetBackup(null); setConfirmation('') }
      }}>
        <DialogContent className="bg-surface-100 border-default text-foreground sm:max-w-md">
          <form onSubmit={event => void handleDelete(event)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Delete backup &quot;{targetBackup?.label}&quot;?</DialogTitle>
              <DialogDescription>Permanently removes this backup archive and its metadata. This cannot be undone. The live database is not changed.</DialogDescription>
            </DialogHeader>
            <label className="block text-xs text-foreground-lighter">
              Type <code>{targetBackup?.id}</code> to confirm
              <Input aria-label="Confirm backup ID" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={!!busy} className="mt-2 font-mono text-xs" />
            </label>
            <DialogFooter>
              <Button type="button" variant="default" disabled={!!busy} onClick={() => { setDeleteOpen(false); setTargetBackup(null); setConfirmation('') }}>Cancel</Button>
              <Button type="submit" variant="destructive" loading={busy === 'delete'} disabled={!!busy || confirmation !== targetBackup?.id}>Delete backup</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
