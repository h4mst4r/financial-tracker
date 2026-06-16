interface SpinnerProps {
  size?: number
  className?: string
}

/** Branded ring spinner (UX §3): a track ring with an accent arc that rotates.
 *  Honours reduced-motion via --motion-factor (animate-spin duration). */
export function Spinner({ size = 16, className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`
        inline-block rounded-full border-2
        border-surface-active border-t-accent-primary
        animate-spin
        ${className}
      `}
      style={{ width: size, height: size }}
    />
  )
}
