type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-110',
  secondary: 'bg-surface-raised text-text-primary border border-border hover:bg-surface-hover',
  ghost: 'bg-transparent text-text-primary border border-border hover:border-border-light hover:bg-surface-hover',
  danger: 'bg-error-solid text-on-primary',
}

export function Button({ variant = 'primary', className, disabled, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`
        h-control px-md rounded-md text-sm font-medium
        transition-colors duration-quick
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.97] transition-transform duration-press'}
        ${disabled ? '' : variantClasses[variant]}
        ${className ?? ''}
      `}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}
