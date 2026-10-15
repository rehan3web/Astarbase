'use client'

import React from 'react'
import { AppSidebar } from '@/components/sidebar/AppSidebar'
import { AppHeader } from '@/components/sidebar/AppHeader'

export function AppLayout({
  children,
  headerTitle,
}: {
  children: React.ReactNode
  headerTitle?: string
}) {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-studio text-foreground antialiased selection:bg-brand-500/20 selection:text-brand-500">
      <AppHeader title={headerTitle} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {children}
        </main>
      </div>
    </div>
  )
}
