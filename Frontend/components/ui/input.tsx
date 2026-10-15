import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', iconLeft, iconRight, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full">
        {iconLeft && (
          <div className="absolute left-2.5 flex items-center pointer-events-none text-foreground-lighter">
            {iconLeft}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'flex h-8 w-full rounded-md border border-strong bg-surface-100 px-3 py-1 text-xs text-foreground placeholder:text-foreground-lighter transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-strong focus-visible:border-strong',
            'disabled:cursor-not-allowed disabled:opacity-50',
            iconLeft && 'pl-8',
            iconRight && 'pr-8',
            className
          )}
          ref={ref}
          {...props}
        />
        {iconRight && (
          <div className="absolute right-2.5 flex items-center text-foreground-lighter">
            {iconRight}
          </div>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
