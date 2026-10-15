'use client'
import { GitBranch } from 'lucide-react'
import { useStudio } from '@/components/providers/StudioProvider'

export function BranchSwitcher() {
  const { branches, branch, selectBranch } = useStudio()
  return <label className="flex items-center gap-2 text-sm"><GitBranch className="h-4 w-4 text-foreground-lighter" />
    <select aria-label="Active branch" value={branch?.name ?? ''} onChange={e => selectBranch(e.target.value)} className="rounded border border-default bg-studio px-2 py-1">
      {branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
    </select>
  </label>
}
