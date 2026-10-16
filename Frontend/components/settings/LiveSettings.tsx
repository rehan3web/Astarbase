'use client'

import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'

type PoolSettings = { poolSize: number; maxClientConnections: number }

// Scope state to the selected database: a late response must never affect another branch.
export function LiveSettings() {
  const { database, branch } = useStudio()
  return <DatabaseSettings key={database} database={database} main={branch?.parent_name === null} />
}

function DatabaseSettings({ database, main }: { database: string; main: boolean }) {
  const { notify } = useNotifications()
  const [pool, setPool] = useState<PoolSettings | null>(null)
  const [poolSize, setPoolSize] = useState('20')
  const [poolError, setPoolError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)
  const path = `/databases/${encodeURIComponent(database)}/connection`

  useEffect(() => {
    if (!main) return
    const controller = new AbortController()
    api<PoolSettings>(`${path}/pool`, { signal: controller.signal })
      .then(value => { setPool(value); setPoolSize(String(value.poolSize)) })
      .catch(error => { if (!controller.signal.aborted) setPoolError(errorMessage(error)) })
    return () => controller.abort()
  }, [main, path])

  async function savePool(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setPoolError('')
    try {
      const value = await api<PoolSettings>(`${path}/pool`, { method: 'PATCH', body: { poolSize: Number(poolSize) } })
      setPool(value); setPoolSize(String(value.poolSize))
      notify('Connection pool size saved')
    } catch (error) { setPoolError(errorMessage(error)); notify(errorMessage(error), 'error') }
    finally { setSaving(false) }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault()
    if (confirmation !== database) return
    setResetting(true); setResetError('')
    try {
      await api(`${path}/reset`, { method: 'POST', body: { confirmDatabase: confirmation } })
      setResetOpen(false); setConfirmation('')
      // Any open connection view must discard its previously revealed password.
      window.dispatchEvent(new CustomEvent('studio-credentials-changed', { detail: database }))
      notify('Database password reset. Use Connect to reveal the new password.')
    } catch (error) { setResetError(errorMessage(error)); notify(errorMessage(error), 'error') }
    finally { setResetting(false) }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 sm:p-12">
      <div className="mb-10">
        <h1 className="text-2xl font-medium text-foreground mb-1">Database Settings</h1>
        <p className="text-foreground-lighter">Connections, security, and network configuration</p>
      </div>
      <div className="space-y-12">
        <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-foreground mb-1">Database password</h2><p className="text-sm text-foreground-lighter">Used for direct Postgres and pooled connections to this database</p></div>
          <div className="border border-default bg-studio rounded-xl overflow-hidden">
            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <div><h3 className="text-sm font-medium text-foreground mb-1">Reset database password</h3><p className="text-sm text-foreground-lighter">Generate a random password for <code>{database}</code> only. Other branches and the internal admin connection are not changed. View the new password in Connect.</p></div>
              <Button variant="default" onClick={() => { setResetError(''); setConfirmation(''); setResetOpen(true) }}>Reset database password</Button>
            </div>
          </div>
        </section>

        {main && <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-foreground">Connection pooling</h2></div>
          <form onSubmit={savePool} className="border border-default bg-studio rounded-xl overflow-hidden">
            <div className="p-6 border-b border-default flex items-center justify-between gap-5">
              <div><h3 className="text-sm font-medium text-foreground mb-1">Connection poolers</h3><p className="text-sm text-foreground-lighter">Shared PgBouncer configuration. Manage it here on main; changes apply to all branches.</p></div>
              <span className="px-2 py-0.5 rounded-full border border-default text-[10px] font-bold text-foreground-muted tracking-wider uppercase">Shared</span>
            </div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row gap-5 sm:gap-8">
              <div className="flex-1"><h3 className="text-sm font-medium text-foreground mb-1">Connection pool size</h3><p className="text-sm text-foreground-lighter">Server connections per user and database pair, from 1 to 80. Total usage also depends on Postgres capacity.</p></div>
              <div className="w-full sm:w-64"><Input aria-label="Connection pool size" type="number" min={1} max={80} required disabled={!pool || saving} value={pool ? poolSize : ''} placeholder="Loading…" onChange={event => setPoolSize(event.target.value)} /><p className="mt-1 text-xs text-foreground-muted">Applied dynamically without restarting the database.</p></div>
            </div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row gap-5 sm:gap-8">
              <div className="flex-1"><h3 className="text-sm font-medium text-foreground mb-1">Max client connections</h3><p className="text-sm text-foreground-lighter">Fixed limit across the entire PgBouncer instance, including all branches.</p></div>
              <div className="w-full sm:w-64"><Input aria-label="Max client connections" value="200" disabled readOnly /></div>
            </div>
            {poolError && <p role="alert" className="px-6 pt-4 text-sm text-red-400">{poolError}</p>}
            <div className="p-4 flex items-center justify-end gap-2 bg-studio">
              <Button variant="default" type="button" disabled={!pool || saving} onClick={() => setPoolSize(String(pool!.poolSize))}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={!pool || saving || Number(poolSize) === pool.poolSize}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </section>}

        <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-red-500 mb-1">Danger Zone</h2><p className="text-sm text-foreground-lighter">Destructive actions for this database</p></div>
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl overflow-hidden">
            <div className="p-6 flex items-center justify-between gap-5"><div><h3 className="text-sm font-medium text-foreground mb-1">Delete database</h3><p className="text-sm text-foreground-lighter">Permanently deleting this database is not supported by the connected admin API.</p></div><Button variant="default" disabled className="bg-red-500/20 text-foreground-muted border-none" title="No database-deletion endpoint is available.">Unavailable</Button></div>
          </div>
        </section>
      </div>
      <Dialog open={resetOpen} onOpenChange={open => { if (!resetting) setResetOpen(open) }}>
        <DialogContent>
          <form onSubmit={resetPassword} className="space-y-5">
            <DialogHeader><DialogTitle>Reset database password</DialogTitle><DialogDescription>New direct and pooled connections will need the new password. Existing sessions may remain connected. No data is deleted, and no other database password changes.</DialogDescription></DialogHeader>
            <label className="block text-sm text-foreground">Type <code>{database}</code> to confirm
              <Input aria-label="Confirm database name" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={resetting} className="mt-2" />
            </label>
            {resetError && <p role="alert" className="text-sm text-red-400">{resetError}</p>}
            <DialogFooter><Button type="button" variant="default" disabled={resetting} onClick={() => setResetOpen(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={resetting || confirmation !== database}>{resetting ? 'Resetting…' : 'Reset password'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
