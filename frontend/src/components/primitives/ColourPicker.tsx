import { useState, useRef, useEffect, useCallback } from 'react'
import { Toggle } from './Toggle'

// ColourPicker (UX §8.2). A picker trigger (frontend.md §2.1) opening a panel with two tabs —
// Palette | Hex — plus a per-instance **vivid** toggle. The selected colour is a hex string
// (`value`/`onChange`); the persisted/live wiring lives in the consumer (e.g. the category modal).
//
// Swatch hexes are DATA (the curated palette of suggested colours, like ThemePicker's `swatch`
// registry), applied via inline `style` — not styling tokens. The themed fill preview reads the
// `--entity-colour` variable through the `bg-entity-fill-*` utilities (P4).

// Curated 16-swatch palette — the bible's ColourPicker set (design-bible §7, 8 cols × 2 rows).
const PALETTE = [
  '#6366f1', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e',
  '#ef4444', '#3b82f6', '#a855f7', '#64748b', '#0ea5e9', '#84cc16', '#eab308', '#fb7185',
] as const

const HEX_RE = /^#[0-9a-fA-F]{6}$/

interface ColourPickerProps {
  value: string
  onChange: (hex: string) => void
  vivid: boolean
  onVividChange: (vivid: boolean) => void
  id?: string
  disabled?: boolean
}

type Tab = 'palette' | 'hex'

export function ColourPicker({
  value,
  onChange,
  vivid,
  onVividChange,
  id,
  disabled,
}: ColourPickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('palette')
  const [hexDraft, setHexDraft] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }, [])

  useEffect(() => {
    if (open) {
      setHexDraft(value)
      document.addEventListener('mousedown', handleOutsideClick)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, value, handleOutsideClick, handleKeyDown])

  const commitHex = (raw: string) => {
    setHexDraft(raw)
    if (HEX_RE.test(raw)) onChange(raw)
  }

  const tabClass = (isActive: boolean) =>
    `flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none ${
      isActive
        ? 'bg-accent-active text-accent font-medium'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
    }`

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={`
          w-full h-control py-control px-sm rounded-md text-sm
          bg-surface-raised border text-text-primary
          transition-colors duration-quick
          flex items-center gap-2
          focus:outline-none
          ${
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : open
                ? 'border-border-accent ring-2 ring-glow-accent'
                : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
          }
        `}
      >
        <span
          className={`size-5 shrink-0 rounded-full border border-border ${vivid ? 'bg-entity-fill-vivid' : 'bg-entity-fill-calm'}`}
          style={{ '--entity-colour': value } as React.CSSProperties}
        />
        <span className="flex-1 text-left">
          {value}
          {vivid && <span className="text-text-secondary"> · vivid</span>}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a colour"
          className="absolute z-dropdown mt-1 w-max min-w-picker bg-surface-raised border border-border rounded-md shadow-lg p-sm"
        >
          <div className="flex gap-1 mb-sm">
            <button type="button" className={tabClass(tab === 'palette')} onClick={() => setTab('palette')}>
              Palette
            </button>
            <button type="button" className={tabClass(tab === 'hex')} onClick={() => setTab('hex')}>
              Hex
            </button>
          </div>

          {tab === 'palette' ? (
            <div className="grid grid-cols-8 gap-1.5">
              {PALETTE.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  aria-label={hex}
                  onClick={() => onChange(hex)}
                  style={{ backgroundColor: hex }}
                  className={`size-6 rounded-full transition-transform hover:scale-110 focus:outline-none ${
                    value.toLowerCase() === hex
                      ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised'
                      : ''
                  }`}
                />
              ))}
            </div>
          ) : (
            // Hex tab: the native colour input IS a true colour wheel/gradient (the OS picker), paired
            // with a hex text field for precise entry — both write `value` (UX §8.2). No library.
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Colour wheel"
                value={HEX_RE.test(hexDraft) ? hexDraft : value}
                onChange={(e) => commitHex(e.target.value)}
                className="h-control w-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface-raised p-1"
              />
              <input
                type="text"
                value={hexDraft}
                spellCheck={false}
                placeholder="#3b82f6"
                onChange={(e) => commitHex(e.target.value)}
                className="w-full h-control px-sm rounded-md text-sm bg-surface-raised border border-border text-text-primary focus:outline-none focus:ring-2 focus:ring-glow-primary focus:border-border-focus"
              />
            </div>
          )}

          <div className="flex items-center justify-between mt-sm pt-sm border-t border-border">
            <span className="text-xs text-text-secondary">Vivid fill</span>
            <Toggle checked={vivid} onChange={onVividChange} aria-label="Vivid fill" />
          </div>
        </div>
      )}
    </div>
  )
}
