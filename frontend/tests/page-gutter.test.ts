import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// UX §8 "Page gutter — one source": AppShell <main> owns the routed-content gutter via --page-gutter;
// a routed page that hand-rolls its own outer p-* gutter FAILS. This guard inspects only each page's
// ROOT wrapper (inner card padding stays legitimate) + asserts the single source lives on <main>.

const SRC = join(__dirname, '..', 'src')
const read = (p: string) => readFileSync(join(SRC, p), 'utf8')

// The routed AppShell pages (App.tsx <Routes> inside <AppShell>). DesignSystem is routed OUTSIDE the
// shell (its own <main>) — an explicit full-bleed opt-out, so it is excluded here.
const ROUTED_PAGES = [
  'pages/AccountsList.tsx',
  'pages/Categories.tsx',
  'pages/Currencies.tsx',
  'pages/Settings.tsx',
  'pages/Transactions.tsx',
]

const GUTTER = /\bp-(?:xs|sm|md|lg|xl|2xl|page-gutter)\b/

// The root wrapper = the opening tag of the first element after `return (`.
function rootOpeningTag(src: string): string {
  const after = src.slice(src.indexOf('return ('))
  const open = after.indexOf('<')
  const close = after.indexOf('>', open)
  return after.slice(open, close + 1)
}

describe('UX §8 — AppShell owns the page gutter; no routed page hand-rolls its own', () => {
  it('detector reddens on a root wrapper with an outer p-* gutter, silent on inner card padding', () => {
    expect(GUTTER.test('<div className="p-lg">')).toBe(true)
    expect(GUTTER.test('<div className="flex flex-col gap-md p-lg">')).toBe(true)
    expect(GUTTER.test('<div className="flex flex-col gap-md">')).toBe(false)
    // the guard reads only the ROOT tag, so a deeper card's padding never trips it
    expect(GUTTER.test(rootOpeningTag('return (\n    <div>\n      <Card className="p-md" />'))).toBe(false)
  })

  it('index.css defines the named --page-gutter token + its utility (the one source)', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/--page-gutter:/)
    expect(css).toMatch(/@utility p-page-gutter\b/)
  })

  it('AppShell <main> carries p-page-gutter', () => {
    const main = read('components/shell/AppShell.tsx').match(/<main\s[^>]*>/)?.[0] ?? ''
    expect(main).toContain('p-page-gutter')
  })

  it('no routed page root wrapper hand-rolls an outer p-* gutter (UX §8 Law)', () => {
    for (const page of ROUTED_PAGES) {
      const tag = rootOpeningTag(read(page))
      expect(GUTTER.test(tag), `${page} root wrapper still carries an outer gutter: ${tag}`).toBe(false)
    }
  })

  it('the DashboardHome placeholder route drops its gutter too', () => {
    const fn = read('App.tsx').match(/function DashboardHome\(\)[\s\S]*?\n}/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(GUTTER.test(fn)).toBe(false)
  })
})
