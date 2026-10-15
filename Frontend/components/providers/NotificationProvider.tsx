'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Alert } from '@/components/ui/alert'

export type NotificationVariant = 'success' | 'error' | 'warning'
type Notification = { id: number; message: string; variant: NotificationVariant }
type NotificationContextValue = {
  notify: (message: string, variant?: NotificationVariant) => void
  dismiss: (id: number) => void
}

const NotificationContext = createContext<NotificationContextValue | null>(null)
const timeoutFor = 4500

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const timers = useRef(new Map<number, number>())
  const sequence = useRef(0)

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    setNotifications(current => current.filter(item => item.id !== id))
  }, [])

  const notify = useCallback((message: string, variant: NotificationVariant = 'success') => {
    // Keep rapid actions from filling the screen; old timers must not dismiss
    // a newer notification when the oldest visible alert is replaced.
    if (timers.current.size >= 4) {
      const oldest = timers.current.keys().next().value
      if (oldest !== undefined) dismiss(oldest)
    }
    const id = ++sequence.current
    setNotifications(current => [...current, { id, message, variant }])
    const timer = window.setTimeout(() => dismiss(id), timeoutFor)
    timers.current.set(id, timer)
  }, [dismiss])

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer))
    timers.current.clear()
  }, [])

  const context = React.useMemo(() => ({ notify, dismiss }), [notify, dismiss])
  return (
    <NotificationContext.Provider value={context}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2 pointer-events-none" role="region" aria-label="Notifications" aria-live="polite">
        {notifications.map(item => (
          <Alert
            key={item.id}
            position="inline"
            className="w-fit max-w-full pointer-events-auto"
            variant={item.variant === 'error' ? 'destructive' : item.variant}
            role={item.variant === 'error' ? 'alert' : 'status'}
            aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            data-studio-toast=""
            data-variant={item.variant}
            onClose={() => dismiss(item.id)}
          >
            {item.message}
          </Alert>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}
