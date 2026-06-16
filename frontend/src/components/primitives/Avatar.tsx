import { useState } from 'react'
import { contrastText } from '../../theme/colour'

interface AvatarProps {
  src?: string
  name: string
  colour?: string
  size?: number
  className?: string
}

export function Avatar({ src, name, colour, size = 32, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false)

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const bgColor = colour ?? 'var(--color-surface-raised)'

  // When colour is a raw hex (the common case), contrastText works directly.
  // When it's a CSS var reference, fall back to light text.
  const isHex = bgColor.startsWith('#')
  const textColour = isHex ? contrastText(bgColor) : '#ffffff'

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`
          rounded-full overflow-hidden
          ${className}
        `}
        style={{ width: size, height: size }}
        onError={() => setImgError(true)}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={name}
      className={`
        inline-flex items-center justify-center rounded-full overflow-hidden
        font-medium
        ${className}
      `}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundColor: bgColor,
        color: textColour,
      }}
    >
      {initials}
    </span>
  )
}
