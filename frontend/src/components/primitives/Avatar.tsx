import { useState } from 'react'
import { contrastText } from '../../theme/colour'

// Avatar initials (and the "+N" overflow count) render at a fixed fraction of the avatar size — the one
// legible ratio locked in UX §8 ("Avatar initials = ×0.40 of the avatar size"). A named constant, not a
// magic literal (FRONTEND-AUDIT B9); guarded by avatar.test.tsx.
const AVATAR_INITIALS_RATIO = 0.4

interface AvatarProps {
  src?: string
  /** Required for a person avatar (initials + aria); omit only for the `overflow` count variant. */
  name?: string
  colour?: string
  size?: number
  className?: string
  /** Avatar-stack overflow: render a neutral "+N" circle instead of a person (e.g. owner stacks). */
  overflow?: number
}

export function Avatar({ src, name = '', colour, size = 32, className = '', overflow }: AvatarProps) {
  const [imgError, setImgError] = useState(false)

  // Stack overflow ("+N") — a neutral count circle matching the avatar shape/size, not a person.
  if (overflow != null) {
    return (
      <span
        role="img"
        aria-label={`${overflow} more`}
        className={`inline-flex items-center justify-center rounded-full bg-surface-active font-medium text-text-default ${className}`}
        style={{ width: size, height: size, fontSize: size * AVATAR_INITIALS_RATIO }}
      >
        +{overflow}
      </span>
    )
  }

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
        fontSize: size * AVATAR_INITIALS_RATIO,
        backgroundColor: bgColor,
        color: textColour,
      }}
    >
      {initials}
    </span>
  )
}
