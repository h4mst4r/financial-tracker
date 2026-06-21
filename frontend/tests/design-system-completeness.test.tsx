import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Primitives from '../src/components/primitives'
import { DesignSystem } from '../src/pages/DesignSystem'
import { DESIGN_SYSTEM_SECTIONS, PRIMITIVE_DEMO_SECTION } from '../src/pages/designSystemSections'
import { useThemeStore } from '../src/stores/themeStore'

const exportedPrimitives = Object.keys(Primitives)

// DesignSystem now embeds the AppShell composite (Sidebar uses react-router NavLink; Topbar uses a
// TanStack mutation for logout), so it needs Router + QueryClient — the live /design-system route
// already renders inside both (main.tsx).
function DSWrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}
const renderDS = () => render(<DesignSystem />, { wrapper: DSWrapper })

// A DOM marker intrinsic to the REAL exported component rendered in each section — a native element,
// ARIA role, or component-owned class that a synthetic <div> stand-in would NOT produce. This closes
// the 1.8c gap where the guard only checked that a <section id> existed (story 1.12 AC5).
const SECTION_MARKER: Record<string, string> = {
  // Composites (also covered by dedicated it() blocks below; markers are their real-component testids)
  'app-shell': '[data-testid="app-shell"]',
  'entity-page': '[data-testid="entity-page-new"]',
  'entity-card': '[data-testid="entity-card"]',
  'entity-modal': 'button',
  'bulk-actions': '[data-testid="entity-card"]',
  // Foundation
  'semantic-text': '.monetary-value',
  icon: 'svg',
  // Primitives
  button: 'button',
  badge: 'span',
  avatar: '[role="img"]',
  'segmented-control': 'button',
  toggle: 'button[role="switch"]',
  'progress-bar': '[role="progressbar"]',
  'mini-sparkline': 'svg.spark',
  'favourite-star': 'button[aria-pressed]',
  skeleton: '.animate-shimmer',
  spinner: '[role="status"]',
  divider: '[role="separator"]',
  // Form controls
  checkbox: 'input[type="checkbox"]',
  label: 'label',
  input: 'input',
  'monetary-value-input': 'button[aria-haspopup="listbox"]',
  tooltip: '[role="tooltip"]',
  card: '[role="button"]',
  // Pickers
  dropdown: 'button[aria-haspopup="listbox"]',
  'date-picker': 'button[aria-haspopup="dialog"]',
  'theme-picker': 'button[aria-haspopup="listbox"]',
  'colour-picker': 'button[aria-haspopup="dialog"]',
  'emoji-icon-picker': 'button[aria-haspopup="dialog"]',
  // Category Components
  'category-tree': '[data-testid="category-tree-row"]',
  'category-defaults': '[data-testid="category-defaults-prompt"]',
  // Feedback & overlay (the demos render real trigger Buttons; the overlays portal on interaction)
  toast: 'button',
  'confirmation-dialog': 'button',
  modal: 'button',
  'context-menu': 'button',
  // States
  'empty-state': '.max-w-empty-state',
  // Public & error
  'public-page': '[data-testid="public-page"]',
}

// DOM unmount is handled by the global afterEach(cleanup) in tests/setup.ts; here we only need to
// reset the global density between tests so the harness test starts from a known state.
beforeEach(() => {
  useThemeStore.setState({ density: 'comfortable' })
})

describe('/design-system P1 completeness gate (story 1.8c, AC3)', () => {
  it('maps every exported primitive to a section that exists in the registry', () => {
    for (const name of exportedPrimitives) {
      const sectionId = PRIMITIVE_DEMO_SECTION[name]
      expect(sectionId, `exported primitive '${name}' has no demo-section mapping`).toBeDefined()
      expect(
        DESIGN_SYSTEM_SECTIONS.some((s) => s.id === sectionId),
        `section '${sectionId}' (mapped from '${name}') is not in DESIGN_SYSTEM_SECTIONS`,
      ).toBe(true)
    }
  })

  it('has no stale mappings (every mapped name is still exported)', () => {
    for (const name of Object.keys(PRIMITIVE_DEMO_SECTION)) {
      expect(exportedPrimitives, `'${name}' is mapped but no longer exported`).toContain(name)
    }
  })

  it('renders the REAL exported component inside every registry section — no synthetic stand-ins', () => {
    const { container } = renderDS()
    for (const section of DESIGN_SYSTEM_SECTIONS) {
      const el = container.querySelector(`section#${section.id}`)
      expect(el, `missing <section id="${section.id}"> for '${section.label}'`).not.toBeNull()

      const marker = SECTION_MARKER[section.id]
      expect(marker, `no real-component marker defined for section '${section.id}'`).toBeDefined()
      expect(
        el!.querySelector(marker),
        `section '${section.id}' ('${section.label}') has no real component matching '${marker}' — synthetic stand-in?`,
      ).not.toBeNull()
    }
  })
})

describe('/design-system EntityPage composite demo (story 1.9a, AC4)', () => {
  it('renders the real <EntityPage> inside #entity-page (its toolbar + New button)', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#entity-page')
    expect(section, 'missing <section id="entity-page">').not.toBeNull()
    // The real EntityPage toolbar marker (data-testid) — not a synthetic <div> stand-in.
    expect(
      section!.querySelector('[data-testid="entity-page-new"]'),
      'EntityPage demo is not the real exported component',
    ).not.toBeNull()
  })
})

describe('/design-system EntityCard & EntityModal composite demos (story 1.9b, AC5)', () => {
  it('renders the real <EntityCard> instances inside #entity-card', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#entity-card')
    expect(section, 'missing <section id="entity-card">').not.toBeNull()
    // The real EntityCard root marker (data-testid) — not a synthetic <div> stand-in.
    expect(
      section!.querySelector('[data-testid="entity-card"]'),
      'EntityCard demo is not the real exported component',
    ).not.toBeNull()
  })

  it('renders the real <EntityModal> trigger inside #entity-modal', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#entity-modal')
    expect(section, 'missing <section id="entity-modal">').not.toBeNull()
    // EntityModal is portalled when open; the section holds its trigger button (closed by default).
    expect(
      section!.querySelector('button'),
      'EntityModal demo is missing its trigger',
    ).not.toBeNull()
  })
})

describe('/design-system BulkActionBar composite demo (story 1.9c, AC5)', () => {
  it('renders the real <BulkActionBar> inside #bulk-actions once a card is selected', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#bulk-actions')
    expect(section, 'missing <section id="bulk-actions">').not.toBeNull()
    // Selection mode is on by default — tapping a card's open-overlay selects it and reveals the bar.
    const card = section!.querySelector('[data-testid="entity-card-open"]') as HTMLElement | null
    expect(card, 'BulkActionBar demo has no real EntityCard to select').not.toBeNull()
    fireEvent.click(card!)
    expect(
      section!.querySelector('[data-testid="bulk-action-bar"]'),
      'BulkActionBar did not appear after selecting a card (not the real component)',
    ).not.toBeNull()
  })
})

describe('/design-system MiniSparkline atom demo (story 1.10, AC5)', () => {
  it('renders the real <MiniSparkline> inside #mini-sparkline', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#mini-sparkline')
    expect(section, 'missing <section id="mini-sparkline">').not.toBeNull()
    // The real atom's SVG marker (.spark + .spark-line) — not a synthetic <svg> stand-in.
    expect(
      section!.querySelector('svg.spark .spark-line'),
      'MiniSparkline demo is not the real exported component',
    ).not.toBeNull()
  })
})

describe('/design-system FavouriteStar atom demo (story 1.11, AC3)', () => {
  it('renders the real <FavouriteStar> inside #favourite-star', () => {
    const { container } = renderDS()
    const section = container.querySelector('section#favourite-star')
    expect(section, 'missing <section id="favourite-star">').not.toBeNull()
    // The real atom is a <button aria-pressed> wrapping a lucide star — not a synthetic stand-in.
    const toggle = section!.querySelector('button[aria-pressed]')
    expect(toggle, 'FavouriteStar demo is not the real exported component').not.toBeNull()
    expect(toggle!.querySelector('svg'), 'FavouriteStar is missing its star glyph').not.toBeNull()
  })
})

describe('/design-system section index/nav (story 1.8c, AC1)', () => {
  it('links every demoed section', () => {
    const { container } = renderDS()
    const nav = container.querySelector('nav')
    expect(nav, 'page has no <nav> index').not.toBeNull()
    const hrefs = Array.from(nav!.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    for (const section of DESIGN_SYSTEM_SECTIONS) {
      expect(hrefs, `nav is missing a link to #${section.id}`).toContain(`#${section.id}`)
    }
  })
})

describe('/design-system density harness (story 1.8c, AC2)', () => {
  it('flips the global theme-store density without a reload', () => {
    useThemeStore.setState({ density: 'comfortable' })
    const { getByText } = renderDS()

    fireEvent.click(getByText('Compact'))
    expect(useThemeStore.getState().density).toBe('compact')

    fireEvent.click(getByText('Comfortable'))
    expect(useThemeStore.getState().density).toBe('comfortable')
  })
})
