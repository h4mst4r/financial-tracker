// NumberValue (UX §7 / Layer-2 value atoms): a non-money figure — comma thousands · dot decimal ·
// caller-set decimal places · optional prefix/suffix (e.g. "%") · optional sign colour. Renders the
// value it is handed, no data fetching (L11 — no raw `.toLocaleString`/`.toFixed` at the call site).
// `null` → `—` at `text-muted`.

export interface NumberValueProps {
  /** The figure; a string is coerced (Decimal on the wire stays a string upstream). `null` → `—`. */
  value: number | string | null
  /** Fixed decimal places (default 0). */
  decimals?: number
  prefix?: string
  suffix?: string
  /** Tint negative red / positive green (§4/§12.1). Opt-in. */
  signColour?: boolean
  /** Render a leading `+` for positives. Negatives always show `−` (U+2212). */
  showSign?: boolean
  className?: string
}

const cx = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ')

export function NumberValue({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  signColour,
  showSign,
  className,
}: NumberValueProps) {
  if (value === null) {
    return <span className={cx('text-text-muted', className)}>—</span>
  }
  const n = Number(value)
  const sign = Number.isFinite(n) ? Math.sign(n) : 0
  const abs = new Intl.NumberFormat('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(n))
  const signStr = sign < 0 ? '−' : showSign && sign > 0 ? '+' : ''
  const text = `${signStr}${prefix}${abs}${suffix}`
  const colourCls = signColour
    ? sign < 0
      ? 'text-error'
      : sign > 0
        ? 'text-success'
        : undefined
    : undefined
  return (
    <span className={cx(colourCls, className)} title={text}>
      {text}
    </span>
  )
}
