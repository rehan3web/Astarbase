import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'brand' | 'warning' | 'destructive' | 'outline' | 'success'
  size?: 'small' | 'large'
}

export function Badge({
  className,
  variant = 'default',
  size = 'small',
  ...props
}: BadgeProps) {
  const variantClasses = {
    default: 'bg-surface-200 border-default text-foreground-light',
    secondary: 'bg-surface-300 border-strong text-foreground',
    brand: 'bg-brand-500/10 border-brand-500/30 text-brand-500',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    destructive: 'bg-destructive/10 border-destructive/30 text-destructive',
    outline: 'bg-transparent border-default text-foreground-light',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  }[variant]

  const sizeClasses = size === 'small' ? 'px-1.5 py-0.5 text-[10px] leading-3' : 'px-2.5 py-0.5 text-xs'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded font-mono font-medium border select-none',
        sizeClasses,
        variantClasses,
        className
      )}
      {...props}
    />
  )
}
