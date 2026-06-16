import { type ReactNode } from 'react'

interface SkeletonProps {
  variant?: 'line' | 'rect' | 'circle'
  children?: ReactNode
  className?: string
}

export function Skeleton({ variant = 'line', children, className = '' }: SkeletonProps) {
  const shapeClasses = {
    line: '',
    rect: '',
    circle: 'rounded-full',
  }

  if (children) {
    // Framed mode: a STATIC surface container that holds shimmering placeholder shapes
    // (frontend.md §2.10 — the frame stops the shapes reading as floating bars). The frame
    // itself does not shimmer; the children (each a <Skeleton> or shimmer element) do.
    return (
      <div
        className={`
          bg-surface rounded p-sm
          ${className}
        `}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      className={`
        shimmer-gradient animate-shimmer rounded
        ${shapeClasses[variant]}
        ${className}
      `}
    />
  )
}
