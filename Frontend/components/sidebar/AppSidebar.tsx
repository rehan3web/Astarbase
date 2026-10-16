'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  GitBranch,
  Home,
  Moon,
  LogOut,
  Settings,
  Sun,
} from 'lucide-react'
import {
  TableEditorIcon,
  SqlEditorIcon,
  SchemaVisualizerIcon,
} from '@/components/ui/icons'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTheme } from '@/components/providers/ThemeProvider'
import { cn } from '@/lib/utils'
import { useNotifications } from '@/components/providers/NotificationProvider'
import { useState } from 'react'

export function AppSidebar() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const { notify } = useNotifications()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Could not sign out')
      notify('Signed out successfully')
      window.setTimeout(() => window.location.reload(), 500)
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not sign out', 'error')
      setSigningOut(false)
    }
  }

  const navItems = [
    {
      label: 'Project Home',
      href: '/',
      icon: <Home className="h-4 w-4" />,
      active: pathname === '/',
    },
    {
      label: 'Table Editor',
      href: '/tables',
      icon: <TableEditorIcon size={18} />,
      active: pathname.startsWith('/tables'),
    },
    {
      label: 'SQL Editor',
      href: '/sql',
      icon: <SqlEditorIcon size={18} />,
      active: pathname.startsWith('/sql'),
    },
    {
      label: 'Branches',
      href: '/branches',
      icon: <GitBranch className="h-4 w-4" />,
      active: pathname.startsWith('/branches'),
    },
    {
      label: 'Schema Visualizer',
      href: '/visualizer',
      icon: <SchemaVisualizerIcon size={18} />,
      active: pathname.startsWith('/visualizer'),
    },
  ]

  const handleToggleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!document.startViewTransition) {
      toggleTheme()
      return
    }

    const x = e.clientX
    const y = e.clientY
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    )

    const transition = document.startViewTransition(() => {
      toggleTheme()
    })

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ]

      document.documentElement.animate(
        {
          clipPath: clipPath,
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        }
      )
    })
  }

  return (
    <TooltipProvider delayDuration={150}>
      <aside className="w-14 h-full shrink-0 border-r border-default bg-dash-sidebar flex flex-col items-center py-3 z-30 select-none">
        
        {/* Top Actions */}
       
        {/* Main Navigation Links */}
        <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2">
          {navItems.map((item) => (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    'relative w-9 h-9 rounded-md flex items-center justify-center transition-all cursor-pointer',
                    item.active
                      ? 'bg-[#F3F3F3] dark:bg-[#1E1F1E] text-foreground dark:text-[#F3F3F3] shadow-xs'
                      : 'text-foreground-lighter hover:text-foreground hover:bg-surface-100'
                  )}
                >
                  {item.icon}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* Bottom Utility Icons */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-border-muted w-full px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggleTheme}
                className="w-8 h-8 rounded-md flex items-center justify-center text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <div className="relative h-4 w-4 flex items-center justify-center">
                  <Sun
                    className={cn(
                      "absolute h-4 w-4 transition-all duration-300 ease-in-out",
                      theme === 'dark' ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
                    )}
                  />
                  <Moon
                    className={cn(
                      "absolute h-4 w-4 transition-all duration-300 ease-in-out",
                      theme === 'light' ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
                    )}
                  />
                </div>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/settings"
                className={cn(
                  "w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                  pathname.startsWith('/settings')
                    ? "bg-[#F3F3F3] dark:bg-[#1E1F1E] text-foreground dark:text-[#F3F3F3] shadow-xs"
                    : "text-foreground-lighter hover:text-foreground hover:bg-surface-100"
                )}
              >
                <Settings className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Project Settings</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={signingOut}
                aria-label="Sign out"
                className="w-8 h-8 rounded-md flex items-center justify-center text-foreground-lighter hover:text-foreground hover:bg-surface-100 transition-colors disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{signingOut ? 'Signing out…' : 'Sign out'}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  )
}
