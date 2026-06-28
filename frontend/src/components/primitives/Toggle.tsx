import { usePressable, PRESS_SCALE, DISABLED_CLASS } from './behaviors/usePressable'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
}

// Toggle = Pressable + a sliding thumb. The Pressable behavior owns the disabled-gated press + the
// press-scale/disabled tokens; the switch role/track/thumb are the skin.
export function Toggle({ checked, onChange, disabled, id, 'aria-label': ariaLabel }: ToggleProps) {
  const press = usePressable({ disabled, onPress: () => onChange(!checked) })
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      aria-label={ariaLabel}
      {...press}
      className={`
        toggle-track rounded-full relative
        transition-colors duration-base
        ${PRESS_SCALE}
        ${disabled ? DISABLED_CLASS : ''}
        ${checked ? 'bg-primary' : 'bg-surface-active'}
      `}
    >
      <span
        className="
          absolute top-0.5 left-0.5 toggle-thumb rounded-full
          bg-on-primary shadow-sm
          transition-transform duration-base
        "
        style={{ transform: checked ? 'translateX(var(--toggle-thumb-travel))' : 'translateX(0)' }}
      />
    </button>
  )
}
