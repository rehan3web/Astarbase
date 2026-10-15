'use client'
import { useStudio } from '@/components/providers/StudioProvider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function ConnectPopover() {
  const { database } = useStudio()
  return <Popover><PopoverTrigger className="text-xs rounded border border-default px-3 py-1">Connect</PopoverTrigger>
    <PopoverContent className="w-96 p-5 space-y-3 text-sm">
      <h3 className="font-semibold">External database connection</h3>
      <p>Database: <code>{database}</code></p>
      <p className="text-foreground-lighter">Use your Docker host with POSTGRES_PUBLIC_PORT or PGBOUNCER_PUBLIC_PORT from Backend/.env. Use your database role credentials; no password is exposed in Studio.</p>
      <p className="text-foreground-lighter">PgBouncer automatically routes this branch. Studio administration uses local Unix sockets only.</p>
    </PopoverContent></Popover>
}
