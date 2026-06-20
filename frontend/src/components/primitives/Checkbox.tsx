import { Check } from 'lucide-react'
import { Icon } from './Icon'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  label?: string
  /** Accessible name when there is no visible `label` text (e.g. a row-selection checkbox). */
  'aria-label'?: string
}

export function Checkbox({ checked, onChange, disabled, id, label, 'aria-label': ariaLabel }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer focus-visible:outline-none"
        checked={checked}
        onChange={(e) => { if (!disabled) onChange(e.target.checked); }}
        disabled={disabled}
        id={id}
        aria-label={ariaLabel}
      />
      <span
        className={`
          w-5 h-5 rounded-md flex items-center justify-center
          transition-colors duration-quick border
          peer-focus-visible:ring-2 peer-focus-visible:ring-glow-primary
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${checked
            ? 'bg-primary border-primary'
            : 'border-border bg-surface-raised'
          }
        `}
      >
        <Icon
          icon={Check}
          size={14}
          className={`text-on-primary transition-[opacity,transform] duration-draw ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
        />
      </span>
      {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
    </label>
  )
}
