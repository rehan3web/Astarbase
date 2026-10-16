'use client'

import React, { useMemo, useState } from 'react'
import { GitBranch, Search, Plus, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { getTagBadgeStyle, isValidBranchTag } from '@/components/branches/branchTag'

export function BranchSwitcher() {
  const { branches, branch: activeBranch, database, selectBranch, reload } = useStudio()
  const { notify } = useNotifications()
  const [search, setSearch] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchTag, setNewBranchTag] = useState('dev')
  const [parentDatabase, setParentDatabase] = useState(database)
  const [isCreating, setIsCreating] = useState(false)
  const filteredBranches = useMemo(() => branches.filter(item => `${item.name} ${item.database_name} ${item.tag ?? ''}`.toLowerCase().includes(search.toLowerCase())), [branches, search])
  async function handleCreateBranch(event: React.FormEvent) {
    event.preventDefault()
    if (!newBranchName.trim() || isCreating) return
    const tag = newBranchTag.trim()
    if (!isValidBranchTag(tag)) {
      notify('Use a tag of up to 32 characters, starting with a letter or number.', 'error')
      return
    }
    setIsCreating(true)
    try {
      const name = newBranchName.trim()
      const parent = branches.find(branch => branch.database_name === parentDatabase)
      if (!parent) throw new Error('Select a valid parent database.')
       await api('/branches', { method: 'POST', body: { name, parent: parent.name, tag: tag || null } })
      await reload()
      selectBranch(name)
       setDialogOpen(false); setNewBranchName(''); setNewBranchTag('dev')
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
            {activeBranch?.tag && <span className={`text-[10px] uppercase tracking-wide font-medium border rounded-full px-2 py-0.5 ml-1 ${getTagBadgeStyle(activeBranch.tag)}`}>{activeBranch.tag}</span>}
            {activeBranch && <span className="text-[9px] uppercase tracking-wider font-medium border rounded-full px-1.5 py-0.5 text-foreground-lighter border-strong bg-surface-200">{activeBranch.parent_name ? 'branch' : 'default'}</span>}
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
                return <div key={item.name} role="option" aria-selected={selected} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBranch(item.name); setPopoverOpen(false) } }} onClick={() => { selectBranch(item.name); setPopoverOpen(false) }} className={`px-2 py-1.5 h-[34px] text-xs rounded-md flex items-center justify-between cursor-pointer transition-colors ${selected ? 'bg-surface-200 text-foreground font-medium' : 'text-foreground-light hover:bg-surface-200 hover:text-foreground'}`}>
                  <div className="flex items-center gap-2 min-w-0"><GitBranch className="h-3.5 w-3.5 text-foreground-lighter shrink-0" /><span className="truncate">{item.name}</span>{item.tag && <span className={`text-[9px] uppercase tracking-wider font-medium border rounded-full px-1.5 py-0.2 shrink-0 ${getTagBadgeStyle(item.tag)}`}>{item.tag}</span>}<span className="text-[8px] uppercase tracking-wider font-medium border rounded-full px-1 py-0.2 shrink-0 text-foreground-lighter border-strong bg-surface-200">{item.parent_name ? 'branch' : 'default'}</span></div>
                  {selected && <Check className="h-3.5 w-3.5 text-foreground shrink-0 ml-2" />}
                </div>
              }) : <div className="px-2 py-4 text-xs text-foreground-lighter text-center">No branches found matching “{search}”</div>}
            </div>
          </div>
          <div className="p-1.5 border-t border-default bg-surface-75/60">
            <button type="button" onClick={() => { setPopoverOpen(false); setParentDatabase(database); setNewBranchName(''); setNewBranchTag('dev'); setDialogOpen(true) }} className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium text-foreground bg-surface-200 hover:bg-surface-300 border border-strong rounded-md transition-colors shadow-2xs">
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
              <div className="space-y-1.5">
                <label htmlFor="switcher-branch-parent" className="text-xs font-medium text-foreground">Parent database</label>
                <Select value={parentDatabase} onValueChange={setParentDatabase} disabled={isCreating}>
                  <SelectTrigger id="switcher-branch-parent" aria-label="Parent database" className="h-9 w-full">
                    <SelectValue placeholder="Select parent database" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(item => <SelectItem key={item.name} value={item.database_name}>{item.name} · {item.database_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label htmlFor="switcher-new-tag" className="text-xs font-medium text-foreground">Environment tag</label><Input id="switcher-new-tag" aria-label="Environment tag" placeholder="e.g. dev, staging, production" value={newBranchTag} onChange={e => setNewBranchTag(e.target.value)} maxLength={32} disabled={isCreating} className="bg-surface-200 border-strong text-foreground placeholder:text-foreground-muted text-xs h-9 focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong" /><p className="text-[10px] text-foreground-muted">Leave blank to create without a tag.</p></div>
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
