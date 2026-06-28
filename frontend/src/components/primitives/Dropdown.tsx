import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Icon } from './Icon'
import { usePopover } from './behaviors/usePopover'
import { useMenu } from './behaviors/useMenu'
import { useField } from './behaviors/useField'

interface DropdownOption {
  value: string
  /** String, or a node (e.g. a colour-tinted label) — rendered in the trigger and the option list. */
  label: ReactNode
  /** Text the `searchable` filter matches on (defaults to the label when it's a string, else the value).
   *  Lets a caller match on more than the visible label — e.g. a currency's code AND its name. */
  searchText?: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  /** Opt-in: renders a filter input at the top of the panel and filters the list as you type. Off by
   *  default — every existing consumer keeps the plain (non-searchable) behaviour unchanged. */
  searchable?: boolean
}

export function Dropdown({ value, options, onChange, placeholder, disabled, id, searchable }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  // Roving-focus targets: one ref per option so ArrowUp/Down can move DOM focus (WAI-ARIA listbox).
  // Searchable mode keeps DOM focus in the filter input instead and tracks the highlight via
  // aria-activedescendant, so these refs are only used when NOT searchable.
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Field behavior: the controlled value contract (disabled-gated change).
  const field = useField<string>({ onChange, disabled })

  const selectedOption = options.find((o) => o.value === value)

  // The list the panel actually shows: filtered when searchable + a query is present, else all options.
  const visibleOptions = useMemo(() => {
    if (!searchable) return options
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      (o.searchText ?? (typeof o.label === 'string' ? o.label : o.value)).toLowerCase().includes(q),
    )
  }, [searchable, options, query])

  const baseId = id ?? 'dropdown'

  const selectOption = (optValue: string) => {
    field.change(optValue)
    setOpen(false)
  }

  // Menu behavior: roving keyboard (↑↓ Enter Esc) over the visible options. The skin decides how the
  // active row is reflected (DOM focus when not searchable; aria-activedescendant when searchable).
  const { activeIndex, setActiveIndex, onKeyDown } = useMenu({
    itemCount: visibleOptions.length,
    onActivate: (i) => selectOption(visibleOptions[i].value),
    onClose: () => setOpen(false),
  })

  // Popover behavior: outside-click + Escape dismissal, anchored to the trigger+panel wrapper.
  usePopover({ open, onClose: () => setOpen(false), containRef: ref })

  // While open, keep the active option reachable: the non-searchable list moves DOM focus (roving
  // tabIndex); the searchable list keeps focus in the filter input and just scrolls the highlight
  // into view (focus tracked via aria-activedescendant) so arrowing down a long list follows along.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const el = optionRefs.current[activeIndex]
    // scrollIntoView is unimplemented in jsdom — optional-chain the method so tests don't throw.
    if (searchable) el?.scrollIntoView?.({ block: 'nearest' })
    else el?.focus()
  }, [open, searchable, activeIndex])

  // Searchable: reset the highlight to the top of the filtered list when the query changes — but NOT
  // on open (handleTriggerClick seeds the highlight to the selected option there).
  const prevQueryRef = useRef(query)
  useEffect(() => {
    if (searchable && open && prevQueryRef.current !== query) {
      setActiveIndex(visibleOptions.length === 0 ? -1 : 0)
    }
    prevQueryRef.current = query
  }, [searchable, open, query, visibleOptions.length, setActiveIndex])

  // Clear the filter when the panel closes so reopening starts fresh.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const handleTriggerClick = () => {
    if (!disabled) {
      setOpen((p) => !p)
      // Open onto the selected option (or the first) so the roving focus / highlight has a home; with
      // no options there is nothing to focus, so leave the active index unset (-1).
      const selectedIndex = options.findIndex((o) => o.value === value)
      setActiveIndex(options.length === 0 ? -1 : selectedIndex >= 0 ? selectedIndex : 0)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={handleTriggerClick}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`
          w-full h-control py-control px-sm rounded-md text-sm
          bg-surface-raised border text-text-primary
          transition-colors duration-quick
          flex items-center justify-between gap-2
          focus:outline-none
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : open
              ? 'border-border-accent ring-2 ring-glow-accent'
              : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
          }
        `}
      >
        <span className={selectedOption ? 'text-text-primary' : 'text-text-muted'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon icon={ChevronDown} size={16} className={`transition-transform duration-quick ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-dropdown mt-1 w-full bg-surface-raised border border-border rounded-md shadow-lg"
          onKeyDown={onKeyDown}
        >
          {searchable && (
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-activedescendant={activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
              className="w-full h-control px-sm mb-sm rounded-md text-sm bg-surface-raised border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-border-accent"
            />
          )}

          <div className={searchable ? 'max-h-dropdown-panel overflow-y-auto' : undefined}>
            {visibleOptions.length === 0 ? (
              <div className="px-sm py-2 text-sm text-text-muted">No matches</div>
            ) : (
              visibleOptions.map((opt, i) => (
                <button
                  key={opt.value}
                  id={searchable ? `${baseId}-opt-${i}` : undefined}
                  ref={(el) => { optionRefs.current[i] = el }}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  tabIndex={!searchable && i === activeIndex ? 0 : -1}
                  className={`
                    w-full flex items-center justify-between px-sm py-2 text-sm
                    ${i === activeIndex ? 'bg-surface-active' : 'hover:bg-surface-hover'}
                    ${opt.value === value ? 'text-primary' : 'text-text-primary'}
                  `}
                  onClick={() => selectOption(opt.value)}
                >
                  <span>{opt.label}</span>
                  {opt.value === value && <Icon icon={Check} size={16} className="text-primary" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
