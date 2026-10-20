'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, Branch, AdminSettings, errorMessage } from '@/lib/api'
import { useTheme } from './ThemeProvider'
import { useNotifications } from './NotificationProvider'
import { LoadingIndicator } from '@/components/ui/spinner'
import { StudioLogin } from '@/components/auth/StudioLogin'

type Studio = { branches: Branch[]; database: string; branch: Branch | undefined; settings: AdminSettings | null; branchesLoading: boolean; selectBranch: (name: string) => void; reload: () => Promise<void> }
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
  const [branchesLoading, setBranchesLoading] = useState(true)
  const reloadVersion = useRef(0)
  const reloadPending = useRef(0)
  const reload = useCallback(async () => {
    const version = ++reloadVersion.current
    reloadPending.current += 1
    setBranchesLoading(true)
    setError('')
    try {
      const [list, preferences] = await Promise.all([api<Branch[]>('/branches'), api<AdminSettings>('/settings')])
      if (version === reloadVersion.current) {
        setBranches(list); setSettings(preferences); setError('')
        setSelected(current => list.some(b => b.name === current) ? current : 'main')
      }
    } catch (cause) {
      if (version === reloadVersion.current) throw cause
    } finally {
      reloadPending.current = Math.max(0, reloadPending.current - 1)
      if (reloadPending.current === 0) setBranchesLoading(false)
    }
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
  if (authenticated === null) return <LoadingIndicator label="Checking Studio session" className="min-h-[100dvh] bg-studio" size={28} />
  if (!authenticated) return (
    <StudioLogin
      identifier={identifier}
      password={password}
      error={error}
      busy={busy}
      configured={configured}
      onIdentifierChange={setIdentifier}
      onPasswordChange={setPassword}
      onSubmit={login}
    />
  )
  if (!branch) return <div className="grid min-h-[100dvh] place-items-center bg-studio p-6">
    <div className="max-w-xl space-y-4 text-center">
      {branchesLoading && <LoadingIndicator label="Loading live databases" size={28} />}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!branchesLoading && !error && <p className="text-sm text-foreground-lighter">No live databases are available.</p>}
      {!branchesLoading && <button className="rounded border border-default px-4 py-2 text-sm text-foreground-light" onClick={() => reload().catch(e => setError(errorMessage(e)))}>Retry connection</button>}
    </div>
  </div>
  return <Context.Provider value={{ branches, database: branch.database_name, branch, settings, branchesLoading, reload, selectBranch(name) { setSelected(name); localStorage.setItem('sorabase_selected_branch', name) } }}>{children}</Context.Provider>
}
