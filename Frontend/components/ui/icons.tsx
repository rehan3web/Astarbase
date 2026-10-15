import React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

export const SupabaseLogo = ({ size = 24, className = '', ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 106 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M58.0772 98.4239C55.5168 100.457 51.6854 99.4587 50.4851 96.444L36.0029 60.0522C35.4529 58.6705 35.8829 57.0872 37.0543 56.1772L88.9482 15.8972C91.5086 13.8641 95.34 14.8624 96.5403 17.8771L111.023 54.2689C111.573 55.6506 111.143 57.2339 109.971 58.1439L58.0772 98.4239Z"
      fill="url(#paint0_linear)"
    />
    <path
      d="M58.0772 98.4239C55.5168 100.457 51.6854 99.4587 50.4851 96.444L36.0029 60.0522C35.4529 58.6705 35.8829 57.0872 37.0543 56.1772L88.9482 15.8972C91.5086 13.8641 95.34 14.8624 96.5403 17.8771L111.023 54.2689C111.573 55.6506 111.143 57.2339 109.971 58.1439L58.0772 98.4239Z"
      fill="black"
      fillOpacity="0.2"
    />
    <path
      d="M51.9228 1.57608C54.4832 -0.457007 58.3146 0.541347 59.5149 3.55601L73.9971 39.9478C74.5471 41.3295 74.1171 42.9128 72.9457 43.8228L21.0518 84.1028C18.4914 86.1359 14.66 85.1376 13.4597 82.1229L-1.0225 45.7311C-1.57252 44.3494 -1.14251 42.7661 0.0289115 41.8561L51.9228 1.57608Z"
      fill="url(#paint1_linear)"
    />
    <defs>
      <linearGradient
        id="paint0_linear"
        x1="53.5"
        y1="56"
        x2="89.5"
        y2="96.5"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#249361" />
        <stop offset="1" stopColor="#3ECF8E" />
      </linearGradient>
      <linearGradient
        id="paint1_linear"
        x1="56.5"
        y1="44"
        x2="20.5"
        y2="3.5"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#3ECF8E" />
        <stop offset="1" stopColor="#249361" />
      </linearGradient>
    </defs>
  </svg>
)

export const TableEditorIcon = ({ size = 18, className = '', ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M9 3v18" />
  </svg>
)

export const SqlEditorIcon = ({ size = 18, className = '', ...props }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`lucide lucide-sql-editor ${className}`.trim()}
    {...props}
  >
    <path d="M7.89844 8.4342L11.5004 12.0356L7.89844 15.6375M12 15.3292H16.5M5 21.1055H19C20.1046 21.1055 21 20.21 21 19.1055V5.10547C21 4.0009 20.1046 3.10547 19 3.10547H5C3.89543 3.10547 3 4.0009 3 5.10547V19.1055C3 20.21 3.89543 21.1055 5 21.1055Z" />
  </svg>
)

export const SchemaVisualizerIcon = ({ size = 18, className = '', ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
    <path d="M10 6.5h4" />
    <path d="M6.5 10v4" />
    <path d="M17.5 10v4" />
    <path d="M10 17.5h4" />
  </svg>
)

export const DatabaseIcon = ({ size = 18, className = '', ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
)
