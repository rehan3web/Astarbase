'use client'

import React, { useState } from 'react'
import {
  AlertTriangle,
  Check,
  GitBranch,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
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
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'

export function BranchesPageView() {
  const { branches, branch: activeBranch, selectBranch, reload } = useStudio()
  const [createOpen, setCreateOpen] = useState(false)
  const [refreshOpen, setRefreshOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [targetBranch, setTargetBranch] = useState<(typeof branches)[number] | null>(null)
  const [newBranchName, setNewBranchName] = useState('')
  const [parentDatabase, setParentDatabase] = useState(activeBranch?.database_name ?? '')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (message: string) => {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(current => current === message ? null : current), 4000)
  }

  const closeConfirmation = () => {
    setRefreshOpen(false)
    setDeleteOpen(false)
    setTargetBranch(null)
    setConfirmation('')
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newBranchName.trim() || busy) return
    setBusy(true); setError('')
    try {
      const name = newBranchName.trim()
      const parent = branches.find(branch => branch.database_name === parentDatabase)
      if (!parent) throw new Error('Select a valid parent database.')
      await api('/branches', { method: 'POST', body: { name, parent: parent.name } })
      await reload()
      setCreateOpen(false); setNewBranchName('')
      showToast(`Branch "${name}" created successfully`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  const handleRefresh = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!targetBranch || busy || confirmation !== targetBranch.database_name) return
    setBusy(true); setError('')
    try {
      const result = await api<{ cleanupWarning?: string }>(`/branches/${encodeURIComponent(targetBranch.name)}/refresh`, {
        method: 'POST',
        body: { confirmDatabase: confirmation },
      })
      await reload()
      closeConfirmation()
      showToast(result.cleanupWarning || `Branch "${targetBranch.name}" refreshed from its parent. Clients must reconnect.`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!targetBranch || !targetBranch.parent_name || busy || confirmation !== targetBranch.database_name) return
    setBusy(true); setError('')
    try {
      await api(`/branches/${encodeURIComponent(targetBranch.name)}`, {
        method: 'DELETE',
        body: { confirmDatabase: confirmation },
      })
      await reload()
      closeConfirmation()
      showToast(`Branch "${targetBranch.name}" deleted successfully.`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8 space-y-6">
      {/* Header — original branch-management composition */}
      <div className="flex items-center justify-between pb-4 border-b border-default">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2.5">
            <GitBranch className="h-5 w-5 text-foreground-lighter" />
            Branches
          </h1>
          <p className="text-sm text-foreground-lighter mt-1">
            Manage database branches for safe schema development and testing.
          </p>
        </div>
        <Button
          variant="primary"
          size="small"
          iconLeft={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            setParentDatabase(activeBranch?.database_name ?? branches[0]?.database_name ?? '')
            setCreateOpen(true)
          }}
          className="gap-1.5 font-medium shadow-xs"
        >
          Create branch
        </Button>
      </div>

      {error && <div role="alert" className="border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2 text-sm text-red-400">{error}</div>}

      {/* Branches Table — original five-column layout; unavailable metadata is explicit */}
      <div className="rounded-lg border border-default overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_48px] bg-surface-200/60 border-b border-default px-4 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-foreground-lighter">Branch name</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-foreground-lighter">Tag</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-foreground-lighter">Storage</span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-foreground-lighter">Created</span>
          <span />
        </div>
        {branches.map(branch => {
          const isDefault = !branch.parent_name
          return (
            <div key={branch.name} className="grid grid-cols-[2fr_1fr_1fr_1fr_48px] items-center px-4 py-3 border-b border-default last:border-b-0 hover:bg-surface-200/40 transition-colors group">
              <div className="flex items-center gap-2.5 min-w-0">
                <GitBranch className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{branch.name}</span>
                    {activeBranch?.name === branch.name && <span className="text-[9px] uppercase tracking-wider font-semibold border border-strong rounded-full px-1.5 py-0.5 text-foreground-lighter shrink-0">active</span>}
                    {isDefault && <span className="text-[9px] uppercase tracking-wider font-semibold border border-strong rounded-full px-1.5 py-0.5 text-foreground-lighter shrink-0">default</span>}
                  </div>
                  <span className="block mt-0.5 text-[10px] text-foreground-muted font-mono truncate">{branch.database_name}{branch.parent_name ? ` · parent ${branch.parent_name}` : ''}</span>
                </div>
              </div>
              <span className="text-[10px] text-foreground-muted" title="Branch tags are not returned by the live API">Not exposed</span>
              <div className="flex items-center gap-1.5 text-sm text-foreground-light" title="Storage usage is not returned by the live API">
                <HardDrive className="h-3 w-3 text-foreground-muted" />
                <span className="font-mono text-xs">—</span>
              </div>
              <span className="text-xs text-foreground-lighter font-mono">
                {branch.created_at ? new Date(branch.created_at).toLocaleDateString() : '—'}
                <span className="block text-[10px] text-foreground-muted mt-0.5">{branch.refreshed_at ? `Refreshed ${new Date(branch.refreshed_at).toLocaleDateString()}` : 'Never refreshed'}</span>
              </span>
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Actions for ${branch.name}`} className="h-7 w-7 flex items-center justify-center rounded-md text-foreground-lighter hover:text-foreground hover:bg-surface-300 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 bg-surface-100 border-default text-foreground shadow-xl">
                    <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onSelect={() => selectBranch(branch.name)}>
                      <GitBranch className="h-3.5 w-3.5 text-foreground-lighter" />Switch to branch
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled title="Branch rename is not provided by the connected API." className="text-xs gap-2 opacity-50">
                      <Pencil className="h-3.5 w-3.5 text-foreground-lighter" />Rename unavailable
                    </DropdownMenuItem>
                    {branch.parent_name && <>
                      <DropdownMenuSeparator className="bg-border-muted" />
                      <DropdownMenuItem className="text-xs gap-2 cursor-pointer" onSelect={() => { setTargetBranch(branch); setConfirmation(''); setRefreshOpen(true) }}>
                        <RotateCcw className="h-3.5 w-3.5 text-foreground-lighter" />Pull / refresh
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs gap-2 text-destructive focus:text-destructive cursor-pointer" onSelect={() => { setTargetBranch(branch); setConfirmation(''); setDeleteOpen(true) }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />Delete branch
                      </DropdownMenuItem>
                    </>}
                    {!branch.parent_name && <DropdownMenuItem disabled title="The base database cannot be refreshed or deleted." className="text-xs gap-2 opacity-50"><Trash2 className="h-3.5 w-3.5" />Base database protected</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )
        })}
        {branches.length === 0 && <div className="px-4 py-12 text-center text-sm text-foreground-lighter">No branches found. Check the backend connection and retry.</div>}
      </div>

      {/* Create Branch Dialog — same original shell, live parent database field */}
      <Dialog open={createOpen} onOpenChange={open => { if (!busy) setCreateOpen(open) }}>
        <DialogContent className="max-w-md p-6 bg-surface-100 border-default text-foreground shadow-2xl rounded-lg">
          <form onSubmit={handleCreate}>
            <DialogHeader className="pb-3 border-b border-default text-left">
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2"><GitBranch className="h-4 w-4 text-foreground-lighter" />Create new branch</DialogTitle>
              <DialogDescription className="text-xs text-foreground-lighter mt-1">Branch your database to safely develop schema changes or test migrations.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="branch-new-name" className="text-xs font-medium text-foreground">Branch name <span className="text-destructive">*</span></label>
                <Input id="branch-new-name" aria-label="New branch name" placeholder="e.g. staging, feature_auth" pattern="[a-z][a-z0-9_]{0,47}" maxLength={48} value={newBranchName} onChange={event => setNewBranchName(event.target.value)} disabled={busy} required autoFocus className="bg-surface-200 border-strong text-foreground placeholder:text-foreground-muted text-xs h-9 focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="branch-parent" className="text-xs font-medium text-foreground">Parent database</label>
                <select id="branch-parent" aria-label="Parent database" value={parentDatabase} onChange={event => setParentDatabase(event.target.value)} disabled={busy} className="w-full bg-surface-200 border border-strong rounded-md text-xs h-9 px-2.5 text-foreground outline-none focus:ring-1 focus:ring-strong cursor-pointer">
                  {branches.map(branch => <option key={branch.name} value={branch.database_name}>{branch.name} · {branch.database_name}</option>)}
                </select>
              </div>
            </div>
            {error && <p role="alert" className="mb-3 text-xs text-destructive">{error}</p>}
            <DialogFooter className="pt-3 border-t border-default flex items-center justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} disabled={busy} className="px-3 py-1.5 text-xs font-medium text-foreground-lighter hover:text-foreground hover:bg-surface-200 rounded-md transition-colors">Cancel</button>
              <button type="submit" disabled={!newBranchName.trim() || busy || !parentDatabase} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-foreground bg-surface-300 hover:bg-surface-200 disabled:opacity-50 disabled:pointer-events-none border border-strong rounded-md transition-colors shadow-xs">
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating...</> : 'Create branch'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refresh confirmation — original compact confirmation-dialog structure */}
      <Dialog open={refreshOpen} onOpenChange={open => { if (!open && !busy) closeConfirmation() }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden" onEscapeKeyDown={event => busy && event.preventDefault()} onPointerDownOutside={event => busy && event.preventDefault()}>
          <form onSubmit={handleRefresh}>
            {error && <p role="alert" className="mx-5 mt-4 text-xs text-destructive">{error}</p>}
            <div className="px-5 py-4 border-b border-default"><DialogTitle className="text-sm font-medium pr-6 flex items-center gap-2"><RotateCcw className="h-4 w-4 text-amber-500 shrink-0" />Confirm refresh of branch &quot;{targetBranch?.name}&quot;</DialogTitle></div>
            <div className="px-5 py-4 space-y-4">
              <DialogDescription className="text-sm text-foreground-light leading-relaxed">Pulling from the parent replaces this branch database and disconnects its clients. This is not a merge and cannot be undone.</DialogDescription>
              <label className="block text-xs text-foreground-lighter">Type <span className="font-mono font-medium text-foreground">{targetBranch?.database_name}</span> to confirm<Input aria-label="Confirm branch database" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} className="mt-2 bg-surface-200 border-strong font-mono text-xs" /></label>
            </div>
            <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2"><Button type="button" variant="default" size="large" disabled={busy} onClick={closeConfirmation}>Cancel</Button><Button type="submit" variant="warning" size="large" disabled={busy || confirmation !== targetBranch?.database_name} loading={busy}>{busy ? 'Refreshing...' : 'Refresh branch'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — original compact destructive dialog structure */}
      <Dialog open={deleteOpen} onOpenChange={open => { if (!open && !busy) closeConfirmation() }}>
        <DialogContent className="max-w-md p-0 gap-0 overflow-hidden" onEscapeKeyDown={event => busy && event.preventDefault()} onPointerDownOutside={event => busy && event.preventDefault()}>
          <form onSubmit={handleDelete}>
            {error && <p role="alert" className="mx-5 mt-4 text-xs text-destructive">{error}</p>}
            <div className="px-5 py-4 border-b border-default"><DialogTitle className="text-sm font-medium pr-6 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive shrink-0" />Confirm deletion of branch &quot;{targetBranch?.name}&quot;</DialogTitle></div>
            <div className="px-5 py-4 space-y-4">
              <DialogDescription className="text-sm text-foreground-light leading-relaxed">This permanently removes the branch database and its data. This action cannot be undone.</DialogDescription>
              <label className="block text-xs text-foreground-lighter">Type <span className="font-mono font-medium text-foreground">{targetBranch?.database_name}</span> to confirm<Input aria-label="Confirm branch database" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} className="mt-2 bg-surface-200 border-strong font-mono text-xs" /></label>
            </div>
            <div className="px-5 py-4 border-t border-default grid grid-cols-2 gap-2"><Button type="button" variant="default" size="large" disabled={busy} onClick={closeConfirmation}>Cancel</Button><Button type="submit" variant="destructive" size="large" disabled={busy || confirmation !== targetBranch?.database_name} loading={busy}>{busy ? 'Deleting...' : 'Delete branch'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Original success toast */}
      {toastMessage && <div role="status" className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg border border-strong bg-surface-100 p-3.5 text-xs text-foreground shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 text-foreground border border-strong shrink-0"><Check className="h-3.5 w-3.5" /></div>
        <div className="pr-2"><div className="font-semibold text-foreground">Success</div><div className="text-[11px] text-foreground-lighter mt-0.5">{toastMessage}</div></div>
        <button type="button" onClick={() => setToastMessage(null)} className="text-foreground-lighter hover:text-foreground p-1 transition-colors" aria-label="Dismiss notification"><X className="h-3.5 w-3.5" /></button>
      </div>}
    </div>
  )
}
