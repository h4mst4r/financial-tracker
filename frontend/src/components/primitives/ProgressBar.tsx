interface ProgressBarProps {
  value: number
  max?: number
  className?: string
}

export function ProgressBar({ value, max = 100, className = '' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`
        bg-surface-active rounded-full h-2 w-full
        ${className}
      `}
    >
      <div
        className="bg-primary rounded-full h-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
