'use client'

import React, { useState } from 'react'
import { Check, ChevronDown, Database, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface SchemaSelectorProps {
  selectedSchema: string
  onSelectSchema: (schema: string) => void
  schemas?: string[]
  className?: string
  fullWidth?: boolean
}

export function SchemaSelector({
  selectedSchema,
  onSelectSchema,
  schemas = ['public', 'auth'],
  className,
  fullWidth = false,
}: SchemaSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredSchemas = schemas.filter((s) =>
    s.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'h-7 px-2.5 rounded-md border border-strong bg-surface-100 hover:bg-surface-200 text-xs font-mono flex items-center transition-colors cursor-pointer text-left',
            fullWidth ? 'w-full justify-between' : 'gap-1.5',
            className
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-foreground-lighter font-sans text-xs">schema</span>
            <span className="text-foreground font-semibold text-xs">{selectedSchema}</span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-foreground-lighter shrink-0 ml-auto" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5 bg-overlay border-overlay" align="start">
        <div className="relative mb-1">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-foreground-lighter" />
          <input
            placeholder="Find schema..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-7 pl-7 pr-2 text-xs bg-surface-100 border border-strong rounded text-foreground placeholder:text-foreground-lighter focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="text-[10px] font-medium tracking-wider uppercase text-foreground-lighter px-2 py-1 mt-1">
          Schemas
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {filteredSchemas.map((schema) => {
            const isSelected = schema === selectedSchema
            return (
              <button
                key={schema}
                onClick={() => {
                  onSelectSchema(schema)
                  setOpen(false)
                }}
                className={cn(
                  'w-full flex items-center justify-between px-2 py-1.5 text-xs rounded transition-colors text-left font-mono cursor-pointer',
                  isSelected
                    ? 'bg-surface-200 text-foreground font-medium'
                    : 'text-foreground-light hover:bg-surface-200 hover:text-foreground'
                )}
              >
                <div className="flex items-center gap-2">
                  <Database className="h-3 w-3 text-foreground-lighter" />
                  <span>{schema}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-brand-500" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
