'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clipboard, Eye, EyeOff, Plug, RotateCw } from 'lucide-react'
import { useStudio } from '@/components/providers/StudioProvider'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { ConnectionMetadata, ConnectionMode, formatConnection } from '@/lib/connection-details'

type Tab = { id: ConnectionMode; label: string }
const tabs: Tab[] = [
  { id: 'connection-string', label: 'Connection String' },
  { id: 'transaction-pooler', label: 'Transaction Pooler' },
  { id: 'psql', label: 'PSQL' },
  { id: 'parameters', label: 'Parameters' },
]
type RevealState = { database: string; password: string }

function isConnectionMetadata(value: unknown): value is ConnectionMetadata {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.database === 'string'
    && typeof item.user === 'string'
    && (typeof item.host === 'string' || item.host === null)
    && typeof item.directPort === 'number'
    && Number.isInteger(item.directPort)
    && typeof item.poolerPort === 'number'
    && Number.isInteger(item.poolerPort)
    && item.sslMode === 'disable'
}

export function ConnectDbView() {
  const { database, branch } = useStudio()
  const { notify } = useNotifications()
  const [tab, setTab] = useState<ConnectionMode>('connection-string')
  const [metadata, setMetadata] = useState<ConnectionMetadata | null>(null)
  const [metadataFor, setMetadataFor] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reveal, setReveal] = useState<RevealState | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState(false)
  const revealSequence = useRef(0)
  const revealController = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)

  const loadMetadata = useCallback(async () => {
    const requestId = ++requestSequence.current
    revealSequence.current += 1
    revealController.current?.abort()
    setRevealing(false)
    setLoading(true)
    setLoadError(false)
    setMetadata(null)
    setMetadataFor(null)
    setReveal(null)
    setRevealError(false)
    const controller = new AbortController()
    try {
      const result = await api<ConnectionMetadata>(`/databases/${encodeURIComponent(database)}/connection`, {
        signal: controller.signal,
      })
      if (requestId !== requestSequence.current) return
      if (!isConnectionMetadata(result) || result.database !== database) throw new Error('Invalid connection metadata')
      setMetadata(result)
      setMetadataFor(database)
    } catch {
      if (requestId === requestSequence.current) setLoadError(true)
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [database])

  useEffect(() => {
    void loadMetadata()
    return () => {
      requestSequence.current += 1
      revealSequence.current += 1
      revealController.current?.abort()
    }
  }, [loadMetadata])

  const activeMetadata = metadataFor === database ? metadata : null
  const resolvedHost = useMemo(() => {
    if (!activeMetadata) return null
    if (activeMetadata.host !== null) return activeMetadata.host.trim() || null
    if (typeof window === 'undefined') return null
    return window.location.hostname.trim() || null
  }, [activeMetadata])
  const hostFallback = Boolean(activeMetadata && activeMetadata.host === null && resolvedHost)
  const hostUsable = Boolean(resolvedHost && !/\s/.test(resolvedHost))
  const activePassword = reveal?.database === database ? reveal.password : null
  const formatted = activeMetadata && resolvedHost && hostUsable
    ? formatConnection({ ...activeMetadata, host: resolvedHost }, activePassword, tab)
    : ''

  const clearPassword = useCallback(() => {
    revealSequence.current += 1
    revealController.current?.abort()
    revealController.current = null
    setReveal(null)
    setRevealing(false)
    setRevealError(false)
  }, [])

  const selectTab = (next: ConnectionMode) => {
    if (next === tab) return
    clearPassword()
    setTab(next)
  }

  const revealPassword = async () => {
    if (!activeMetadata || revealing || activePassword !== null) return
    const sequence = ++revealSequence.current
    const controller = new AbortController()
    revealController.current?.abort()
    revealController.current = controller
    setRevealError(false)
    setRevealing(true)
    try {
      const result = await api<{ password: string }>(
        `/databases/${encodeURIComponent(database)}/connection/reveal`,
        { method: 'POST', body: {}, signal: controller.signal },
      )
      if (sequence !== revealSequence.current || controller.signal.aborted) return
      if (typeof result.password !== 'string') throw new Error('Invalid password response')
      setReveal({ database, password: result.password })
    } catch {
      if (sequence === revealSequence.current && !controller.signal.aborted) {
        setRevealError(true)
        notify('Could not reveal the database password. Try again.', 'error')
      }
    } finally {
      if (sequence === revealSequence.current) setRevealing(false)
    }
  }

  const copyDisplayed = async () => {
    if (!formatted) return
    try {
      await navigator.clipboard.writeText(formatted)
      if (activePassword === null) {
        notify('Copied the displayed text. Reveal the password before using this connection.', 'warning')
      } else {
        notify('Connection details copied', 'success')
      }
    } catch {
      notify('Could not copy connection details. Check clipboard permissions and try again.', 'error')
    }
  }

  const masked = activePassword === null
  const branchName = branch?.name || 'Default branch'

  return (
    <div className="flex-1 overflow-y-auto bg-studio p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-default pb-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground">
              <Plug className="h-5 w-5 text-foreground-lighter" />
              ConnectDb
            </h1>
            <p className="mt-1 text-sm text-foreground-lighter">
              Connection details for <span className="font-mono text-foreground-light">{database}</span>
              <span className="mx-1.5 text-foreground-muted">·</span>{branchName}
            </p>
          </div>
        </div>

        {loading ? (
          <section aria-label="Loading connection details" className="overflow-hidden rounded-lg border border-default">
            <div className="h-11 animate-pulse border-b border-default bg-surface-200/60" />
            <div className="space-y-4 p-5">
              <div className="h-4 w-44 animate-pulse rounded bg-surface-300" />
              <div className="h-24 animate-pulse rounded-md border border-default bg-surface-200" />
              <div className="h-8 w-32 animate-pulse rounded bg-surface-300" />
            </div>
          </section>
        ) : loadError || !activeMetadata ? (
          <section className="rounded-lg border border-default bg-studio p-6">
            <p className="text-sm font-medium text-foreground">Connection details are unavailable</p>
            <p className="mt-1 max-w-2xl text-sm text-foreground-lighter">
              The admin API could not provide connection metadata for this database. Check the backend connection, then retry.
            </p>
            <Button className="mt-4" size="small" onClick={() => void loadMetadata()} iconLeft={<RotateCw className="h-3.5 w-3.5" />}>
              Retry
            </Button>
          </section>
        ) : !hostUsable ? (
          <section role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-sm font-medium text-foreground">A usable database host is not available</p>
            <p className="mt-1 text-sm text-foreground-lighter">
              Configure DATABASE_PUBLIC_HOST or open Studio at a browser address with a hostname so connection details can be generated.
            </p>
            <Button className="mt-4" size="small" variant="default" onClick={() => void loadMetadata()} iconLeft={<RotateCw className="h-3.5 w-3.5" />}>
              Retry
            </Button>
          </section>
        ) : (
          <section className="overflow-hidden rounded-lg border border-default">
            <div role="tablist" aria-label="Connection method" className="flex overflow-x-auto border-b border-default bg-surface-200/60">
              {tabs.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => selectTab(item.id)}
                  className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                    tab === item.id
                      ? 'border-brand-500 text-foreground'
                      : 'border-transparent text-foreground-lighter hover:bg-surface-200 hover:text-foreground'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-5 p-4 sm:p-6">
              {hostFallback && (
                <div className="rounded-md border border-default bg-surface-200/60 px-3 py-2 text-xs text-foreground-lighter">
                  Using this browser’s host (<span className="font-mono text-foreground">{resolvedHost}</span>) because DATABASE_PUBLIC_HOST was not provided.
                </div>
              )}
              {tab === 'transaction-pooler' && (
                <div className="rounded-md border border-default bg-surface-200/60 px-3 py-2.5 text-xs leading-relaxed text-foreground-lighter">
                  Transaction pooler uses port <span className="font-mono text-foreground">{activeMetadata.poolerPort}</span>. Transaction pooling may not support prepared statements or other session-level features; use a direct connection when your client requires them.
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="connection-editor" className="text-xs font-medium text-foreground-light">
                  {tab === 'connection-string' && 'Direct connection string'}
                  {tab === 'transaction-pooler' && 'Transaction pooler connection string'}
                  {tab === 'psql' && 'PSQL command'}
                  {tab === 'parameters' && 'Environment variables'}
                </label>
                <textarea
                  id="connection-editor"
                  aria-label="Connection details"
                  readOnly
                  spellCheck={false}
                  value={formatted}
                  rows={tab === 'parameters' ? 6 : 2}
                  className="block w-full resize-y rounded-md border border-strong bg-surface-200 px-3 py-3 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-1 focus-visible:ring-strong"
                />
                <p className="text-[11px] text-foreground-muted">
                  {tab === 'transaction-pooler'
                    ? `Database ${activeMetadata.database} · Pooler port ${activeMetadata.poolerPort}`
                    : `Database ${activeMetadata.database} · Direct port ${activeMetadata.directPort}`}
                  {' · '}SSL mode: {activeMetadata.sslMode}
                </p>
                <p className="text-[11px] text-foreground-muted">
                  The default Docker setup does not enable TLS. Use a trusted network or secure tunnel.
                  {tab === 'parameters' && ' These are shell-compatible environment assignments.'}
                </p>
              </div>

              <div className="flex flex-col gap-3 border-t border-default pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <label htmlFor="connection-password" className="text-xs font-medium text-foreground-light">Database password</label>
                  <div className="flex gap-2">
                    <input
                      id="connection-password"
                      readOnly
                      type={masked ? 'password' : 'text'}
                      value={masked ? '••••••••••••••••' : (activePassword ?? '')}
                      aria-label="Database password"
                      className="h-9 min-w-0 flex-1 rounded-md border border-strong bg-surface-200 px-3 font-mono text-xs text-foreground outline-none"
                    />
                    {masked ? (
                      <Button size="small" variant="default" loading={revealing} onClick={() => void revealPassword()} iconLeft={<Eye className="h-3.5 w-3.5" />}>
                        Show password
                      </Button>
                    ) : (
                      <Button size="small" variant="default" onClick={clearPassword} iconLeft={<EyeOff className="h-3.5 w-3.5" />}>
                        Hide password
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground-muted">The password is requested only when you choose to show it.</p>
                  {revealError && <p role="alert" className="text-xs text-red-400">Password reveal failed. Your connection details remain masked; try again.</p>}
                </div>
                <Button
                  size="small"
                  variant="default"
                  onClick={() => void copyDisplayed()}
                  iconLeft={masked ? <Clipboard className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                >
                  Copy displayed text
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
