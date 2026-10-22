'use client'

import { useCallback, useRef, useState } from 'react'

/** Lock synchronously so clicks and Ctrl+Enter cannot submit the same draft twice. */
export function useInsertSave() {
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const save = useCallback(async (action: () => Promise<boolean>) => {
    if (pending.current) return false
    pending.current = true
    setSaving(true)
    try {
      return await action()
    } finally {
      pending.current = false
      setSaving(false)
    }
  }, [])
  return { saving, save }
}
