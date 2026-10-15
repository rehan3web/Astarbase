'use client'

import * as React from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked = false,
      indeterminate = false,
      onCheckedChange,
      disabled,
      ...props
    },
    ref
  ) => {
    const isChecked = checked || indeterminate

    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        disabled={disabled}
        ref={ref}
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled && onCheckedChange) {
            onCheckedChange(!checked)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            if (!disabled && onCheckedChange) {
              onCheckedChange(!checked)
            }
          }
        }}
        className={cn(
          'h-3.5 w-3.5 shrink-0 rounded-[3px] flex items-center justify-center transition-all duration-150 cursor-pointer select-none outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isChecked
            ? 'bg-foreground text-background border border-foreground shadow-xs'
            : 'bg-transparent border border-strong hover:border-foreground hover:bg-surface-200',
          className
        )}
        {...props}
      >
        {checked && <Check className="h-2.5 w-2.5 stroke-[3] text-background" />}
        {!checked && indeterminate && <Minus className="h-2.5 w-2.5 stroke-[3] text-background" />}
      </button>
    )
  }
)

Checkbox.displayName = 'Checkbox'
