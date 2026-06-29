interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

// Input is the native Field leaf: a raw <input> already owns the Field contract (value · change · error
// · disabled · label) at the platform level, so it adds only the error/disabled ring treatment. The
// `useField` behavior exists for the *composite* fields (Dropdown / DatePicker / the pickers) that carry
// the same contract over a non-native value — they delegate to this primitive for text entry.
export function Input({ error, disabled, className, ...rest }: InputProps) {
  const stateClass = disabled
    ? 'disabled'
    : error
      ? 'border-border-error ring-2 ring-glow-error'
      : 'border-border focus:ring-2 focus:ring-glow-primary focus:border-border-focus'

  return (
    <input
      className={`
        w-full h-control py-control px-sm rounded-md
        bg-surface-raised border text-text-strong text-sm
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
