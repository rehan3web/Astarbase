'use client'

import React from 'react'
import { AppLayout } from '@/components/layouts/AppLayout'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const links = [
    { name: 'Database', href: '/settings/database' },
    { name: 'Backups', href: '/settings/backups' },
  ]

  return (
    <AppLayout headerTitle="Settings">
      <div className="flex h-full w-full">
        <aside className="w-64 border-r border-default bg-studio h-full p-6 flex flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-4 px-2 uppercase tracking-wider">Project Settings</h2>
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const isActive = pathname.startsWith(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm transition-colors",
                      isActive 
                        ? "bg-surface-200 text-foreground font-medium" 
                        : "text-foreground-light hover:bg-surface-100 hover:text-foreground"
                    )}
                  >
                    {link.name}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </AppLayout>
  )
}
