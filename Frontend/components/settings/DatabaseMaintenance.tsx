'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { useStudio } from '@/components/providers/StudioProvider'
import { api, errorMessage } from '@/lib/api'

type Action = 'reset' | 'terminate'

export function DatabaseMaintenance({ database }: { database: string }) {
  const { notify } = useNotifications()
  const { reload } = useStudio()
  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const title = action === 'reset' ? 'Reset database' : 'Terminate connections'

  function open(next: Action) { setError(''); setAction(next) }
  async function confirm() {
    if (!action || busy) return
    const current = action
    setBusy(true); setError('')
    try {
      const result = await api<{ cleanupWarning?: string | null }>(
        `/databases/${encodeURIComponent(database)}/connection/${current === 'reset' ? 'reset-database' : 'terminate'}`,
        { method: 'POST', body: { confirmDatabase: database } })
      setAction(null)
      notify(current === 'reset' ? `Database "${database}" reset. Schema and data cleared.` :
        `Client connections for "${database}" terminated. Unix admin connections preserved.`)
      if (result.cleanupWarning) notify(result.cleanupWarning, 'error')
      if (current === 'reset') {
        // Reset has already succeeded: a refresh failure must not invite another reset.
        await reload().catch(() => notify('Database reset succeeded, but Studio could not refresh. Reload the page.', 'error'))
      }
    } catch (cause) { setError(errorMessage(cause)); notify(errorMessage(cause), 'error') }
    finally { setBusy(false) }
  }

  return <>
    <section>
      <div className="mb-4"><h2 className="text-xl font-medium text-foreground mb-1">Additional</h2></div>
      <div className="border border-default bg-studio rounded-xl overflow-hidden">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div><h3 className="text-sm font-medium text-foreground mb-1">Terminate connections</h3><p className="text-sm text-foreground-lighter">Disconnect direct and pooled clients for <code>{database}</code> only. Unix admin connections stay connected. Apps may reconnect automatically.</p></div>
          <Button variant="default" onClick={() => open('terminate')}>Terminate connections</Button>
        </div>
      </div>
    </section>
    <section>
      <div className="mb-4"><h2 className="text-xl font-medium text-red-500 mb-1">Danger Zone</h2><p className="text-sm text-foreground-lighter">Destructive actions for this database</p></div>
      <div className="border border-red-500/30 bg-red-500/5 rounded-xl overflow-hidden">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div><h3 className="text-sm font-medium text-foreground mb-1">Reset database</h3><p className="text-sm text-foreground-lighter">Permanently clear all schema and data from <code>{database}</code>. Keep its name, branch, password and saved backups. Other databases are not reset.</p></div>
          <Button variant="default" onClick={() => open('reset')} className="border-red-500/30 text-red-500">Reset database</Button>
        </div>
      </div>
    </section>
    <Dialog open={action !== null} onOpenChange={isOpen => { if (!isOpen && !busy) { setAction(null); setError('') } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>This action applies only to <code>{database}</code>, not its parent, children or other branches.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex gap-3">
            <div className="shrink-0 mt-0.5 h-5 w-5 bg-amber-500 rounded flex items-center justify-center"><AlertTriangle className="h-3.5 w-3.5 text-white" /></div>
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1">{action === 'reset' ? 'All schema and data in this database will be deleted' : 'Active client connections will be disconnected'}</h4>
              <p className="text-sm text-foreground-lighter leading-relaxed">{action === 'reset' ?
                'This cannot be undone without a saved backup. The database will be recreated empty, including removal of custom schemas, tables, functions and extensions. Existing sessions to this database must reconnect. Its client password and saved backups will not change.' :
                'Direct Postgres clients and PgBouncer clients for this database will be disconnected. Active client transactions will be rolled back. Unix admin connections and connections to other databases will not be terminated. Apps can reconnect using their existing credentials.'}</p>
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="default" disabled={busy} onClick={() => { setAction(null); setError('') }}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={busy} onClick={() => void confirm()} className={action === 'reset' ? 'bg-red-600 hover:bg-red-700 text-white' : undefined}>{title}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
