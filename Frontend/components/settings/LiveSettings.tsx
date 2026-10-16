'use client'

import React, { useEffect, useState } from 'react'
import { BookOpen, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, AdminSettings, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useTheme } from '@/components/providers/ThemeProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'

export function LiveSettings() {
  const { settings, database, reload } = useStudio()
  const { setTheme } = useTheme()
  const { notify } = useNotifications()
  const [values, setValues] = useState<AdminSettings>(settings || { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (settings) setValues(settings) }, [settings])
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      await api('/settings', { method: 'PATCH', body: values })
      await reload()
      setTheme(values.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : values.theme)
      setSaved(true)
      notify('Settings saved')
    } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="max-w-4xl mx-auto p-12">
      <div className="mb-10">
        <h1 className="text-2xl font-medium text-foreground mb-1">Database Settings</h1>
        <p className="text-foreground-lighter">Connections, security, and network configuration</p>
      </div>
      <div className="space-y-12">
        {/* Original database-password section. The control remains visible but cannot claim a reset. */}
        <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-foreground mb-1">Database password</h2><p className="text-sm text-foreground-lighter">Used for direct Postgres connections</p></div>
          <div className="border border-default bg-studio rounded-xl overflow-hidden">
            <div className="p-6 flex items-center justify-between gap-5">
              <div><h3 className="text-sm font-medium text-foreground mb-1">Reset database password</h3><p className="text-sm text-foreground-lighter">Use Connect to view connection details and reveal the current password. Password rotation is not available through the connected admin API.</p></div>
              <Button variant="default" disabled title="The connected API has no password-reset action.">Unavailable</Button>
            </div>
          </div>
        </section>

        {/* Original pooler configuration form, with truthful unavailable server values. */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-3"><h2 className="text-xl font-medium text-foreground">Connection pooling</h2><Button variant="default" size="small" disabled title="No documentation URL is configured." iconLeft={<BookOpen className="h-4 w-4" />}>Docs unavailable</Button></div>
          <div className="border border-default bg-studio rounded-xl overflow-hidden">
            <div className="p-6 border-b border-default flex items-center justify-between gap-5">
              <div><h3 className="text-sm font-medium text-foreground mb-1">Connection poolers</h3><p className="text-sm text-foreground-lighter">Configuration is shared across all connection poolers. The deployment does not expose pooler settings to Studio.</p></div>
              <span className="px-2 py-0.5 rounded-full border border-default text-[10px] font-bold text-foreground-muted tracking-wider uppercase">Shared</span>
            </div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row gap-5 sm:gap-8">
              <div className="flex-1"><h3 className="text-sm font-medium text-foreground mb-1">Connection pool size</h3><p className="text-sm text-foreground-lighter">The maximum number of connections made to the underlying Postgres database, per user and database combination.</p></div>
              <div className="w-full sm:w-64"><Input aria-label="Connection pool size" value="Not exposed" disabled className="pr-24" /><p className="mt-1 text-xs text-foreground-muted">Pool size is server-managed.</p></div>
            </div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row gap-5 sm:gap-8">
              <div className="flex-1"><h3 className="text-sm font-medium text-foreground mb-1">Max client connections</h3><p className="text-sm text-foreground-lighter">The maximum number of concurrent client connections allowed. This value is managed by the deployment.</p></div>
              <div className="w-full sm:w-64"><Input aria-label="Max client connections" value="Not exposed" disabled className="pr-16" /></div>
            </div>
            <div className="p-4 flex items-center justify-end gap-2 bg-studio"><Button variant="default" disabled>Cancel</Button><Button variant="primary" disabled>Save</Button></div>
          </div>
        </section>

        {/* Original danger-zone placement, with destructive controls accurately unavailable. */}
        <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-red-500 mb-1">Danger Zone</h2><p className="text-sm text-foreground-lighter">Destructive actions for this database</p></div>
          <div className="border border-red-500/30 bg-red-500/5 rounded-xl overflow-hidden">
            <div className="p-6 flex items-center justify-between gap-5"><div><h3 className="text-sm font-medium text-foreground mb-1">Delete database</h3><p className="text-sm text-foreground-lighter">Permanently deleting this database is not supported by the connected admin API.</p></div><Button variant="default" disabled className="bg-red-500/20 text-foreground-muted border-none" title="No database-deletion endpoint is available.">Unavailable</Button></div>
          </div>
        </section>

        {/* Live Studio preferences are provided by the existing settings API. */}
        <section>
          <div className="mb-4"><h2 className="text-xl font-medium text-foreground mb-1">Studio preferences</h2><p className="text-sm text-foreground-lighter">Settings saved by this admin deployment.</p></div>
          <form onSubmit={save} className="border border-default bg-studio rounded-xl overflow-hidden">
            <div className="p-6 border-b border-default flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><h3 className="text-sm font-medium text-foreground mb-1">Project name</h3><p className="text-sm text-foreground-lighter">Name shown in the Studio header and project overview.</p></div><Input aria-label="Project name" required maxLength={100} value={values.projectName} onChange={e => { setSaved(false); setValues(v => ({ ...v, projectName: e.target.value })) }} className="w-full sm:w-64" /></div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><h3 className="text-sm font-medium text-foreground mb-1">Default rows per page</h3><p className="text-sm text-foreground-lighter">Initial table-editor page size, up to 1,000 rows.</p></div><Input aria-label="Default rows per page" type="number" min={1} max={1000} required value={values.defaultRowLimit} onChange={e => { setSaved(false); setValues(v => ({ ...v, defaultRowLimit: Number(e.target.value) })) }} className="w-full sm:w-64" /></div>
            <div className="p-6 border-b border-default flex flex-col sm:flex-row sm:items-center justify-between gap-5"><div><h3 className="text-sm font-medium text-foreground mb-1">Appearance</h3><p className="text-sm text-foreground-lighter">Set a fixed theme or follow the operating system.</p></div><select aria-label="Theme" value={values.theme} onChange={e => { setSaved(false); setValues(v => ({ ...v, theme: e.target.value as AdminSettings['theme'] })) }} className="w-full sm:w-64 bg-surface-100 border border-strong rounded-md px-3 py-2 text-sm"><option value="system">System default</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
            <div className="p-4 flex flex-wrap items-center justify-between gap-3 bg-studio">{error && <p role="alert" className="text-red-400 text-sm">{error}</p>}{saved && <p role="status" className="text-brand-500 text-sm">Settings saved.</p>}<Button type="submit" variant="primary" disabled={busy} iconLeft={<Save className="h-3.5 w-3.5" />}>{busy ? 'Saving…' : 'Save preferences'}</Button></div>
          </form>
        </section>
        <div className="border-t border-default pt-5 text-xs text-foreground-muted">Active database: <code className="font-mono text-foreground-light">{database}</code>. Passwords and network secrets remain server-managed.</div>
      </div>
    </div>
  )
}
