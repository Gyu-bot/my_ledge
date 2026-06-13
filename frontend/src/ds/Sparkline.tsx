interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  stroke?: string
  className?: string
  label?: string
}

export function Sparkline({
  values,
  width = 120,
  height = 28,
  stroke = 'var(--ds-accent-fg)',
  className,
  label,
}: SparklineProps) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const pad = 2
  const step = (width - pad * 2) / (values.length - 1)
  const points = values
    .map((value, index) => {
      const x = pad + index * step
      const y = pad + (height - pad * 2) * (1 - (value - min) / range)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={label ?? '추이 스파크라인'}
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
