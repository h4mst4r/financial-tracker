import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { Icon } from './Icon'
import { THEME_OPTIONS } from '../../theme/palettes'
import type { ThemeId } from '../../theme/palettes'

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
  const [activeIndex, setActiveIndex] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selected = THEME_OPTIONS.find((o) => o.value === value)
  const selectedIndex = THEME_OPTIONS.findIndex((o) => o.value === value)

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleOutsideClick, handleKeyDown])

  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const handleTriggerClick = () => {
    if (disabled) return
    setOpen((p) => !p)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
  }

  const handleOptionClick = (optValue: ThemeId) => {
    onChange(optValue)
    setOpen(false)
  }

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, THEME_OPTIONS.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      handleOptionClick(THEME_OPTIONS[activeIndex].value)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={handleTriggerClick}
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
        <span className="flex items-center gap-2">
          {selected && <Swatch colour={selected.swatch} />}
          <span className={selected ? 'text-text-primary' : 'text-text-muted'}>
            {selected ? selected.label : 'Select a theme'}
          </span>
        </span>
        <Icon icon={ChevronDown} size={16} className={`transition-transform duration-quick ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-dropdown mt-1 w-full bg-surface-raised border border-border rounded-md shadow-lg"
          onKeyDown={handlePanelKeyDown}
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
                ${opt.value === value ? 'text-primary' : 'text-text-primary'}
              `}
              onClick={() => handleOptionClick(opt.value)}
            >
              <span className="flex items-center gap-2">
                <Swatch colour={opt.swatch} />
                {opt.label}
              </span>
              {opt.value === value && <Icon icon={Check} size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
