'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { LockKeyhole, Search, Shield, Table2 } from 'lucide-react'
import { api, Diagram, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PoliciesPageView() {
  const { database } = useStudio()
  const [catalog, setCatalog] = useState<Diagram | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try {
      const result = await api<Diagram>(`/databases/${encodeURIComponent(database)}/schema`, { signal })
      if (!signal?.aborted) { setCatalog(result); setSelectedId(current => result.nodes.some(n => n.id === current) ? current : result.nodes[0]?.id ?? '') }
    } catch (e) { if (!signal?.aborted) setError(errorMessage(e)) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [database])
  useEffect(() => { const controller = new AbortController(); setCatalog(null); setSelectedId(''); void load(controller.signal); return () => controller.abort() }, [load])
  const tables = useMemo(() => (catalog?.nodes || []).filter(table => `${table.schema}.${table.name}`.toLowerCase().includes(search.toLowerCase())), [catalog, search])
  const current = catalog?.nodes.find(table => table.id === selectedId)
  return <div className="flex-1 w-full h-full p-8 md:p-12 overflow-y-auto">
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-medium text-foreground">Policies</h1><p className="text-base text-foreground-lighter mt-1">Manage Row Level Security policies for your tables</p></div>
      </div>
      <div className="flex items-center pt-4"><Input aria-label="Search tables" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 bg-studio border-default text-sm rounded-md w-64" iconLeft={<Search className="h-4 w-4" />} /></div>
      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-red-400">{error}<button onClick={() => void load()} className="ml-3 underline">Retry</button></div>}
      <section className="border border-default bg-studio rounded-lg overflow-hidden mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-default bg-studio">
          <div className="flex items-center gap-3 min-w-0"><Table2 className="h-5 w-5 text-foreground-lighter shrink-0" />{current ? <select aria-label="Policy table" value={current.id} onChange={e => setSelectedId(e.target.value)} className="max-w-full bg-surface-100 border border-default rounded px-2 py-1 text-sm font-mono">{tables.map(table => <option key={table.id} value={table.id}>{table.schema}.{table.name}</option>)}</select> : <span className="font-medium text-foreground">{loading ? 'Loading tables…' : 'No table selected'}</span>}</div>
          <div className="flex items-center gap-2"><Button variant="default" size="small" disabled title="RLS state is not returned by the live catalog API.">RLS state unavailable</Button><Button variant="default" size="small" disabled title="Policy listing and mutation endpoints are not available.">Create policy</Button></div>
        </div>
        <div className="p-4 border-b border-default text-sm text-foreground-lighter bg-studio flex items-start gap-2.5"><LockKeyhole className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" /><span>The live catalog does not return RLS state or policy definitions. These actions are read-only and no policy records are fabricated.</span></div>
        <div className="p-4 text-sm text-foreground-lighter bg-studio">{current ? <>Policy definitions for <code className="font-mono text-foreground">{current.schema}.{current.name}</code> are not available from this deployment.</> : loading ? 'Reading the live database catalog…' : catalog?.nodes.length ? 'No tables match this search.' : 'No tables are present in the live catalog.'}</div>
        {current && <div className="border-t border-default p-4">
          <div className="flex items-center justify-between mb-3"><div><h2 className="text-sm font-medium text-foreground flex items-center gap-2"><Shield className="h-4 w-4 text-foreground-lighter" />Live table columns</h2><p className="mt-1 text-xs text-foreground-lighter">{current.columns.length} catalog columns · {database}</p></div></div>
          <div className="overflow-x-auto border border-default rounded-md"><table className="w-full text-left text-xs"><thead className="bg-surface-200/60 text-[10px] uppercase tracking-wider text-foreground-lighter"><tr><th className="px-3 py-2.5 font-medium">Column</th><th className="px-3 py-2.5 font-medium">Type</th><th className="px-3 py-2.5 font-medium">Attributes</th><th className="px-3 py-2.5 font-medium">Default</th></tr></thead><tbody className="divide-y divide-default">{current.columns.map(column => <tr key={column.name} className="hover:bg-surface-100"><td className="px-3 py-2.5 font-mono">{column.name}</td><td className="px-3 py-2.5 font-mono text-foreground-lighter">{column.type}</td><td className="px-3 py-2.5 text-foreground-lighter">{current.primaryKey.includes(column.name) ? 'PRIMARY KEY · ' : ''}{column.nullable ? 'nullable' : 'NOT NULL'}</td><td className="px-3 py-2.5 font-mono text-foreground-lighter">{column.default || '—'}</td></tr>)}</tbody></table></div>
        </div>}
      </section>
    </div>
  </div>
}
