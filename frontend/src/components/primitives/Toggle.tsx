interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

export function Toggle({ checked, onChange, disabled, id, 'aria-label': ariaLabel }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      aria-label={ariaLabel}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        w-10 h-6 rounded-full relative
        transition-colors duration-base
        active:scale-[0.97] transition-transform duration-press
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${checked ? 'bg-primary' : 'bg-surface-active'}
      `}
    >
      <span
        className={`
          absolute top-0.5 left-0.5 w-5 h-5 rounded-full
          bg-on-primary shadow-sm
          transition-transform duration-base
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </button>
  )
}
