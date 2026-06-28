import { currencySymbol } from '../../lib/currency'

// MonetaryValue (UX §7 / Layer-2 value atoms): the money-display counterpart to MonetaryValueInput.
// It renders the amount+currency it is handed and NEVER fetches data — layer (native/base/display) is
// the caller's choice. `amount` is a STRING (Decimal on the wire — never a JS float for money); it is
// coerced to a number only inside Intl.NumberFormat for display. The atom owns the §7 LOCKED format so
// no figure is hand-formatted at a call site (L11).

interface DualSide {
  amount: string
  currency: string
  /** Household-configured symbol; falls back to the ISO narrow symbol. */
  symbol?: string
}

export interface MonetaryValueProps {
  /** Decimal string; `null` → `—` at `text-muted` (§7). */
  amount: string | null
  /** ISO currency code — drives the Intl minor-units (dp) and the default symbol. */
  currency: string
  /** Household-configured display symbol (e.g. "S$"); falls back to the ISO narrow symbol. */
  symbol?: string
  /** `columnar` = mono/tabular (ledgers/tables) · `hero` = sans (standalone card figures, the default). */
  variant?: 'columnar' | 'hero'
  /** Tint outflow `−` red / inflow `+` green by sign (§4/§12.1). Opt-in. */
  signColour?: boolean
  /** Render a leading `+` for positives (signed-delta contexts like ROI). Negatives always show `−`. */
  showSign?: boolean
  /** Cross-currency form "S$ 500 → NZD 568" — the destination side; this atom owns the single arrow. */
  dual?: DualSide
  className?: string
  /** Overrides the hover-reveal title (defaults to the full formatted figure). */
  title?: string
}

// The currency's Intl minor-units (fiat 2; JPY/KRW 0); falls back to 2 for a code Intl doesn't know.
function minorUnits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

// "[sign]S$ 1,234.50" — symbol prefix + space, comma thousands · dot decimal, currency minor-units dp,
// leading − (U+2212, never a hyphen/parentheses) for negatives, opt-in leading + for positives.
function formatMoney(amount: string, currency: string, symbol: string | undefined, showSign: boolean): {
  text: string
  sign: number
} {
  const n = Number(amount)
  const sign = Number.isFinite(n) ? Math.sign(n) : 0
  const dp = minorUnits(currency)
  const abs = new Intl.NumberFormat('en', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(
    Math.abs(n),
  )
  const sym = symbol ?? currencySymbol(currency)
  const prefix = sign < 0 ? '−' : showSign && sign > 0 ? '+' : ''
  return { text: `${prefix}${sym} ${abs}`, sign }
}

const cx = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ')

export function MonetaryValue({
  amount,
  currency,
  symbol,
  variant = 'hero',
  signColour,
  showSign,
  dual,
  className,
  title,
}: MonetaryValueProps) {
  if (amount === null) {
    return <span className={cx('text-text-muted', className)}>—</span>
  }

  const fontCls = variant === 'columnar' ? 'monetary-value' : undefined
  const main = formatMoney(amount, currency, symbol, showSign ?? false)
  const colourCls = signColour
    ? main.sign < 0
      ? 'text-error'
      : main.sign > 0
        ? 'text-success'
        : undefined
    : undefined

  const full = dual
    ? `${main.text} → ${formatMoney(dual.amount, dual.currency, dual.symbol, false).text}`
    : main.text

  return (
    <span className={cx(fontCls, colourCls, className)} title={title ?? full}>
      {full}
    </span>
  )
}
