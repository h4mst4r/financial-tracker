import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import * as Primitives from '../src/components/primitives'
import { DesignSystem } from '../src/pages/DesignSystem'
import { DESIGN_SYSTEM_SECTIONS, PRIMITIVE_DEMO_SECTION } from '../src/pages/designSystemSections'
import { useThemeStore } from '../src/stores/themeStore'

const exportedPrimitives = Object.keys(Primitives)

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

  it('renders a <section> element for every registry entry — no synthetic stand-ins', () => {
    const { container } = render(<DesignSystem />)
    for (const section of DESIGN_SYSTEM_SECTIONS) {
      expect(
        container.querySelector(`section#${section.id}`),
        `missing <section id="${section.id}"> for '${section.label}'`,
      ).not.toBeNull()
    }
  })
})

describe('/design-system EntityPage composite demo (story 1.9a, AC4)', () => {
  it('renders the real <EntityPage> inside #entity-page (its toolbar + New button)', () => {
    const { container } = render(<DesignSystem />)
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
    const { container } = render(<DesignSystem />)
    const section = container.querySelector('section#entity-card')
    expect(section, 'missing <section id="entity-card">').not.toBeNull()
    // The real EntityCard root marker (data-testid) — not a synthetic <div> stand-in.
    expect(
      section!.querySelector('[data-testid="entity-card"]'),
      'EntityCard demo is not the real exported component',
    ).not.toBeNull()
  })

  it('renders the real <EntityModal> trigger inside #entity-modal', () => {
    const { container } = render(<DesignSystem />)
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
    const { container } = render(<DesignSystem />)
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
    const { container } = render(<DesignSystem />)
    const section = container.querySelector('section#mini-sparkline')
    expect(section, 'missing <section id="mini-sparkline">').not.toBeNull()
    // The real atom's SVG marker (.spark + .spark-line) — not a synthetic <svg> stand-in.
    expect(
      section!.querySelector('svg.spark .spark-line'),
      'MiniSparkline demo is not the real exported component',
    ).not.toBeNull()
  })
})

describe('/design-system section index/nav (story 1.8c, AC1)', () => {
  it('links every demoed section', () => {
    const { container } = render(<DesignSystem />)
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
    const { getByText } = render(<DesignSystem />)

    fireEvent.click(getByText('Compact'))
    expect(useThemeStore.getState().density).toBe('compact')

    fireEvent.click(getByText('Comfortable'))
    expect(useThemeStore.getState().density).toBe('comfortable')
  })
})
