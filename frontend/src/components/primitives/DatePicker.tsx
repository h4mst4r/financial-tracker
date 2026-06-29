import { useState, useRef, useEffect } from 'react'
import {
  format,
  parseISO,
  isValid,
  addMonths,
  subMonths,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
} from 'date-fns'
import { CONTROL_ICON } from '../../config/iconRegistry'
import { Icon } from './Icon'
import { formatDateDisplay, parseDateInput } from '../../lib/date'
import { Portal } from './behaviors/Portal'
import { usePopover } from './behaviors/usePopover'
import { useAnchoredPosition } from './behaviors/useAnchoredPosition'
import { useField } from './behaviors/useField'

// DatePicker (UX §7/§8.2, bible §7 .datecal). A picker trigger (frontend.md §2.1) opening a calendar
// popover anchored below it (§0.10). Value in/out is an ISO `YYYY-MM-DD` string (storage/transport);
// the trigger renders it through the per-person display format (lib/date.ts). Month math uses the
// already-installed date-fns (no new dependency). Week starts Monday (bible M-T-W-T-F-S-S).

const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface DatePickerProps {
  /** ISO `YYYY-MM-DD`, or '' for unset. */
  value: string
  onChange: (iso: string) => void
  id?: string
  disabled?: boolean
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder = 'Select date',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The day cell under the keyboard cursor — focused on open and on every cursor move, so arrow-key
  // navigation actually drives DOM focus (roving focus, like Dropdown) instead of a detached highlight.
  const cursorRef = useRef<HTMLButtonElement>(null)

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : null
  // The month grid + keyboard cursor; seeded from the selected date or today.
  const [cursor, setCursor] = useState<Date>(selected ?? new Date())
  // The typeable input's text (UX line 437 "a typed date parses"); seeded from the formatted value,
  // committed to `onChange` on a valid parse. `focusedRef` guards the value→draft sync from clobbering
  // the user mid-type.
  const [draft, setDraft] = useState(() => (value ? formatDateDisplay(value) : ''))
  const focusedRef = useRef(false)

  // Field behavior: the controlled value contract (disabled-gated change).
  const field = useField<string>({ onChange, disabled })

  // Popover behavior: outside-click + Escape dismissal. Panel is PORTALLED (escapes a clipping modal) →
  // containment is the panel + the trigger in its separate subtree; anchored to the trigger rect.
  usePopover({ open, onClose: () => setOpen(false), containRef: panelRef, triggerRef })
  const pos = useAnchoredPosition(open, triggerRef, panelRef)

  // Seed the month grid + keyboard cursor to the selected date (or today) each time it opens.
  useEffect(() => {
    if (open) setCursor(selected ?? new Date())
    // `selected` is derived from `value`; depending on `value` avoids a new Date() identity loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value])

  // Move DOM focus to the cursor day whenever the calendar is open and the cursor changes.
  useEffect(() => {
    if (open) cursorRef.current?.focus()
  }, [open, cursor])

  // Sync the input to an externally-changed value, but never overwrite text the user is typing.
  useEffect(() => {
    if (!focusedRef.current) setDraft(value ? formatDateDisplay(value) : '')
  }, [value])

  // Commit a typed string: echo it, and on a valid parse push the ISO value up (mirrors the pickers).
  const commitTyped = (raw: string) => {
    setDraft(raw)
    const iso = parseDateInput(raw)
    if (iso) field.change(iso)
  }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  })

  const pick = (day: Date) => {
    const iso = format(day, ISO)
    field.change(iso)
    setDraft(formatDateDisplay(iso))
    setOpen(false)
  }

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    const moves: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    if (e.key in moves) {
      e.preventDefault()
      setCursor((c) => addDays(c, moves[e.key]))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(cursor)
    }
  }

  const today = new Date()

  return (
    <div className="relative">
      {/* Trigger = a typeable Field (UX line 437 "a typed date parses") + a Calendar-icon button that
          opens the MonthGrid popover (CONTROL_ICON.calendar, UX line 231 — not a chevron). The wrapper
          is the popover trigger-containment, so typing or clicking the icon never dismisses the calendar. */}
      <div
        ref={triggerRef}
        className={`
          flex h-control w-full items-center gap-1 rounded-md border bg-surface-raised pr-1 text-sm
          text-text-strong transition-colors duration-quick
          ${
            disabled
              ? 'disabled'
              : open
                ? 'border-border-accent ring-2 ring-glow-accent'
                : 'border-border hover:border-border-light focus-within:border-border-accent focus-within:ring-2 focus-within:ring-glow-accent'
          }
        `}
      >
        <input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => commitTyped(e.target.value)}
          onFocus={() => {
            focusedRef.current = true
          }}
          onBlur={() => {
            focusedRef.current = false
            // Revert an unparseable partial back to the committed value's display on blur.
            setDraft(value ? formatDateDisplay(value) : '')
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className="h-full min-w-0 flex-1 rounded-md bg-transparent px-sm text-text-strong placeholder:text-text-muted focus:outline-none"
        />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Open calendar"
          disabled={disabled}
          onClick={() => !disabled && setOpen((p) => !p)}
          className="shrink-0 rounded p-1 text-text-muted transition-colors duration-quick hover:text-text-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-accent"
        >
          <Icon icon={CONTROL_ICON.calendar} size={16} />
        </button>
      </div>

      {open && (
        <Portal>
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose a date"
          className="fixed z-popover w-date-picker bg-surface-raised border border-border rounded-md shadow-lg p-sm"
          style={{ left: pos.x, top: pos.y }}
        >
          {/* Month header — ‹ Month YYYY › */}
          <div className="flex items-center justify-between mb-sm">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor((c) => subMonths(c, 1))}
              className="text-text-default hover:text-text-strong hover:bg-surface-active rounded p-1 focus:outline-none"
            >
              <Icon icon={CONTROL_ICON.chevronLeft} size={16} />
            </button>
            <span className="text-sm font-medium text-text-strong">{format(cursor, 'MMMM yyyy')}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="text-text-default hover:text-text-strong hover:bg-surface-active rounded p-1 focus:outline-none"
            >
              <Icon icon={CONTROL_ICON.chevronRight} size={16} />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="text-center text-xs text-text-muted">
                {d}
              </span>
            ))}
          </div>

          {/* Day grid — the roving keyboard handler lives here (role="grid" supports it); focus rests on
              the cursor day button and arrow keys bubble up. */}
          <div role="grid" tabIndex={-1} onKeyDown={onGridKeyDown} className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const isSelected = selected != null && isSameDay(day, selected)
              const isToday = isSameDay(day, today)
              const outside = !isSameMonth(day, cursor)
              const isCursor = isSameDay(day, cursor)
              return (
                <button
                  key={day.toISOString()}
                  ref={isCursor ? cursorRef : undefined}
                  type="button"
                  tabIndex={isCursor ? 0 : -1}
                  aria-label={format(day, 'd MMMM yyyy')}
                  aria-pressed={isSelected}
                  onClick={() => pick(day)}
                  className={`
                    h-7 rounded text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-glow-accent
                    ${isSelected ? 'bg-primary text-on-primary font-medium' : 'hover:bg-surface-active'}
                    ${!isSelected && isToday ? 'text-accent font-semibold' : ''}
                    ${!isSelected && !isToday && outside ? 'text-text-muted' : ''}
                    ${!isSelected && !isToday && !outside ? 'text-text-strong' : ''}
                  `}
                >
                  {format(day, 'd')}
                </button>
              )
            })}
          </div>
        </div>
        </Portal>
      )}
    </div>
  )
}
