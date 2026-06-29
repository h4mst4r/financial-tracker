import { describe, it, expect } from 'vitest'
import {
  Check, AlertTriangle, XCircle, Info, TriangleAlert, CalendarX,
  Star, X, MoreVertical, Pencil, ChevronDown, Menu, Wallet, MailX,
  Shield, House, ShieldCheck, Building2,
} from 'lucide-react'
import {
  STATUS_REGISTRY,
  statusTone,
  BADGE_VARIANT_FOR_TONE,
  type StatusTone,
} from '../src/config/statusRegistry'
import {
  ACTION_ICON,
  CONTROL_ICON,
  STATUS_ICON,
  ALERT_ICON,
  errorIcon,
  moduleNavIcon,
} from '../src/config/iconRegistry'
import { EMPTY_STATE, ERROR_STATE } from '../src/config/emptyStateRegistry'
import { ACCOUNT_TYPE_ICON } from '../src/config/accountIcons'

describe('status registry (§4)', () => {
  it('resolves every domain → status → tone from the §4 table', () => {
    expect(statusTone('currencyFreshness', 'fresh')).toBe('positive')
    expect(statusTone('currencyFreshness', 'stale')).toBe('warning')
    expect(statusTone('currencyFreshness', 'never')).toBe('neutral')
    expect(statusTone('fxProvider', 'ok')).toBe('positive')
    expect(statusTone('fxProvider', 'down')).toBe('critical')
    expect(statusTone('fxProvider', 'unknown')).toBe('neutral')
    expect(statusTone('backup', 'inProgress')).toBe('warning')
    expect(statusTone('recurringOccurrence', 'missed')).toBe('critical')
    expect(statusTone('transaction', 'pending')).toBe('warning')
    expect(statusTone('transaction', 'cancelled')).toBe('neutral')
  })

  it('uses only the five §4 tones — no domain invents a sixth', () => {
    const allowed: StatusTone[] = ['positive', 'warning', 'critical', 'neutral', 'info']
    for (const domain of Object.values(STATUS_REGISTRY)) {
      for (const tone of Object.values(domain)) {
        expect(allowed).toContain(tone)
      }
    }
  })

  it('maps each tone to its Badge variant (positive↔success, critical↔error)', () => {
    expect(BADGE_VARIANT_FOR_TONE).toEqual({
      positive: 'success',
      warning: 'warning',
      critical: 'error',
      neutral: 'neutral',
      info: 'info',
    })
  })
})

describe('icon registry (§11)', () => {
  it('maps the §11 semantic/status tones to their glyphs (neutral has none)', () => {
    expect(STATUS_ICON.positive).toBe(Check)
    expect(STATUS_ICON.warning).toBe(AlertTriangle)
    expect(STATUS_ICON.critical).toBe(XCircle)
    expect(STATUS_ICON.info).toBe(Info)
    expect(STATUS_ICON.neutral).toBeNull()
  })

  it('STATUS_ICON keys are exactly the §4 StatusTone set', () => {
    expect(Object.keys(STATUS_ICON).sort()).toEqual(
      ['critical', 'info', 'neutral', 'positive', 'warning'],
    )
  })

  it('maps row/menu actions + control furniture + alert types to their §11 glyphs', () => {
    expect(ACTION_ICON.favourite).toBe(Star)
    expect(ACTION_ICON.close).toBe(X)
    expect(ACTION_ICON.more).toBe(MoreVertical)
    expect(ACTION_ICON.edit).toBe(Pencil)
    expect(CONTROL_ICON.chevronDown).toBe(ChevronDown)
    expect(CONTROL_ICON.menu).toBe(Menu)
    expect(ALERT_ICON.RECURRING_MISSED).toBe(CalendarX)
  })

  it('error surfaces use TriangleAlert', () => {
    expect(errorIcon).toBe(TriangleAlert)
  })

  it('EmptyState icon resolves to the module nav glyph', () => {
    expect(moduleNavIcon('/accounts')).toBe(Wallet)
    expect(moduleNavIcon('/nope')).toBeUndefined()
  })

  it('keeps the Shield/House (sidebar) vs ShieldCheck/Building2 (account-type) split per §11', () => {
    // Sidebar context (nav registry)
    expect(moduleNavIcon('/insurance')).toBe(Shield)
    expect(moduleNavIcon('/assets')).toBe(House)
    // Account-type context (accountIcons registry) — intentionally different glyphs
    expect(ACCOUNT_TYPE_ICON.insurance).toBe(ShieldCheck)
    expect(ACCOUNT_TYPE_ICON.asset).toBe(Building2)
    expect(ACCOUNT_TYPE_ICON.insurance).not.toBe(moduleNavIcon('/insurance'))
    expect(ACCOUNT_TYPE_ICON.asset).not.toBe(moduleNavIcon('/assets'))
  })
})

describe('empty/error registry (§18 + §11)', () => {
  it('carries the lifted empty-state copy + icons (icon defaults to the module nav glyph)', () => {
    expect(EMPTY_STATE.accounts).toEqual({
      icon: Wallet,
      title: 'No accounts yet',
      description: 'Add an account to start tracking it.',
    })
    expect(EMPTY_STATE.currencies.title).toBe('No currencies yet')
    expect(EMPTY_STATE.categories.description).toBe('Start with our defaults or add your own.')
    // Non-module surfaces override the icon.
    expect(EMPTY_STATE.invitations.icon).toBe(MailX)
    expect(EMPTY_STATE.settingsPlaceholder.title).toBe('Coming soon')
  })

  it('expands the four account-subtype empties (each on the Accounts nav glyph)', () => {
    for (const key of ['accounts', 'capital', 'assets', 'insurance'] as const) {
      expect(EMPTY_STATE[key].icon).toBe(Wallet)
    }
    expect(EMPTY_STATE.capital.title).toBe('No capital accounts yet')
    expect(EMPTY_STATE.insurance.title).toBe('No policies yet')
  })

  it('centralizes the in-app error copy', () => {
    expect(ERROR_STATE.title).toBe('Something went wrong')
    expect(ERROR_STATE.description).toBe("We couldn't load this. Please try again.")
  })
})
