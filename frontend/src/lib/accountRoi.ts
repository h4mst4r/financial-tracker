import { convertForDisplay } from './currency'
import type { Account } from '../types/account'
import type { Currency } from '../types/currency'

// Derived ROI for a capital account = current value − cost basis (Story 4.8), shared by the card
// sub-line (AccountsList) and the §8.2b detail-view ROI row so the two can't drift (Story 4.11).
//
// Both legs are first brought into the account's NATIVE currency: cost_basis is already native, and a
// current value reported in a different snapshot currency is converted to native before the subtraction
// (Story 4.11 relaxed Story 4.8's same-currency guard — a cross-currency current value now yields a
// meaningful ROI instead of being suppressed). The resulting delta is then shown in the active display
// currency. `null` when the account isn't capital or lacks the inputs.
export function computeRoi(
  account: Account,
  currencies: Currency[],
  displayCurrency: string,
): { delta: number; code: string } | null {
  if (account.account_type !== 'capital') return null
  if (
    account.cost_basis == null ||
    account.current_value == null ||
    account.current_value_currency == null
  )
    return null
  const currentNative = convertForDisplay(
    account.current_value,
    account.current_value_currency,
    account.currency,
    currencies,
  )
  const deltaNative = currentNative.value - Number(account.cost_basis)
  const display = convertForDisplay(String(deltaNative), account.currency, displayCurrency, currencies)
  // Round once to cents — float subtraction can leave a near-zero artifact that would misclassify a
  // break-even ROI as a −0.00 loss; the rounded value drives sign / zero / colour at the call site.
  return { delta: Math.round(display.value * 100) / 100, code: display.code }
}
