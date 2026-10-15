'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { api, Backup, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'

export function BackupsPageView() {
  const { database, branches } = useStudio()
  const [backups, setBackups] = useState<Backup[]>([])
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [restore, setRestore] = useState<Backup | null>(null)
  const [target, setTarget] = useState(database)
  const [confirmation, setConfirmation] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try { const rows = await api<Backup[]>(`/backups?database=${encodeURIComponent(database)}`, { signal }); if (!signal?.aborted) setBackups(rows) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [database])
  useEffect(() => {
    const controller = new AbortController()
    setBackups([]); setRestore(null); setTarget(database); setConfirmation(''); setError(''); setNotice('')
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
    return () => controller.abort()
  }, [load, database])
  async function create(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy('create'); setError(''); setNotice('')
    try {
      await api('/backups', { method: 'POST', body: { database, label: label.trim() || 'Manual backup' } })
      await load(); setLabel(''); setNotice('Docker pg_dump completed. Archive saved in Backend/backups/.')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy('') }
  }
  async function restoreBackup(e: React.FormEvent) {
    e.preventDefault(); if (!restore || busy || confirmation !== target) return
    setBusy('restore'); setError(''); setNotice('')
    try {
      const result = await api<{ cleanupWarning?: string }>(`/backups/${restore.id}/restore`, { method: 'POST', body: { database: target, confirmDatabase: confirmation } })
      setRestore(null); setNotice(result.cleanupWarning || `Backup restored into ${target}. Clients must reconnect.`)
      await load()
    } catch (e) { setError(errorMessage(e)) } finally { setBusy('') }
  }
  return <div className="flex-1 overflow-auto p-8 space-y-7">
    <header><h1 className="text-2xl font-semibold">Database backups</h1><p className="mt-2 text-sm text-foreground-lighter">Live pg_dump archives for <code>{database}</code>, created directly inside Docker and persisted in Backend/backups/.</p></header>
    {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    {notice && <p role="status" className="text-brand-500 text-sm">{notice}</p>}
    <form onSubmit={create} className="flex gap-3 items-center border border-default rounded-lg bg-dash-sidebar p-5"><input aria-label="Backup label" placeholder="Backup label (optional)" maxLength={200} className="flex-1 rounded border border-default bg-studio p-2 text-sm" value={label} onChange={e => setLabel(e.target.value)} /><button disabled={!!busy} className="rounded bg-brand-500 text-black px-4 py-2 text-sm disabled:opacity-40">{busy === 'create' ? 'Running pg_dump…' : 'Create backup'}</button><button type="button" disabled={!!busy || loading} onClick={() => load().catch(e => setError(errorMessage(e)))} className="border border-default rounded px-4 py-2 text-sm">Refresh</button></form>
    <div className="border border-default rounded-lg overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-dash-sidebar"><tr><th className="p-4">Backup</th><th>Created</th><th>Size</th><th>Archive status</th><th>Actions</th></tr></thead><tbody>
      {backups.map(b => <tr key={b.id} className="border-t border-default"><td className="p-4">{b.label}<div className="text-xs font-mono text-foreground-lighter mt-1">{b.id}.dump</div></td><td>{new Date(b.created_at).toLocaleString()}</td><td>{(Number(b.size_bytes) / 1024).toFixed(1)} KiB</td><td className={b.available ? 'text-brand-500' : 'text-red-400'}>{b.available ? 'Available' : 'File missing'}</td><td><button disabled={!!busy || !b.available} className="text-brand-500 disabled:opacity-40" onClick={() => { setRestore(b); setTarget(database); setConfirmation('') }}>Restore</button></td></tr>)}
      {!backups.length && <tr><td colSpan={5} className="p-8 text-center text-foreground-lighter">{loading ? 'Checking Docker backup files…' : 'No backups for this database yet.'}</td></tr>}
    </tbody></table></div>
    {restore && <form onSubmit={restoreBackup} className="border border-amber-500/40 rounded-lg p-5 space-y-4 max-w-xl"><h2 className="font-semibold">Restore “{restore.label}”</h2><p className="text-sm text-foreground-lighter">Restore replaces the target database&apos;s contents and disconnects its clients. The archive is restored to staging before replacement.</p><label className="block text-sm">Target database<select value={target} disabled={!!busy} onChange={e => { setTarget(e.target.value); setConfirmation('') }} className="block w-full mt-2 bg-studio border border-default rounded p-2">{branches.map(b => <option key={b.database_name}>{b.database_name}</option>)}</select></label><label className="block text-sm">Type <code>{target}</code> to confirm<input aria-label="Confirm restore database" className="block mt-2 w-full border border-default bg-studio rounded p-2" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><div className="flex gap-4"><button disabled={!!busy || confirmation !== target} className="rounded bg-amber-600 px-4 py-2 text-sm disabled:opacity-40">{busy === 'restore' ? 'Restoring…' : 'Replace database'}</button><button type="button" disabled={!!busy} onClick={() => setRestore(null)}>Cancel</button></div></form>}
  </div>
}
