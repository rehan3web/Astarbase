'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clipboard, Eye, EyeOff, Plug, RotateCw } from 'lucide-react'
import { useStudio } from '@/components/providers/StudioProvider'
import { LoadingIndicator } from '@/components/ui/spinner'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { copyText } from '@/lib/copy-text'
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
  const [copying, setCopying] = useState(false)
  const revealSequence = useRef(0)
  const revealController = useRef<AbortController | null>(null)
  const copySequence = useRef(0)
  const copyController = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)
  const currentIdentity = useRef(`${database}\u0000${tab}`)
  currentIdentity.current = `${database}\u0000${tab}`

  const cancelSensitiveActions = useCallback(() => {
    revealSequence.current += 1
    revealController.current?.abort()
    revealController.current = null
    copySequence.current += 1
    copyController.current?.abort()
    copyController.current = null
    setRevealing(false)
    setCopying(false)
  }, [])

  const loadMetadata = useCallback(async () => {
    cancelSensitiveActions()
    const requestId = ++requestSequence.current
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
  }, [cancelSensitiveActions, database])

  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === database) void loadMetadata()
    }
    window.addEventListener('studio-credentials-changed', changed)
    void loadMetadata()
    return () => {
      window.removeEventListener('studio-credentials-changed', changed)
      requestSequence.current += 1
      revealSequence.current += 1
      revealController.current?.abort()
      copySequence.current += 1
      copyController.current?.abort()
    }
  }, [cancelSensitiveActions, loadMetadata])

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
    cancelSensitiveActions()
    setReveal(null)
    setRevealError(false)
  }, [cancelSensitiveActions])

  const selectTab = (next: ConnectionMode) => {
    if (next === tab) return
    currentIdentity.current = `${database}\u0000${next}`
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
    const identity = `${database}\u0000${tab}`
    const copyId = ++copySequence.current
    const controller = new AbortController()
    copyController.current?.abort()
    copyController.current = controller
    setCopying(true)
    try {
      let textToCopy = formatted
      if (activePassword === null) {
        const result = await api<{ password: string }>(
          `/databases/${encodeURIComponent(database)}/connection/reveal`,
          { method: 'POST', body: {}, signal: controller.signal },
        )
        if (copyId !== copySequence.current || controller.signal.aborted || currentIdentity.current !== identity) return
        if (typeof result.password !== 'string' || !activeMetadata || !resolvedHost) throw new Error('Could not prepare connection details')
        textToCopy = formatConnection({ ...activeMetadata, host: resolvedHost }, result.password, tab)
      }
      if (copyId !== copySequence.current || controller.signal.aborted || currentIdentity.current !== identity) return
      await copyText(textToCopy)
      if (copyId === copySequence.current && currentIdentity.current === identity) notify('Connection details copied', 'success')
    } catch {
      if (copyId === copySequence.current && !controller.signal.aborted && currentIdentity.current === identity) {
        notify('Could not copy connection details. Check access and try again.', 'error')
      }
    } finally {
      if (copyId === copySequence.current) {
        setCopying(false)
        copyController.current = null
      }
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
          <section aria-label="Loading connection details" className="grid min-h-48 place-items-center rounded-lg border border-default">
            <LoadingIndicator label="Loading connection details" size={28} />
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
          <section className="overflow-hidden rounded-lg border border-default bg-white dark:bg-transparent">
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

            <div className="space-y-3 p-4 sm:p-6">
              {(hostFallback || activeMetadata.sslMode === 'disable') && (
                <p className="text-[11px] text-foreground-muted">
                  {hostFallback && <>Using browser host <span className="font-mono text-foreground-lighter">{resolvedHost}</span> because DATABASE_PUBLIC_HOST is unset.</>}
                  {hostFallback && activeMetadata.sslMode === 'disable' && <span className="mx-1.5">·</span>}
                  {activeMetadata.sslMode === 'disable' && 'TLS is disabled for this connection.'}
                </p>
              )}
              {tab === 'transaction-pooler' && (
                <p className="text-[11px] leading-relaxed text-foreground-muted">
                  Transaction pooling may not support prepared statements or session-level features.
                </p>
              )}

              <div data-connection-snippet className="overflow-hidden rounded-md border border-strong bg-white dark:bg-surface-200">
                <textarea
                  id="connection-editor"
                  aria-label="Connection details"
                  readOnly
                  spellCheck={false}
                  value={formatted}
                  rows={tab === 'parameters' ? 6 : 4}
                  className="block min-h-[180px] w-full resize-y border-0 bg-transparent px-4 py-4 font-mono text-xs leading-relaxed text-foreground outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-strong"
                />
                <div className="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2">
                  <Button size="small" variant="ghost" loading={copying} disabled={copying || revealing} onClick={() => void copyDisplayed()} iconLeft={<Clipboard className="h-3.5 w-3.5" />}>
                    Copy snippet
                  </Button>
                  {masked ? (
                    <Button size="small" variant="ghost" loading={revealing} disabled={copying || revealing} onClick={() => void revealPassword()} iconLeft={<Eye className="h-3.5 w-3.5" />}>
                      Show password
                    </Button>
                  ) : (
                    <Button size="small" variant="ghost" disabled={copying} onClick={clearPassword} iconLeft={<EyeOff className="h-3.5 w-3.5" />}>
                      Hide password
                    </Button>
                  )}
                </div>
              </div>
              {revealError && <p role="alert" className="text-xs text-red-400">Password reveal failed. The snippet remains masked; try again.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
