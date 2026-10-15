'use client'
import React, { useState } from 'react'
import { api, AdminSettings, errorMessage } from '@/lib/api'
import { useStudio } from '@/components/providers/StudioProvider'
import { useTheme } from '@/components/providers/ThemeProvider'

export function LiveSettings() {
  const { settings, reload } = useStudio()
  const { setTheme } = useTheme()
  const [values, setValues] = useState<AdminSettings>(settings || { projectName: 'Astarbase', defaultRowLimit: 100, theme: 'system' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      await api('/settings', { method: 'PATCH', body: values })
      await reload()
      setTheme(values.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : values.theme)
      setSaved(true)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <div className="p-8 max-w-2xl space-y-6"><h1 className="text-2xl font-semibold">Admin settings</h1><p className="text-sm text-foreground-lighter">Saved in Backend/data/admin.sqlite. Database credentials remain in your server configuration, never in browser storage.</p><form onSubmit={save} className="space-y-5">
    <label className="block text-sm">Project name<input required maxLength={100} className="block mt-2 w-full bg-studio rounded border border-default p-2" value={values.projectName} onChange={e => { setSaved(false); setValues({ ...values, projectName: e.target.value }) }} /></label>
    <label className="block text-sm">Default rows per page<input type="number" min={1} max={1000} required className="block mt-2 w-full bg-studio rounded border border-default p-2" value={values.defaultRowLimit} onChange={e => { setSaved(false); setValues({ ...values, defaultRowLimit: Number(e.target.value) }) }} /></label>
    <label className="block text-sm">Theme<select className="block mt-2 w-full bg-studio rounded border border-default p-2" value={values.theme} onChange={e => { setSaved(false); setValues({ ...values, theme: e.target.value as AdminSettings['theme'] }) }}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select></label>
    {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}{saved && <p role="status" className="text-brand-500 text-sm">Settings saved to SQLite.</p>}
    <button disabled={busy} className="bg-brand-500 text-black rounded px-4 py-2 text-sm disabled:opacity-40">{busy ? 'Saving…' : 'Save settings'}</button>
  </form></div>
}
