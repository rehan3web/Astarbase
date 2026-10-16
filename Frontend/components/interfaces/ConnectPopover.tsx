'use client'

import React from 'react'
import Link from 'next/link'
import { Plug } from 'lucide-react'

export function ConnectPopover() {
  return (
    <Link
      href="/connect"
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--primary-border)] bg-[var(--primary-solid)] px-3 text-xs font-medium text-[var(--primary-solid-foreground)] shadow-xs transition-colors hover:bg-[var(--primary-solid-hover)]"
    >
      <Plug className="h-3.5 w-3.5 rotate-90" />
      <span>Connect</span>
    </Link>
  )
}
