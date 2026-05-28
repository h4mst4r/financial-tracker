/**
 * Currency formatting utilities.
 * All monetary values in the application should be formatted through this module.
 */

/**
 * Format a monetary value for display.
 *
 * @param value - The numeric amount to format
 * @param currency - The ISO 4217 currency code of the value (e.g., 'SGD')
 * @param displayCurrency - Optional override for display locale currency
 *                          If omitted, uses `currency` as the display currency
 * @returns Formatted string, e.g., "$1,234.56" or "SGD 1,234.56"
 */
export function formatMoney(
  value: number | null | undefined,
  currency: string = 'USD',
  displayCurrency?: string,
): string {
  if (value == null) return ''

  const displayCcy = displayCurrency ?? currency

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: displayCcy,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4, // Backend stores Decimal(15,4)
    }).format(value)
  } catch {
    // Fallback for unsupported currency codes
    return `${displayCcy} ${value.toFixed(2)}`
  }
}

/**
 * Format a monetary value with explicit currency code prefix.
 * Useful when the currency may differ from the user's locale.
 *
 * @returns e.g., "SGD 1,234.56"
 */
export function formatMoneyWithCode(
  value: number | null | undefined,
  currency: string = 'USD',
): string {
  if (value == null) return ''

  return `${currency} ${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`
}
