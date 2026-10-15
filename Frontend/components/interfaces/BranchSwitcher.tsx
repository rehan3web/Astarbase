'use client'

import React, { useMemo, useState } from 'react'
import { GitBranch, Search, Plus, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'

type BranchTag = 'default' | 'branch'
function getTag(branch: { parent_name: string | null }): BranchTag { return branch.parent_name ? 'branch' : 'default' }
function getTagBadgeStyle(tag: BranchTag) {
  return tag === 'default' ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' : 'border-strong text-foreground-lighter bg-surface-200'
}

export function BranchSwitcher() {
  const { branches, branch: activeBranch, database, selectBranch, reload } = useStudio()
  const { notify } = useNotifications()
  const [search, setSearch] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [parentDatabase, setParentDatabase] = useState(database)
  const [isCreating, setIsCreating] = useState(false)
  const filteredBranches = useMemo(() => branches.filter(item => `${item.name} ${item.database_name}`.toLowerCase().includes(search.toLowerCase())), [branches, search])
  async function handleCreateBranch(event: React.FormEvent) {
    event.preventDefault()
    if (!newBranchName.trim() || isCreating) return
    setIsCreating(true)
    try {
      const name = newBranchName.trim()
      const parent = branches.find(branch => branch.database_name === parentDatabase)
      if (!parent) throw new Error('Select a valid parent database.')
      await api('/branches', { method: 'POST', body: { name, parent: parent.name } })
      await reload()
      selectBranch(name)
      setDialogOpen(false); setNewBranchName('')
      notify(`Branch "${name}" created`, 'success')
    } catch (e) { notify(errorMessage(e), 'error') }
    finally { setIsCreating(false) }
  }
  return (
    <>
      {/* Branch Dropdown Trigger — original source structure */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Active branch" className="flex items-center gap-1.5 hover:bg-surface-200 px-2 py-1 rounded-md cursor-pointer transition-colors outline-none select-none">
            <GitBranch className="h-3.5 w-3.5 text-foreground-lighter" />
            <span className="font-medium text-foreground">{activeBranch?.name || 'Branch'}</span>
            {activeBranch && <span className={`text-[10px] uppercase tracking-wide font-medium border rounded-full px-2 py-0.5 ml-1 ${getTagBadgeStyle(getTag(activeBranch))}`}>{getTag(activeBranch)}</span>}
            <ChevronsUpDown className="h-3.5 w-3.5 text-foreground-muted ml-0.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-72 p-0 shadow-2xl border-default bg-surface-100 rounded-md overflow-hidden text-foreground">
          <div className="p-2 border-b border-default bg-surface-75/40">
            <Input placeholder="Search branches..." value={search} onChange={e => setSearch(e.target.value)} className="bg-surface-200 border-strong h-8 text-xs text-foreground placeholder:text-foreground-muted focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" iconLeft={<Search className="h-3.5 w-3.5 text-foreground-lighter" />} />
          </div>
          <div className="p-1">
            <div className="px-2 py-1 text-[11px] font-medium text-foreground-lighter">Branches ({filteredBranches.length})</div>
            <div className="max-h-[175px] overflow-y-auto space-y-0.5 pr-1">
              {filteredBranches.length ? filteredBranches.map(item => {
                const selected = item.name === activeBranch?.name
                const tag = getTag(item)
                return <div key={item.name} role="option" aria-selected={selected} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBranch(item.name); setPopoverOpen(false) } }} onClick={() => { selectBranch(item.name); setPopoverOpen(false) }} className={`px-2 py-1.5 h-[34px] text-xs rounded-md flex items-center justify-between cursor-pointer transition-colors ${selected ? 'bg-surface-200 text-foreground font-medium' : 'text-foreground-light hover:bg-surface-200 hover:text-foreground'}`}>
                  <div className="flex items-center gap-2 min-w-0"><GitBranch className="h-3.5 w-3.5 text-foreground-lighter shrink-0" /><span className="truncate">{item.name}</span><span className="text-[9px] uppercase tracking-wider font-medium border rounded-full px-1.5 py-0.2 shrink-0 text-foreground-lighter border-strong bg-surface-200">{tag}</span></div>
                  {selected && <Check className="h-3.5 w-3.5 text-foreground shrink-0 ml-2" />}
                </div>
              }) : <div className="px-2 py-4 text-xs text-foreground-lighter text-center">No branches found matching “{search}”</div>}
            </div>
          </div>
          <div className="p-1.5 border-t border-default bg-surface-75/60">
            <button type="button" onClick={() => { setPopoverOpen(false); setParentDatabase(database); setDialogOpen(true) }} className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium text-foreground bg-surface-200 hover:bg-surface-300 border border-strong rounded-md transition-colors shadow-2xs">
              <Plus className="h-3.5 w-3.5 text-foreground-lighter" />Create new branch
            </button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Create New Branch Dialog Modal — original modal shell, live parent selection */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-6 bg-surface-100 border-default text-foreground shadow-2xl rounded-lg">
          <form onSubmit={handleCreateBranch}>
            <DialogHeader className="pb-3 border-b border-default text-left">
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2"><GitBranch className="h-4 w-4 text-foreground-lighter" />Create new branch</DialogTitle>
              <DialogDescription className="text-xs text-foreground-lighter mt-1">Branch the selected parent database for isolated schema development and testing.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-1.5"><label className="text-xs font-medium text-foreground">Branch name <span className="text-destructive">*</span></label><Input aria-label="New branch name" placeholder="e.g. staging, feature_auth" value={newBranchName} onChange={e => setNewBranchName(e.target.value)} pattern="[a-z][a-z0-9_]{0,47}" maxLength={48} disabled={isCreating} required autoFocus className="bg-surface-200 border-strong text-foreground placeholder:text-foreground-muted text-xs h-9 focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" /></div>
              <div className="space-y-1.5"><label className="text-xs font-medium text-foreground">Parent database</label><select aria-label="Parent database" value={parentDatabase} onChange={e => setParentDatabase(e.target.value)} disabled={isCreating} className="w-full bg-surface-200 border border-strong rounded-md text-xs h-9 px-2.5 text-foreground outline-none focus:ring-1 focus:ring-strong cursor-pointer">{branches.map(item => <option key={item.name} value={item.database_name}>{item.name} · {item.database_name}</option>)}</select></div>
            </div>
            <DialogFooter className="pt-3 border-t border-default flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDialogOpen(false)} disabled={isCreating} className="px-3 py-1.5 text-xs font-medium text-foreground-lighter hover:text-foreground hover:bg-surface-200 rounded-md transition-colors">Cancel</button>
              <button type="submit" disabled={!newBranchName.trim() || isCreating} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-foreground bg-surface-300 hover:bg-surface-200 disabled:opacity-50 disabled:pointer-events-none border border-strong rounded-md transition-colors shadow-xs">
                {isCreating ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />Creating branch...</> : 'Create branch'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
