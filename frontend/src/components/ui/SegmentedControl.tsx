/**
 * Segmented Control — flush toggle between a fixed set of options.
 *
 * Use for mode toggles that hold persistent state (e.g. Household / My Finances).
 * Active pill: bg-primary text-text-inverse per UX spec §2.10.
 *
 * collapsed=true stacks pills vertically and shows first character only (icon sidebar).
 */

interface SegmentedOption<T extends string = string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Stack pills vertically and show first char only (collapsed sidebar mode) */
  collapsed?: boolean
  className?: string
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  collapsed,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`flex ${collapsed ? 'flex-col' : ''} rounded-md border border-border-state bg-bg overflow-hidden ${className ?? ''}`}
    >
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          title={collapsed ? opt.label : undefined}
          onClick={() => onChange(opt.value)}
          className={[
            collapsed ? 'w-full flex justify-center' : 'flex-1',
            'py-2 text-sm font-medium transition-colors duration-fast',
            i > 0
              ? collapsed
                ? 'border-t border-border-state-subtle'
                : 'border-l border-border-state-subtle'
              : '',
            value === opt.value
              ? 'bg-primary text-text-inverse'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {collapsed ? opt.label[0] : opt.label}
        </button>
      ))}
    </div>
  )
}
