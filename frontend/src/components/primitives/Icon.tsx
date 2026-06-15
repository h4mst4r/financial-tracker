import type { LucideIcon } from 'lucide-react'

interface IconProps {
  icon: LucideIcon
  size?: number
  className?: string
  'aria-label'?: string
}

export function Icon({ icon: Glyph, size = 16, className, 'aria-label': label }: IconProps) {
  return (
    <Glyph
      size={size}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}
