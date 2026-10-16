/** Explicit user-initiated copies also work on self-hosted HTTP deployments. */
export async function copyText(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Clipboard API may be unavailable or denied; try the user-gesture fallback.
  }
  const previousFocus = document.activeElement
  const field = document.createElement('textarea')
  field.value = text
  field.readOnly = true
  field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  // Keep the selection inside an active modal/menu focus trap. Otherwise it can
  // steal focus back and execCommand may report success without copying the text.
  const container = previousFocus?.closest('[role="dialog"], [role="alertdialog"], [role="menu"]') ?? document.body
  container.appendChild(field)
  try {
    field.focus({ preventScroll: true })
    field.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    field.value = ''
    field.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
  }
}
