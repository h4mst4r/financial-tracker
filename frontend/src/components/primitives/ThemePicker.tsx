import { useState, useRef, useEffect } from 'react'
import { ACTION_ICON, CONTROL_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { THEME_OPTIONS } from '../../theme/palettes'
import type { ThemeId } from '../../theme/palettes'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'
import { useAnchoredPosition } from './behaviors/useAnchoredPosition'
import { useMenu } from './behaviors/useMenu'
import { useField } from './behaviors/useField'

interface ThemePickerProps {
  value: ThemeId
  onChange: (theme: ThemeId) => void
  id?: string
  disabled?: boolean
}

/** Swatch dot (UX §7 "ThemePicker — Dropdown + swatches"). Colour comes from the THEME_OPTIONS
 *  registry, never a raw hex in TSX (P4). */
function Swatch({ colour }: { colour: string }) {
  return (
    <span
      className="size-4 shrink-0 rounded-full border border-border"
      style={{ backgroundColor: colour }}
    />
  )
}

/**
 * ThemePicker (UX §5.1 Appearance, Story 2.9). A Dropdown-shaped listbox of the user-selectable
 * themes, each with its palette swatch. Mirrors the canonical picker trigger (frontend.md §2.1) and
 * the Dropdown keyboard/listbox behaviour; the persisted/live wiring lives in the consumer.
 */
export function ThemePicker({ value, onChange, id, disabled }: ThemePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selected = THEME_OPTIONS.find((o) => o.value === value)
  const selectedIndex = THEME_OPTIONS.findIndex((o) => o.value === value)

  // Field behavior: the controlled value contract (disabled-gated change).
  const field = useField<ThemeId>({ onChange, disabled })

  const selectTheme = (optValue: ThemeId) => {
    field.change(optValue)
    setOpen(false)
  }

  // Menu behavior: roving keyboard (↑↓ Enter Esc) over the theme list (focus reflected via roving tabIndex).
  const { activeIndex, setActiveIndex, onKeyDown } = useMenu({
    itemCount: THEME_OPTIONS.length,
    onActivate: (i) => selectTheme(THEME_OPTIONS[i].value),
    onClose: () => setOpen(false),
  })

  // Popover behavior: outside-click + Escape dismissal, anchored to the trigger+panel wrapper.
  // Panel is PORTALLED (escapes a clipping modal) → containment is the panel + the trigger; anchored.
  usePopover({ open, onClose: () => setOpen(false), containRef: panelRef, triggerRef })
  const pos = useAnchoredPosition(open, triggerRef, panelRef)

  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const handleTriggerClick = () => {
    if (disabled) return
    setOpen((p) => !p)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`
          w-full h-control py-control px-sm rounded-md text-sm
          bg-surface-raised border text-text-strong
          transition-colors duration-quick
          flex items-center justify-between gap-2
          focus:outline-none
          ${disabled
            ? 'disabled'
            : open
              ? 'border-border-accent ring-2 ring-glow-accent'
              : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
          }
        `}
      >
        <span className="flex items-center gap-2">
          {selected && <Swatch colour={selected.swatch} />}
          <span className={selected ? 'text-text-strong' : 'text-text-muted'}>
            {selected ? selected.label : 'Select a theme'}
          </span>
        </span>
        <Icon icon={CONTROL_ICON.chevronDown} size={16} className={`transition-transform duration-quick ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <Portal>
        <div
          ref={panelRef}
          role="listbox"
          className="fixed z-popover bg-surface-raised border border-border rounded-md shadow-lg"
          style={{ left: pos.x, top: pos.y, width: pos.width }}
          onKeyDown={onKeyDown}
        >
          {THEME_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              ref={(el) => { optionRefs.current[i] = el }}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              tabIndex={i === activeIndex ? 0 : -1}
              className={`
                w-full flex items-center justify-between px-sm py-2 text-sm
                ${i === activeIndex ? 'bg-surface-active' : 'hover:bg-surface-hover'}
                ${opt.value === value ? 'text-primary' : 'text-text-strong'}
              `}
              onClick={() => selectTheme(opt.value)}
            >
              <span className="flex items-center gap-2">
                <Swatch colour={opt.swatch} />
                {opt.label}
              </span>
              {opt.value === value && <Icon icon={ACTION_ICON.select} size={16} className="text-primary" />}
            </button>
          ))}
        </div>
        </Portal>
      )}
    </div>
  )
}
