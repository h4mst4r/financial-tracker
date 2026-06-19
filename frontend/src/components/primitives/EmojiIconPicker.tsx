import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  House, Car, ShoppingCart, Utensils, Plane, Heart, Gift, Briefcase,
  GraduationCap, Zap, PiggyBank, TrendingUp, X, type LucideIcon,
} from 'lucide-react'
import { Icon } from './Icon'
import { api } from '../../api/client'

// EmojiIconPicker (UX §8.3). The glyph picker for entities with a custom glyph (categories only).
// A picker trigger opening a panel with two tabs — Emojis | Icons — a search field, a glyph grid,
// a "clear" affordance, and a per-person **Recent** row (last-8 picked glyphs, `recent_glyphs`).
//
// Glyph storage: emojis are the raw unicode char; Lucide icons are stored as `lucide:<name>` so the
// shared `GlyphView` can render them with `currentColor`. The same `GlyphView` renders glyphs in the
// CategoryTree and the Recent row.

const LUCIDE_GLYPHS: Record<string, LucideIcon> = {
  house: House, car: Car, cart: ShoppingCart, food: Utensils, plane: Plane,
  heart: Heart, gift: Gift, work: Briefcase, school: GraduationCap, power: Zap,
  savings: PiggyBank, growth: TrendingUp,
}

const EMOJI_GLYPHS: { char: string; keywords: string }[] = [
  { char: '🍔', keywords: 'food burger dining' },
  { char: '🛒', keywords: 'groceries cart shopping' },
  { char: '🚇', keywords: 'transport train metro' },
  { char: '🏠', keywords: 'house home housing' },
  { char: '💡', keywords: 'utilities power light' },
  { char: '🏥', keywords: 'health hospital medical' },
  { char: '🛍', keywords: 'shopping bags retail' },
  { char: '🎬', keywords: 'entertainment movie film' },
  { char: '🛡', keywords: 'insurance shield protection' },
  { char: '🎓', keywords: 'education school graduation' },
  { char: '💰', keywords: 'salary money income' },
  { char: '📈', keywords: 'investment growth chart' },
  { char: '📦', keywords: 'misc box package' },
  { char: '✈', keywords: 'travel plane flight' },
  { char: '🍷', keywords: 'drink wine alcohol' },
  { char: '☕', keywords: 'coffee cafe drink' },
  { char: '🚗', keywords: 'car vehicle auto' },
  { char: '⛽', keywords: 'fuel petrol gas' },
  { char: '🐶', keywords: 'pet dog animal' },
  { char: '🎁', keywords: 'gift present birthday' },
  { char: '💳', keywords: 'card credit payment' },
  { char: '📱', keywords: 'phone mobile tech' },
  { char: '🏋', keywords: 'gym fitness sport' },
  { char: '✂', keywords: 'haircut grooming barber' },
]

const LUCIDE_PREFIX = 'lucide:'

/** Render a stored glyph — a Lucide icon (`lucide:<name>`) or a raw emoji char. Shared by the
 *  picker grid, the Recent row, and the CategoryTree rows so the format stays in one place.
 *  Lucide icons render in the themed text colour (`currentColor`, default `text-text-primary` — so
 *  they're white on dark / dark on light, UX §8.3); emojis are full-colour unicode. `className`
 *  overrides the icon colour (e.g. contrast-aware text on a vivid fill). */
export function GlyphView({
  glyph,
  size = 18,
  className,
}: {
  glyph: string
  size?: number
  className?: string
}) {
  if (glyph.startsWith(LUCIDE_PREFIX)) {
    const lucide = LUCIDE_GLYPHS[glyph.slice(LUCIDE_PREFIX.length)]
    return lucide ? <Icon icon={lucide} size={size} className={className ?? 'text-text-primary'} /> : null
  }
  return <span style={{ fontSize: size }}>{glyph}</span>
}

interface EmojiIconPickerProps {
  value: string | null
  onChange: (glyph: string | null) => void
  id?: string
  disabled?: boolean
}

type Tab = 'emojis' | 'icons'

export function EmojiIconPicker({ value, onChange, id, disabled }: EmojiIconPickerProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('emojis')
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const recent = useQuery({
    queryKey: ['recent-glyphs'],
    queryFn: async () => (await api.get<{ glyphs: string[] }>('/api/profile/recent-glyphs')).data.glyphs,
    // Only fetch once the panel is opened — avoids an authed request on every render (and a 401→/login
    // redirect from the DEV /design-system demo where the component renders unopened).
    enabled: open,
  })
  const pushRecent = useMutation({
    mutationFn: async (glyph: string) =>
      (await api.post<{ glyphs: string[] }>('/api/profile/recent-glyphs', { glyph })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recent-glyphs'] }),
  })

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

  const pick = (glyph: string) => {
    onChange(glyph)
    pushRecent.mutate(glyph)
    setOpen(false)
  }

  const q = search.trim().toLowerCase()
  const emojiCells = EMOJI_GLYPHS.filter((e) => !q || e.keywords.includes(q)).map((e) => e.char)
  const iconCells = Object.keys(LUCIDE_GLYPHS)
    .filter((name) => !q || name.includes(q))
    .map((name) => LUCIDE_PREFIX + name)
  const cells = tab === 'emojis' ? emojiCells : iconCells

  const tabClass = (isActive: boolean) =>
    `flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none ${
      isActive
        ? 'bg-accent-active text-accent font-medium'
        : 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
    }`
  const cellClass = (isSelected: boolean) =>
    `flex items-center justify-center size-9 rounded transition-transform hover:scale-110 hover:bg-surface-active focus:outline-none ${
      isSelected ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''
    }`

  const recentGlyphs = recent.data ?? []

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
        <span className="flex items-center justify-center size-5 shrink-0">
          {value ? <GlyphView glyph={value} size={18} /> : null}
        </span>
        <span className={`flex-1 text-left ${value ? 'text-text-primary' : 'text-text-muted'}`}>
          {value ? 'Glyph' : 'Choose an icon'}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose an icon"
          className="absolute z-dropdown mt-1 w-max min-w-picker bg-surface-raised border border-border rounded-md shadow-lg p-sm"
        >
          <div className="flex gap-1 mb-sm">
            <button type="button" className={tabClass(tab === 'emojis')} onClick={() => setTab('emojis')}>
              Emojis
            </button>
            <button type="button" className={tabClass(tab === 'icons')} onClick={() => setTab('icons')}>
              Icons
            </button>
          </div>

          <input
            type="text"
            value={search}
            spellCheck={false}
            placeholder="Search…"
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-control px-sm mb-sm rounded-md text-sm bg-surface-raised border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-border-accent"
          />

          {/* Recent row — the last-8 picked glyphs, no label, separated by a bottom border
              (bible `.recent-row`). Hidden until the person has ever picked one. */}
          {recentGlyphs.length > 0 && q === '' && (
            <div className="flex flex-wrap gap-1 mb-sm pb-sm border-b border-border">
              {recentGlyphs.map((glyph) => (
                <button
                  key={glyph}
                  type="button"
                  aria-label={glyph}
                  onClick={() => pick(glyph)}
                  className={cellClass(value === glyph)}
                >
                  <GlyphView glyph={glyph} />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-8 gap-1">
            {cells.map((glyph) => (
              <button
                key={glyph}
                type="button"
                aria-label={glyph}
                onClick={() => pick(glyph)}
                className={cellClass(value === glyph)}
              >
                <GlyphView glyph={glyph} />
              </button>
            ))}
          </div>

          {value !== null && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="flex items-center gap-1 mt-sm pt-sm border-t border-border w-full text-xs text-text-secondary hover:text-text-primary focus:outline-none"
            >
              <Icon icon={X} size={14} /> Clear glyph
            </button>
          )}
        </div>
      )}
    </div>
  )
}
