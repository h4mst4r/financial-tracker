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
import { formatDateDisplay } from '../../lib/date'
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The day cell under the keyboard cursor — focused on open and on every cursor move, so arrow-key
  // navigation actually drives DOM focus (roving focus, like Dropdown) instead of a detached highlight.
  const cursorRef = useRef<HTMLButtonElement>(null)

  const selected = value && isValid(parseISO(value)) ? parseISO(value) : null
  // The month grid + keyboard cursor; seeded from the selected date or today.
  const [cursor, setCursor] = useState<Date>(selected ?? new Date())

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

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
  })

  const pick = (day: Date) => {
    field.change(format(day, ISO))
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
          flex items-center justify-between gap-2
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
        <span className={selected ? 'text-text-strong' : 'text-text-muted'}>
          {selected ? formatDateDisplay(value) : placeholder}
        </span>
        <Icon icon={CONTROL_ICON.chevronRight} size={16} className="text-text-muted rotate-90" />
      </button>

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
