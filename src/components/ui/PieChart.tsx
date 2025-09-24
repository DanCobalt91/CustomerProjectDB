import type { ReactNode } from 'react'

interface PieChartDatum {
  value: number
  color: string
}

interface PieChartProps {
  data: PieChartDatum[]
  size?: number
  thickness?: number
  trackColor?: string
  className?: string
  centerContent?: ReactNode
  ariaLabel?: string
}

export default function PieChart({
  data,
  size = 192,
  thickness = 52,
  trackColor = '#e2e8f0',
  className,
  centerContent,
  ariaLabel,
}: PieChartProps) {
  const total = data.reduce((sum, item) => (item.value > 0 ? sum + item.value : sum), 0)
  let gradientSegments: string[] = []

  if (total > 0) {
    let cumulative = 0
    gradientSegments = data
      .filter(item => item.value > 0)
      .map(item => {
        const start = (cumulative / total) * 360
        cumulative += item.value
        const end = (cumulative / total) * 360
        return `${item.color} ${start}deg ${end}deg`
      })
  }

  const gradientBackground =
    gradientSegments.length > 0 ? `conic-gradient(${gradientSegments.join(', ')})` : trackColor

  const innerSize = Math.max(size - thickness, 0)
  const containerClass = ['relative flex items-center justify-center', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={containerClass}
      style={{ width: size, height: size }}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
    >
      <div
        className='absolute inset-0 rounded-full border border-white/40 shadow-inner'
        style={{ background: gradientBackground }}
        aria-hidden
      />
      <div
        className='relative flex items-center justify-center rounded-full bg-white text-center shadow'
        style={{ width: innerSize, height: innerSize }}
        aria-hidden
      >
        {centerContent}
      </div>
    </div>
  )
}
