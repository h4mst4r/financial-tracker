import React from 'react'

interface SegmentedControlOption {
  value: string
  label: string
}

interface SegmentedControlProps {
  value: string
  options: SegmentedControlOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export function SegmentedControl({ value, options, onChange, disabled }: SegmentedControlProps) {
  return (
    <div className="flex border border-border rounded-md overflow-hidden">
      {options.map((opt, i) => {
        const isActive = opt.value === value
        return (
          <React.Fragment key={opt.value}>
            <button
              type="button"
              disabled={disabled}
              tabIndex={disabled ? -1 : undefined}
              className={`
                relative flex-1 h-control py-control px-sm rounded-none text-sm font-medium
                transition-colors duration-quick
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-glow-primary
                ${isActive ? 'bg-control-active text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onClick={() => !disabled && onChange(opt.value)}
            >
              {opt.label}
            </button>
            {i < options.length - 1 && <span className="w-px bg-border self-stretch" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}
