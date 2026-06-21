import { Landmark, CreditCard, TrendingUp, Building2, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { AccountType } from '../types/account'

// Accounts carry NO custom glyph (the EmojiIconPicker is categories-only, UX §8.2). Each account
// renders a fixed Lucide icon keyed off its `account_type` discriminator — the single source for that
// map (ARCH §3.5). Colour identity still comes from the instance's own `colour` (per-instance), the
// icon is type-derived.
export const ACCOUNT_TYPE_ICON: Record<AccountType, LucideIcon> = {
  bank: Landmark,
  credit_card: CreditCard,
  capital: TrendingUp,
  asset: Building2,
  insurance: ShieldCheck,
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Bank',
  credit_card: 'Credit card',
  capital: 'Capital',
  asset: 'Asset',
  insurance: 'Insurance',
}

// The default per-instance account colour for a new account — the single TS mirror of the
// `--color-entity-account` token in index.css (the entity-type default, UX §0.1). Stored as the
// canonical base-theme hex; immersive themes remap it at render like any per-instance colour (§0.2).
export const ACCOUNT_DEFAULT_COLOUR = '#6366f1'
