'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v) } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])
  return <><button aria-label="Search navigation" onClick={() => setOpen(true)} className="text-foreground-lighter"><Search size={16} /></button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Go to</DialogTitle><input autoFocus placeholder="Search pages…" value={search} onChange={e => setSearch(e.target.value)} className="bg-studio rounded border border-default p-2" />{[['/tables','Table editor'],['/sql','SQL runner'],['/branches','Branches'],['/visualizer','Schema visualizer'],['/settings/backups','Settings / Backups'],['/settings','Admin settings']].filter(([,title]) => title.toLowerCase().includes(search.toLowerCase())).map(([url,title]) => <Link key={url} href={url} onClick={() => setOpen(false)} className="p-2 rounded hover:bg-surface-100">{title}</Link>)}</DialogContent></Dialog></>
}
