'use client'

import { ChevronDown } from 'lucide-react'
import { getColumnTypeOptions } from '@/lib/column-type-options'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface ColumnDefaultValueInputProps {
  value: string
  type: string
  isArray?: boolean
  label: string
  columnName?: string
  open: boolean
  onChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  className?: string
  inputClassName?: string
}

export function ColumnDefaultValueInput({
  value,
  type,
  isArray = false,
  label,
  columnName,
  open,
  onChange,
  onOpenChange,
  className,
  inputClassName,
}: ColumnDefaultValueInputProps) {
  const suggestions = getColumnTypeOptions(type, isArray).suggestions

  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="NULL"
        className={cn(
          'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 pr-10 font-mono text-xs text-foreground outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 dark:border-strong dark:bg-surface-200 dark:focus:border-brand dark:focus:ring-0',
          inputClassName,
        )}
      />
      {suggestions.length > 0 && (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Suggested expressions for ${columnName || label.replace(/^Default value(?: for)?\s*/i, '') || 'column'}`}
              title="Suggested expressions"
              className="absolute inset-y-1 right-1 inline-flex w-8 items-center justify-center rounded-md text-foreground-lighter transition-colors hover:bg-gray-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:hover:bg-surface-300"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            className="w-[min(23rem,calc(100vw-2rem))] overflow-hidden border-gray-200 bg-white p-0 text-foreground shadow-lg dark:border-default dark:bg-surface-100"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium dark:border-default">
              Suggested expressions
            </div>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.value}
                  type="button"
                  onClick={() => {
                    onChange(suggestion.value)
                    onOpenChange(false)
                  }}
                  className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:hover:bg-surface-200"
                >
                  <span className="font-mono text-xs font-medium">{suggestion.value}</span>
                  <span className="mt-1 text-xs leading-relaxed text-foreground-lighter">
                    {suggestion.description}
                  </span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
