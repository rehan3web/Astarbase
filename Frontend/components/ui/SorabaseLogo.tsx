type SorabaseLogoProps = {
  size?: number
  className?: string
}

export function SorabaseLogo({ size = 24, className }: SorabaseLogoProps) {
  return (
    <img
      src="/sorabase-logo.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={className}
    />
  )
}
