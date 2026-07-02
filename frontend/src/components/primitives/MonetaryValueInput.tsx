import { Dropdown } from './Dropdown'
import { Input } from './Input'

// MonetaryValueInput (UX §7/§8.2, bible §7 .mvinput): a currency selector + a mono numeric amount,
// side by side. Controlled — `currency` + `amount` in, change callbacks out. The amount is a STRING
// (Decimal on the wire — never a JS float for money; the consumer sends it as-is). Currency options
// are the household's currency codes, supplied by the consumer (no query coupling in the primitive).

interface MonetaryValueInputProps {
  amount: string
  currency: string
  /** Household currency codes (e.g. ['SGD','USD']). */
  currencyOptions: string[]
  onAmountChange: (amount: string) => void
  onCurrencyChange: (currency: string) => void
  id?: string
  disabled?: boolean
  placeholder?: string
  /** Error-ring the amount input (UX §6 form validation). */
  error?: boolean
}

export function MonetaryValueInput({
  amount,
  currency,
  currencyOptions,
  onAmountChange,
  onCurrencyChange,
  id,
  disabled,
  placeholder = '0.00',
  error,
}: MonetaryValueInputProps) {
  const options = currencyOptions.map((code) => ({ value: code, label: code }))
  return (
    <div className="flex items-stretch gap-2">
      <div className="w-currency-select shrink-0">
        <Dropdown
          value={currency}
          options={options}
          onChange={onCurrencyChange}
          disabled={disabled}
        />
      </div>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={amount}
        disabled={disabled}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder={placeholder}
        error={error}
        className="font-mono"
      />
    </div>
  )
}
