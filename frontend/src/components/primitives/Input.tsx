interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export function Input({ error, disabled, className, ...rest }: InputProps) {
  const stateClass = disabled
    ? 'opacity-50 cursor-not-allowed'
    : error
      ? 'border-border-error ring-2 ring-glow-error'
      : 'border-border focus:ring-2 focus:ring-glow-primary focus:border-border-focus'

  return (
    <input
      className={`
        w-full h-control py-control px-sm rounded-md
        bg-surface-raised border text-text-primary text-sm
        transition-colors duration-quick
        focus:outline-none
        ${stateClass}
        ${className ?? ''}
      `}
      disabled={disabled}
      {...rest}
    />
  )
}
