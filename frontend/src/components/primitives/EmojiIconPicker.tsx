import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ACTION_ICON } from '../../config/iconRegistry'
import { CATEGORY_GLYPHS } from '../../config/categoryIcons'
import { Icon } from './Icon'
import { api } from '../../api/client'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'
import { useAnchoredPosition } from './behaviors/useAnchoredPosition'
import { useField } from './behaviors/useField'

// EmojiIconPicker (UX §8.3). The glyph picker for entities with a custom glyph (categories only).
// A picker trigger opening a panel with two tabs — Emojis | Icons — a search field, a glyph grid,
// a "clear" affordance, and a per-person **Recent** row (last-8 picked glyphs, `recent_glyphs`).
//
// Glyph storage: emojis are the raw unicode char; Lucide icons are stored as `lucide:<name>` so the
// shared `GlyphView` can render them with `currentColor`. The same `GlyphView` renders glyphs in the
// CategoryTree and the Recent row.

// The category-glyph library lives in the icon registry (config/categoryIcons.ts; UX §11). Aliased
// here so the GlyphView lookups below read unchanged.
const LUCIDE_GLYPHS = CATEGORY_GLYPHS

const EMOJI_GLYPHS: { char: string; keywords: string }[] = [
  // Food & drink
  { char: '🍔', keywords: 'food burger dining' },
  { char: '🍕', keywords: 'food pizza dining' },
  { char: '🍜', keywords: 'food noodles ramen dining' },
  { char: '🍣', keywords: 'food sushi dining restaurant' },
  { char: '🥗', keywords: 'food salad healthy' },
  { char: '🍞', keywords: 'food bread bakery' },
  { char: '🛒', keywords: 'groceries cart shopping' },
  { char: '🍰', keywords: 'snacks cake dessert sweets' },
  { char: '🍫', keywords: 'snacks chocolate sweets' },
  { char: '☕', keywords: 'coffee cafe drink' },
  { char: '🥤', keywords: 'drink soda beverage' },
  { char: '🍷', keywords: 'drink wine alcohol' },
  { char: '🍺', keywords: 'drink beer alcohol' },
  // Shopping
  { char: '🛍', keywords: 'shopping bags retail' },
  { char: '👕', keywords: 'clothes shirt apparel fashion' },
  { char: '👟', keywords: 'shoes sneakers footwear' },
  { char: '👜', keywords: 'accessories bag handbag' },
  { char: '💄', keywords: 'beauty cosmetics makeup' },
  { char: '🧴', keywords: 'health beauty toiletries skincare' },
  { char: '🧸', keywords: 'kids toys children' },
  { char: '🛋', keywords: 'home decor furniture interior' },
  { char: '🪴', keywords: 'garden plant equipment outdoor' },
  { char: '🧹', keywords: 'cleaning equipment household chores' },
  { char: '🔧', keywords: 'diy tools hardware repair' },
  { char: '🐶', keywords: 'pet dog animal' },
  { char: '🐱', keywords: 'pet cat animal' },
  { char: '💻', keywords: 'electronics laptop computer tech' },
  { char: '📱', keywords: 'electronics phone mobile tech' },
  { char: '🍳', keywords: 'kitchen homeware cookware' },
  { char: '🎁', keywords: 'gift present birthday' },
  { char: '✏', keywords: 'stationery pen tools office' },
  { char: '💊', keywords: 'medical medicine pharmacy' },
  { char: '🎮', keywords: 'games hardware software gaming' },
  // Housing
  { char: '🏠', keywords: 'house home housing' },
  { char: '🏢', keywords: 'rent apartment building' },
  { char: '🏦', keywords: 'mortgage bank loan' },
  { char: '💡', keywords: 'utilities power light electricity' },
  { char: '🌐', keywords: 'internet wifi broadband network' },
  { char: '🛠', keywords: 'maintenance repair services handyman' },
  { char: '🚰', keywords: 'water utilities plumbing' },
  // Transport & vehicle
  { char: '🚇', keywords: 'transport train metro subway public' },
  { char: '🚌', keywords: 'bus public transport' },
  { char: '🚕', keywords: 'taxi cab ride' },
  { char: '✈', keywords: 'travel plane flight holiday long distance' },
  { char: '🚗', keywords: 'car vehicle auto' },
  { char: '⛽', keywords: 'fuel petrol gas diesel' },
  { char: '🅿', keywords: 'parking car park' },
  { char: '🚲', keywords: 'bike bicycle cycling' },
  // Life & entertainment
  { char: '🏥', keywords: 'healthcare hospital gp medical doctor' },
  { char: '💆', keywords: 'wellness beauty spa relax' },
  { char: '🏋', keywords: 'fitness gym sport workout' },
  { char: '⚽', keywords: 'sports football soccer fitness' },
  { char: '🎬', keywords: 'movies film cinema entertainment' },
  { char: '🎭', keywords: 'culture events theatre arts' },
  { char: '🎨', keywords: 'hobbies art craft painting' },
  { char: '🎓', keywords: 'education school development learning' },
  { char: '📚', keywords: 'books reading library' },
  { char: '🔔', keywords: 'subscription membership recurring' },
  { char: '📺', keywords: 'tv streaming television media' },
  { char: '🏖', keywords: 'holiday vacation beach travel' },
  { char: '🎵', keywords: 'music audio entertainment' },
  // Communication
  { char: '📞', keywords: 'phone call communication' },
  { char: '📮', keywords: 'postal mail post letter' },
  // Financial
  { char: '🧾', keywords: 'taxes receipt bill financial' },
  { char: '🛡', keywords: 'insurance shield protection' },
  { char: '🏛', keywords: 'loan interest bank legal financial' },
  { char: '⚖', keywords: 'fines legal penalty law' },
  { char: '💸', keywords: 'fees charges expenses' },
  { char: '👶', keywords: 'child support kids family' },
  { char: '💰', keywords: 'salary money income financial' },
  { char: '📈', keywords: 'investment growth chart dividends' },
  { char: '🏘', keywords: 'rental income property' },
  { char: '💵', keywords: 'wages cash salary pay' },
  { char: '💹', keywords: 'interest dividends returns financial' },
  { char: '🎗', keywords: 'dues grants donation' },
  { char: '↩', keywords: 'refunds returns reimbursement' },
  // Misc
  { char: '📦', keywords: 'misc box package other relocation moving' },
  { char: '⭐', keywords: 'favourite star important' },
]

const LUCIDE_PREFIX = 'lucide:'

/** Render a stored glyph — a Lucide icon (`lucide:<name>`) or a raw emoji char. Shared by the
 *  picker grid, the Recent row, and the CategoryTree rows so the format stays in one place.
 *  Lucide icons render in the themed text colour (`currentColor`, default `text-text-strong` — so
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
    return lucide ? <Icon icon={lucide} size={size} className={className ?? 'text-text-strong'} /> : null
  }
  return (
    <span className="font-emoji" style={{ fontSize: size, lineHeight: 1 }}>
      {glyph}
    </span>
  )
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
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

  // Field behavior: the controlled value contract (disabled-gated change).
  const field = useField<string | null>({ onChange, disabled })

  // Popover behavior: outside-click + Escape dismissal, anchored to the trigger+panel wrapper.
  // Panel is PORTALLED (escapes a clipping modal) → containment is the panel + the trigger; anchored.
  usePopover({ open, onClose: () => setOpen(false), containRef: panelRef, triggerRef })
  const pos = useAnchoredPosition(open, triggerRef, panelRef)

  const pick = (glyph: string) => {
    field.change(glyph)
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
        : 'text-text-default hover:text-text-strong hover:bg-surface-active'
    }`
  const cellClass = (isSelected: boolean) =>
    `flex items-center justify-center size-9 rounded transition-transform hover:scale-110 hover:bg-surface-active focus:outline-none ${
      isSelected ? 'ring-2 ring-offset-1 ring-accent ring-offset-surface-raised' : ''
    }`

  const recentGlyphs = recent.data ?? []

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={`
          w-full h-control py-control px-sm rounded-md text-sm
          bg-surface-raised border text-text-strong
          transition-colors duration-quick
          flex items-center gap-2
          focus:outline-none
          ${
            disabled
              ? 'disabled'
              : open
                ? 'border-border-accent ring-2 ring-glow-accent'
                : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-border-accent'
          }
        `}
      >
        <span className="flex items-center justify-center size-5 shrink-0">
          {value ? <GlyphView glyph={value} size={18} /> : null}
        </span>
        <span className={`flex-1 text-left ${value ? 'text-text-strong' : 'text-text-muted'}`}>
          {value ? 'Glyph' : 'Choose an icon'}
        </span>
      </button>

      {open && (
        <Portal>
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose an icon"
          className="fixed z-popover w-max min-w-picker bg-surface-raised border border-border rounded-md shadow-lg p-sm"
          style={{ left: pos.x, top: pos.y }}
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
            className="w-full h-control px-sm mb-sm rounded-md text-sm bg-surface-raised border border-border text-text-strong focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-border-accent"
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

          <div className="grid grid-cols-8 gap-1 max-h-glyph-grid overflow-y-auto pr-1">
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
                field.change(null)
                setOpen(false)
              }}
              className="flex items-center gap-1 mt-sm pt-sm border-t border-border w-full text-xs text-text-default hover:text-text-strong focus:outline-none"
            >
              <Icon icon={ACTION_ICON.close} size={14} /> Clear glyph
            </button>
          )}
        </div>
        </Portal>
      )}
    </div>
  )
}
