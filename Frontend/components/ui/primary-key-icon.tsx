import type { SVGProps } from 'react'

export function PrimaryKeyIcon({
  width = 14,
  height = 14,
  viewBox = '0 0 24 24',
  fill = 'none',
  stroke = 'currentColor',
  strokeWidth = 2,
  strokeLinecap = 'round',
  strokeLinejoin = 'round',
  'aria-label': ariaLabel,
  'aria-hidden': ariaHidden,
  role,
  ...props
}: SVGProps<SVGSVGElement>) {
  const isLabeled = Boolean(ariaLabel)

  return (
    <svg
      width={width}
      height={height}
      viewBox={viewBox}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap={strokeLinecap}
      strokeLinejoin={strokeLinejoin}
      data-primary-key-icon
      aria-label={ariaLabel}
      aria-hidden={isLabeled ? undefined : (ariaHidden ?? true)}
      role={isLabeled ? 'img' : role}
      {...props}
    >
      <circle cx="7" cy="12" r="5" />
      <path d="M12 12h10m-4 0v4m4-4v4" />
    </svg>
  )
}
