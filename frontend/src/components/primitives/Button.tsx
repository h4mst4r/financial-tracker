type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

// Hover utilities use the `enabled:` variant so a disabled button (which keeps its variant fill,
// dimmed via opacity-50) does not also respond to :hover.
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary enabled:hover:brightness-110',
  secondary: 'bg-surface-raised text-text-primary border border-border enabled:hover:bg-surface-hover',
  ghost: 'bg-transparent text-text-primary border border-border enabled:hover:border-border-light enabled:hover:bg-surface-hover',
  danger: 'bg-error-solid text-on-primary',
}

export function Button({ variant = 'primary', className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`
        h-control px-md rounded-md text-sm font-medium whitespace-nowrap
        transition-colors duration-quick
        ${variantClasses[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.97] transition-transform duration-press'}
        ${className ?? ''}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
