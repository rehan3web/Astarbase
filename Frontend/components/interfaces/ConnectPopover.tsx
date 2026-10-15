'use client'

import React, { useState } from 'react'
import { Check, Copy, Database, Plug, Server } from 'lucide-react'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function ConnectPopover() {
  const { notify } = useNotifications()
  const { database, branch } = useStudio()
  const [copied, setCopied] = useState(false)
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(`Database: ${database}\nDirect port: POSTGRES_PUBLIC_PORT (Backend/.env)\nPooler port: PGBOUNCER_PUBLIC_PORT (Backend/.env)\nHost: Docker host configured for this deployment\nCredentials: configured database role; not available in Studio`)
      setCopied(true); window.setTimeout(() => setCopied(false), 1800)
      notify('Connection details copied')
    } catch (error) { setCopied(false); notify(error instanceof Error ? error.message : 'Could not copy connection details', 'error') }
  }
  return <Dialog>
    <DialogTrigger asChild><Button variant="primary" size="small" iconLeft={<Plug className="h-3.5 w-3.5 rotate-90" />} className="gap-1.5 font-medium shadow-xs rounded-full px-3 ml-3"><span>Connect</span></Button></DialogTrigger>
    <DialogContent className="sm:max-w-2xl bg-surface-100 border-overlay">
      <DialogHeader><div className="flex items-center gap-2"><DialogTitle className="flex items-center gap-2"><Database className="h-4 w-4" />Connect to {database}</DialogTitle>{branch && <Badge variant="brand">Active branch · {branch.name}</Badge>}</div><DialogDescription>Connection routes depend on the Docker host and public ports configured by the deployment. Studio does not expose or store database passwords.</DialogDescription></DialogHeader>
      <Tabs defaultValue="uri" className="w-full">
        <TabsList className="px-0"><TabsTrigger value="uri">Connection String (URI)</TabsTrigger><TabsTrigger value="pooler">Transaction Pooler</TabsTrigger><TabsTrigger value="psql">PSQL</TabsTrigger><TabsTrigger value="parameters">Parameters</TabsTrigger></TabsList>
        <TabsContent value="uri" className="space-y-4 pt-3">
          <div className="space-y-1.5"><label className="text-xs font-medium text-foreground-light">Direct Connection</label><div className="rounded-md border border-strong bg-surface-200 px-3 py-2 text-xs text-foreground-lighter">Connection string unavailable. The current admin API does not return the deployment hostname, resolved public port, or credentials.</div><p className="text-[11px] text-foreground-lighter">Database: <span className="font-mono text-foreground">{database}</span> · Port setting: <code>POSTGRES_PUBLIC_PORT</code></p></div>
        </TabsContent>
        <TabsContent value="pooler" className="space-y-4 pt-3">
          <div className="space-y-1.5"><label className="text-xs font-medium text-foreground-light">Session / Transaction Pooler</label><div className="rounded-md border border-strong bg-surface-200 px-3 py-2 text-xs text-foreground-lighter">Pooler URI unavailable. No sample host, port, username, or password is shown in place of deployment values.</div><p className="text-[11px] text-foreground-lighter">Database: <span className="font-mono text-foreground">{database}</span> · Port setting: <code>PGBOUNCER_PUBLIC_PORT</code></p></div>
        </TabsContent>
        <TabsContent value="psql" className="space-y-4 pt-3">
          <div className="space-y-1.5"><label className="text-xs font-medium text-foreground-light">CLI Terminal Command</label><div className="rounded-md border border-strong bg-surface-200 px-3 py-2 text-xs text-foreground-lighter">A complete command cannot be generated until this deployment exposes its host, resolved port, and connection role.</div></div>
        </TabsContent>
        <TabsContent value="parameters" className="pt-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[['Host','Deployment Docker host'],['Direct port','POSTGRES_PUBLIC_PORT'],['Pooler port','PGBOUNCER_PUBLIC_PORT'],['Database',database],['Branch',branch?.name || '—'],['Credentials','Server-managed']].map(([label,value]) => <div key={label} className="p-3 rounded bg-surface-200 border border-strong"><div className="text-foreground-lighter text-[11px]">{label}</div><div className="font-mono text-foreground mt-1 truncate">{value}</div></div>)}
          </div>
          <p className="mt-3 text-[11px] text-foreground-lighter">The frontend API does not return resolved public host / port values, so this panel shows the authoritative environment setting names instead of example connection strings.</p>
        </TabsContent>
      </Tabs>
      <div className="flex justify-end pt-1"><Button size="small" variant="default" iconLeft={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={() => void copyDetails()}>{copied ? 'Copied details' : 'Copy connection details'}</Button></div>
    </DialogContent>
  </Dialog>
}
