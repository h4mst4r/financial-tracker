import { PRESS_SCALE, DISABLED_CLASS } from './behaviors/usePressable'

type ButtonVariant = 'filled' | 'outline' | 'ghost' | 'danger' | 'text' | 'link' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

// Button = Pressable + label/Icon. The native <button> supplies press/focus/keyboard/disabled; the
// Pressable behavior owns the shared press-scale + disabled treatment (PRESS_SCALE / DISABLED_CLASS), so
// the §13 press-scale and the disabled token are authored once, in the behavior.
//
// Seven variants (UX Pressable-skins table): filled (= accent-primary fill + on-primary text, §6) ·
// outline (raised surface + border) · ghost (bordered transparent) · danger (error fill) · text (neutral
// borderless text button) · link (frameless inline accent hyperlink) · icon (bare, size-to-child icon
// affordance — size from the <Icon> child, colour inherited currentColor so the caller styles it).
//
// The frame utilities (h-control / px-md) live in the variant map, not BASE, so `icon` (size-to-child) and
// `link` (frameless) can opt out; filled/outline/ghost/danger keep `h-control px-md`. Hover utilities use the
// `enabled:` variant so a disabled button does not respond to :hover. The §3a `disabled` treatment
// (DISABLED_CLASS) is an UNLAYERED class, so it overrides the layered variant fill/text to the relative
// surface-mix + faint text — no opacity (B14/L5).
const BASE = 'rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-quick'

const variantClasses: Record<ButtonVariant, string> = {
  filled: 'h-control px-md bg-primary text-on-primary enabled:hover:brightness-110',
  outline: 'h-control px-md bg-surface-raised text-text-strong border border-border enabled:hover:bg-surface-hover',
  ghost: 'h-control px-md bg-transparent text-text-strong border border-border enabled:hover:border-border-light enabled:hover:bg-surface-hover',
  danger: 'h-control px-md bg-error-solid text-on-primary',
  text: 'h-control px-md bg-transparent text-text-strong enabled:hover:bg-surface-hover',
  // Bare, size-to-child: no h-control/aspect-square (size from the child), no text-* (colour = currentColor,
  // caller-styled — two equal-specificity .text-* utilities resolve by stylesheet source order, so a
  // variant-set colour would fight the caller's).
  icon: 'inline-flex items-center justify-center rounded-md p-2xs bg-transparent enabled:hover:bg-surface-hover',
  link: 'bg-transparent text-accent underline-offset-2 enabled:hover:underline',
}

export function Button({ variant = 'filled', className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`
        ${BASE}
        ${variantClasses[variant]}
        ${disabled ? DISABLED_CLASS : PRESS_SCALE}
        ${className ?? ''}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
