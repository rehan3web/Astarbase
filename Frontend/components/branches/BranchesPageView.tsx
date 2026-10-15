'use client'
import React, { useState } from 'react'
import { GitBranch, Plus, RefreshCw } from 'lucide-react'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'

export function BranchesPageView() {
  const { branches, branch, selectBranch, reload } = useStudio()
  const [name, setName] = useState('')
  const [parent, setParent] = useState('main')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshName, setRefreshName] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const target = branches.find(b => b.name === refreshName)
  async function create(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy('create'); setError(''); setNotice('')
    try {
      await api('/branches', { method: 'POST', body: { name, parent } })
      await reload(); setName(''); setNotice('Branch database created from a live parent snapshot. PgBouncer routes it automatically.')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy('') }
  }
  async function refresh(e: React.FormEvent) {
    e.preventDefault(); if (!target || busy || confirmation !== target.database_name) return
    setBusy(target.name); setError(''); setNotice('')
    try {
      const result = await api<{ cleanupWarning?: string }>(`/branches/${encodeURIComponent(target.name)}/refresh`, { method: 'POST', body: { confirmDatabase: confirmation } })
      await reload(); setRefreshName(''); setConfirmation('')
      setNotice(result.cleanupWarning || 'Branch refreshed from its parent. Existing database clients must reconnect.')
    } catch (e) { setError(errorMessage(e)) } finally { setBusy('') }
  }
  return <div className="flex-1 overflow-auto p-8 space-y-7">
    <header className="flex justify-between items-center"><div><h1 className="text-2xl font-semibold flex items-center gap-3"><GitBranch size={22} />Branches</h1><p className="mt-2 text-sm text-foreground-lighter">Each branch is a database in your single Postgres container.</p></div><button disabled={!!busy} onClick={() => reload().catch(e => setError(errorMessage(e)))} className="rounded border border-default px-3 py-2 text-sm">Reload</button></header>
    {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
    {notice && <p role="status" className="text-brand-500 text-sm">{notice}</p>}
    <form onSubmit={create} className="border border-default bg-dash-sidebar rounded-lg p-5 flex flex-wrap gap-4 items-end">
      <label className="text-sm">Branch name<input aria-label="New branch name" required pattern="[a-z][a-z0-9_]{0,47}" maxLength={48} placeholder="feature_auth" value={name} onChange={e => setName(e.target.value)} className="block mt-2 border border-default bg-studio p-2 rounded" /></label>
      <label className="text-sm">Parent database<select value={parent} onChange={e => setParent(e.target.value)} className="block mt-2 border border-default bg-studio p-2 rounded">{branches.map(b => <option key={b.name}>{b.name}</option>)}</select></label>
      <button disabled={!!busy} className="flex gap-2 items-center rounded bg-brand-500 text-black px-4 py-2 text-sm disabled:opacity-50"><Plus size={16} />{busy === 'create' ? 'Creating snapshot…' : 'Create branch'}</button>
    </form>
    <div className="rounded-lg border border-default overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-dash-sidebar text-foreground-lighter"><tr><th className="p-4">Branch</th><th>Database</th><th>Parent</th><th>Last refresh</th><th>Actions</th></tr></thead><tbody>
      {branches.map(b => <tr key={b.name} className="border-t border-default"><td className="p-4 font-medium">{b.name}{branch?.name === b.name && <span className="ml-2 text-xs text-brand-500">Active</span>}</td><td className="font-mono text-xs">{b.database_name}</td><td>{b.parent_name || '—'}</td><td className="text-xs">{b.refreshed_at ? new Date(b.refreshed_at).toLocaleString() : 'Never'}</td><td className="py-3 space-x-3">
        <button disabled={!!busy} onClick={() => selectBranch(b.name)} className="text-brand-500">Switch</button>
        {b.parent_name && <button disabled={!!busy} onClick={() => { setRefreshName(b.name); setConfirmation('') }} className="text-foreground-lighter">Pull / refresh</button>}
      </td></tr>)}
    </tbody></table></div>
    {target && <form onSubmit={refresh} className="border border-amber-500/40 rounded-lg p-5 space-y-4 max-w-xl"><h2 className="font-semibold">Replace {target.name} from {target.parent_name}</h2><p className="text-sm text-foreground-lighter">This overwrites this branch&apos;s schema and data, removes branch-only objects, and disconnects target clients. It is not a merge. Type <code>{target.database_name}</code> to confirm.</p><input aria-label="Confirm branch database" className="w-full border border-default bg-studio rounded p-2" value={confirmation} onChange={e => setConfirmation(e.target.value)} /><div className="flex gap-4"><button disabled={!!busy || confirmation !== target.database_name} className="rounded bg-amber-600 px-4 py-2 text-sm disabled:opacity-40 flex gap-2 items-center"><RefreshCw size={14} />{busy === target.name ? 'Refreshing…' : 'Replace branch'}</button><button type="button" disabled={!!busy} onClick={() => setRefreshName('')}>Cancel</button></div></form>}
  </div>
}
