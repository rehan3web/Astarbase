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
  document.body.appendChild(field)
  try {
    field.select()
    if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
  } finally {
    field.value = ''
    field.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
  }
}
