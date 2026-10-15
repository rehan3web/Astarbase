'use client'

import { Monitor } from 'lucide-react'

export function MobileRestriction() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-studio p-8 md:hidden">
      <div className="flex flex-col items-center text-center max-w-sm space-y-6">
        {/* Icon */}
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-default bg-surface-200">
          <Monitor className="h-8 w-8 text-foreground-lighter" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-foreground leading-tight">
          Desktop Only
        </h1>

        {/* Message */}
        <p className="text-sm text-foreground-lighter leading-relaxed">
          We apologize — this web UI is designed for <span className="text-foreground font-medium">desktop and laptop</span> screens only. Mobile support is coming soon.
        </p>

        {/* Divider */}
        <div className="w-12 border-t border-default" />

        {/* Sub-message */}
        <p className="text-xs text-foreground-muted">
          Please open this application on a desktop or laptop browser for the best experience.
        </p>
      </div>
    </div>
  )
}
