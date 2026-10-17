'use client'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, Branch, AdminSettings, errorMessage } from '@/lib/api'
import { useTheme } from './ThemeProvider'
import { useNotifications } from './NotificationProvider'

type Studio = { branches: Branch[]; database: string; branch: Branch | undefined; settings: AdminSettings | null; selectBranch: (name: string) => void; reload: () => Promise<void> }
const Context = createContext<Studio | null>(null)
export const useStudio = () => {
  const value = useContext(Context)
  if (!value) throw new Error('StudioProvider is required')
  return value
}
export function StudioProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme()
  const { notify } = useNotifications()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [configured, setConfigured] = useState(true)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [selected, setSelected] = useState('main')
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const reload = useCallback(async () => {
    const [list, preferences] = await Promise.all([api<Branch[]>('/branches'), api<AdminSettings>('/settings')])
    setBranches(list); setSettings(preferences); setError('')
    setSelected(current => list.some(b => b.name === current) ? current : 'main')
  }, [])
  useEffect(() => {
    fetch('/api/session', { cache: 'no-store' }).then(r => r.json()).then(r => {
      setConfigured(r.configured); setAuthenticated(r.authenticated)
      const saved = localStorage.getItem('sorabase_selected_branch')
      if (saved) {
        setSelected(saved)
        localStorage.setItem('sorabase_selected_branch', saved)
      }
    }).catch(() => { setError('Unable to check Studio session'); setAuthenticated(false) })
    const expire = () => { setAuthenticated(false); setBranches([]) }
    window.addEventListener('studio-session-expired', expire)
    return () => window.removeEventListener('studio-session-expired', expire)
  }, [])
  useEffect(() => { if (authenticated) reload().catch(e => setError(errorMessage(e))) }, [authenticated, reload])
  useEffect(() => {
    if (settings) setTheme(settings.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' : settings.theme)
  }, [settings?.theme, setTheme])
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const res = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setPassword(''); setAuthenticated(true)
      notify('Signed in successfully')
    } catch (e) { const message = errorMessage(e); setError(message); notify(message, 'error') } finally { setBusy(false) }
  }
  const branch = branches.find(b => b.name === selected)
  if (authenticated === null) return <div className="h-screen grid place-items-center bg-studio text-foreground-lighter">Checking Studio session…</div>
  if (!authenticated) return (
    <div className="h-screen grid place-items-center bg-studio p-6">
      <form onSubmit={login} className="w-full max-w-md rounded-lg border border-default p-8 space-y-5 bg-dash-sidebar">
        <h1 className="text-xl font-semibold">Sorabase Admin Studio</h1>
        <p className="text-sm text-foreground-lighter">Sign in with your admin username or email and password.</p>
        {!configured && <p role="alert" className="text-amber-500 text-sm">Admin login needs server-side setup.</p>}
        <label className="block text-sm">Username or email<input type="text" autoComplete="username" placeholder="Enter your username or email" required maxLength={254} value={identifier} onChange={e => setIdentifier(e.target.value)} className="mt-2 w-full rounded border border-default bg-studio p-2" /></label>
        <label className="block text-sm">Password<input type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded border border-default bg-studio p-2" /></label>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button disabled={busy || !configured} className="w-full rounded bg-brand-500 text-black p-2 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
  if (!branch) return <div className="h-screen grid place-items-center bg-studio"><div className="max-w-xl space-y-4 p-6"><h1 className="text-xl">Connecting to backend</h1><p role="alert" className="text-foreground-lighter">{error || 'Loading live databases…'}</p><button className="border border-default rounded px-4 py-2" onClick={() => reload().catch(e => setError(errorMessage(e)))}>Retry connection</button></div></div>
  return <Context.Provider value={{ branches, database: branch.database_name, branch, settings, reload, selectBranch(name) { setSelected(name); localStorage.setItem('sorabase_selected_branch', name) } }}>{children}</Context.Provider>
}
