interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

export function Divider({ orientation = 'horizontal', className = '' }: DividerProps) {
  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        data-orientation="vertical"
        className={`
          border-l border-border self-stretch
          ${className}
        `}
      />
    )
  }

  return (
    <div
      role="separator"
      data-orientation="horizontal"
      className={`
        border-t border-border w-full
        ${className}
      `}
    />
  )
}
