'use client'

import * as React from 'react'
import { AlertCircle, AlertTriangle, Check, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'info'
  icon?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  onClose?: () => void
  position?:
    | 'bottom-right'
    | 'bottom-left'
    | 'top-right'
    | 'top-left'
    | 'top-center'
    | 'bottom-center'
    | 'inline'
}

export function Alert({
  className,
  variant = 'success',
  icon,
  title,
  description,
  children,
  onClose,
  position = 'bottom-right',
  ...props
}: AlertProps) {
  const defaultIcons = {
    default: <Info className="h-3.5 w-3.5 text-foreground-lighter shrink-0" />,
    success: <Check className="h-3.5 w-3.5 text-brand-500 shrink-0" />,
    info: <Info className="h-3.5 w-3.5 text-sky-400 shrink-0" />,
    warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />,
    destructive: <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />,
  }

  const positionClasses = {
    'bottom-right':
      'fixed bottom-5 right-5 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200',
    'bottom-left':
      'fixed bottom-5 left-5 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200',
    'top-right':
      'fixed top-5 right-5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200',
    'top-left':
      'fixed top-5 left-5 z-[100] animate-in fade-in slide-in-from-top-2 duration-200',
    'top-center':
      'fixed top-5 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-2 duration-200',
    'bottom-center':
      'fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200',
    inline: 'relative w-full',
  }[position]

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2.5 px-3.5 py-2 rounded-md bg-surface-100 border border-strong shadow-xl text-xs text-foreground select-none',
        positionClasses,
        className
      )}
      {...props}
    >
      {icon !== undefined ? icon : defaultIcons[variant]}
      <div className="flex-1 flex flex-col justify-center">
        {title && <span className="font-medium text-foreground">{title}</span>}
        {(description || children) && (
          <span className="text-foreground text-xs leading-normal">
            {description || children}
          </span>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded text-foreground-lighter hover:text-foreground hover:bg-surface-200 transition-colors ml-1 cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

export function AlertTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn('font-medium leading-none tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </h5>
  )
}

export function AlertDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div className={cn('text-xs text-foreground-light', className)} {...props}>
      {children}
    </div>
  )
}
