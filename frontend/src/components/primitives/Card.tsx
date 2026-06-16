import { type ReactNode, type MouseEventHandler } from 'react'

interface CardProps {
  interactive?: boolean
  children: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLElement>
}

export function Card({ interactive = false, children, className = '', onClick }: CardProps) {
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.currentTarget.click()
              }
            }
          : undefined
      }
      className={`
        bg-surface-raised border border-border rounded-lg shadow-sm
        p-md
        ${interactive
          ? 'cursor-pointer hover:shadow-md hover:-translate-y-px transition-all duration-quick'
          : ''
        }
        ${className}
      `}
    >
      {children}
    </div>
  )
}
