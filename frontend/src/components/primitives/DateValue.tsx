import { formatDateDisplay, type DisplayFormat } from '../../lib/date'

// DateValue (UX §7 / Layer-2 value atoms): renders an ISO date via the per-person `display_format`
// (FR-P-009) — never a hand-built date string (L11). Wraps the locked `formatDateDisplay` formatter; it
// does not re-implement date formatting. `null` → `—` at `text-muted`.

export interface DateValueProps {
  /** ISO `YYYY-MM-DD`; `null` → `—`. */
  iso: string | null
  /** Overrides the per-person display format (defaults to the current person's preference). */
  format?: DisplayFormat
  className?: string
}

const cx = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ')

export function DateValue({ iso, format, className }: DateValueProps) {
  if (iso === null) {
    return <span className={cx('text-text-muted', className)}>—</span>
  }
  const text = formatDateDisplay(iso, format)
  return (
    <span className={className} title={text}>
      {text}
    </span>
  )
}
