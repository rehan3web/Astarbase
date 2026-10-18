import * as React from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'secondary' | 'outline' | 'dashed' | 'destructive' | 'ghost' | 'link' | 'warning'
  size?: 'tiny' | 'small' | 'default' | 'large'
  loading?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'default',
      loading = false,
      iconLeft,
      iconRight,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseClasses = [
      'relative inline-flex items-center justify-center cursor-pointer',
      'gap-2 text-center font-medium',
      'ease-[cubic-bezier(0.22,1,0.36,1)] duration-200',
      'transition-[background-color,border-color,color,scale]',
      '[&:not([aria-haspopup])]:motion-safe:active:scale-[0.97]',
      'outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
      'disabled:opacity-50 disabled:pointer-events-none',
      'whitespace-nowrap shrink-0 select-none',
    ].join(' ')

    const sizeClasses = {
      tiny: 'text-xs px-2.5 py-1 h-[26px] rounded-full',
      small: 'text-xs px-2.5 py-1 h-[28px] rounded-md',
      default: 'text-xs px-3 py-1.5 h-[34px] rounded-md',
      large: 'text-sm px-4 py-2 h-[38px] rounded-md',
    }[size]

    const variantClasses = {
      primary: [
        'border border-[var(--primary-border)]',
        'bg-[var(--primary-solid)]',
        'bg-[linear-gradient(to_bottom,hsl(0deg_0%_100%/0.015),hsl(0deg_0%_0%/0.01))]',
        'text-[var(--primary-solid-foreground)]',
        'shadow-[var(--button-shadow-raised)]',
        'hover:bg-[var(--primary-solid-hover)]',
        'data-[state=open]:bg-[var(--primary-solid-hover)]',
      ].join(' '),

      default: [
        'border border-[var(--border-button-default)]',
        'bg-[var(--control)]',
        'bg-[linear-gradient(to_bottom,hsl(0deg_0%_100%/0.02),hsl(0deg_0%_0%/0.005))]',
        'text-foreground',
        'shadow-[var(--button-shadow-raised)]',
        'hover:border-[var(--border-button-hover)]',
        'hover:bg-[var(--secondary)]',
      ].join(' '),

      secondary: [
        'border border-[var(--border-button-default)]',
        'bg-[var(--secondary)]',
        'bg-[linear-gradient(to_bottom,hsl(0deg_0%_100%/0.015),hsl(0deg_0%_0%/0.008))]',
        'text-foreground',
        'shadow-[var(--button-shadow-raised)]',
        'hover:border-[var(--border-button-hover)]',
      ].join(' '),

      outline: [
        'border border-[var(--border-button-default)]',
        'bg-transparent',
        'text-foreground',
        'hover:bg-[var(--control)]',
        'hover:border-[var(--border-button-hover)]',
      ].join(' '),

      dashed: [
        'border border-dashed border-[var(--border-strong)]',
        'bg-transparent',
        'text-foreground-light hover:text-foreground',
        'hover:bg-[var(--control)]',
        'hover:border-[var(--border-button-hover)]',
      ].join(' '),

      destructive: [
        'border-0',
        'bg-[var(--destructive-solid,var(--destructive-default))]',
        'bg-[linear-gradient(to_bottom,hsl(0deg_0%_100%/0.015),hsl(0deg_0%_0%/0.01))]',
        'text-[var(--destructive-foreground,white)]',
        'shadow-[var(--button-shadow-raised)]',
        'hover:bg-[var(--destructive-solid-hover,var(--destructive-600))]',
      ].join(' '),

      warning: [
        'border-0',
        'bg-[var(--warning-solid,var(--warning-default))]',
        'bg-[linear-gradient(to_bottom,hsl(0deg_0%_100%/0.015),hsl(0deg_0%_0%/0.01))]',
        'text-[var(--warning-foreground)]',
        'shadow-[var(--button-shadow-raised)]',
      ].join(' '),

      ghost: [
        'border-0 bg-transparent',
        'text-foreground-light hover:text-foreground',
        'hover:bg-[var(--control)]',
      ].join(' '),

      link: 'bg-transparent text-brand-500 hover:underline p-0 h-auto border-0',
    }[variant]

    return (
      <button
        ref={ref}
        data-variant={variant}
        disabled={disabled || loading}
        className={cn(baseClasses, sizeClasses, variantClasses, className)}
        {...props}
      >
        {loading ? (
          <Spinner size={14} decorative className="text-foreground-muted" />
        ) : (
          iconLeft && (
            <div
              aria-hidden="true"
              className="inline-flex items-center justify-center shrink-0 [&_svg]:h-[14px] [&_svg]:w-[14px]"
            >
              {iconLeft}
            </div>
          )
        )}
        {children && <span className="truncate inline-flex items-center gap-1.5">{children}</span>}
        {!loading && iconRight && (
          <div
            aria-hidden="true"
            className="inline-flex items-center justify-center shrink-0 [&_svg]:h-[14px] [&_svg]:w-[14px]"
          >
            {iconRight}
          </div>
        )}
      </button>
    )
  }
)
Button.displayName = 'Button'
