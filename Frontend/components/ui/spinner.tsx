'use client'

import { motion, useReducedMotion, type SVGMotionProps } from 'motion/react'
import { cn } from '@/lib/utils'

export interface SpinnerProps extends Omit<SVGMotionProps<SVGSVGElement>, 'color' | 'width' | 'height'> {
  size?: number
  color?: string
  'aria-label'?: string
  decorative?: boolean
}

export function Spinner({
  size = 24,
  color = 'currentColor',
  className,
  decorative = false,
  'aria-label': ariaLabel = 'Loading',
  ...props
}: SpinnerProps) {
  const prefersReducedMotion = useReducedMotion()
  return (
    <motion.svg
      {...props}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      data-spinner="true"
      className={cn('shrink-0 text-foreground-muted', className)}
      style={{ ...props.style, ...(color === 'currentColor' ? {} : { color }) }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : 'status'}
      aria-label={decorative ? undefined : ariaLabel}
      focusable="false"
      animate={prefersReducedMotion ? undefined : { rotate: 360 }}
      transition={prefersReducedMotion ? undefined : { duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        animate={prefersReducedMotion ? { pathLength: 0.5, opacity: 0.65 } : { pathLength: [0.2, 0.8], opacity: [0.2, 1] }}
        transition={prefersReducedMotion ? undefined : { duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    </motion.svg>
  )
}

export function LoadingIndicator({
  label = 'Loading',
  className,
  size = 24,
}: {
  label?: string
  className?: string
  size?: number
}) {
  return (
    <div role="status" aria-label={label} className={cn('grid place-items-center text-foreground-muted', className)}>
      <Spinner size={size} decorative />
    </div>
  )
}
