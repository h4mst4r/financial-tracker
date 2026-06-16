import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Anti-drift guard (CLAUDE.md P5). The UX spec (§0.2) is the source of truth for exact values; the
// bible renders them and the app implements them — so the bible's palette and the app's
// (frontend/src/index.css) must agree. This test pins the plain-hex tokens (structural · text ·
// accent · semantic · chart series) for every theme so the two representations can't silently
// diverge. On a failure, reconcile BOTH to the spec (§0.2 pins the per-palette anchor hex; the
// derived tokens are the build-tuned values the bible + index.css must keep identical).
//
// NOT compared: derived tokens expressed as color-mix()/rgba() (fills, rings, accent-subtle/active,
// backdrop, shadows) — those are syntax-dependent and re-skin via var() references; and entity-*
// colours, which use a different model in each file (the bible shows 5 account-type defaults; the
// app ships 3 generic role-4 defaults + per-instance data colours).

const INDEX_CSS = join(__dirname, '..', 'src', 'index.css')
const BIBLE_CSS = join(__dirname, '..', '..', '_bmad-output', 'planning-artifacts', 'design-bible', 'bible.css')

/** bible token name (after `--`) → index token name (after `--color-`). */
const NAME_MAP: Record<string, string> = {
  bg: 'bg',
  'bg-secondary': 'bg-secondary',
  surface: 'surface',
  'surface-raised': 'surface-raised',
  'surface-hover': 'surface-hover',
  'surface-active': 'surface-active',
  'surface-overlay': 'surface-overlay',
  border: 'border',
  'border-light': 'border-light',
  'border-strong': 'border-strong',
  text: 'text-primary',
  'text-secondary': 'text-secondary',
  'text-muted': 'text-muted',
  'accent-primary': 'accent-primary',
  'accent-secondary': 'accent-secondary',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
  c1: 'chart-1', c2: 'chart-2', c3: 'chart-3', c4: 'chart-4',
  c5: 'chart-5', c6: 'chart-6', c7: 'chart-7', c8: 'chart-8',
}

// base-dark lives in `@theme {…}` / `:root {…}`; the rest in `[data-theme="…"] {…}`.
const THEMES = ['base-dark', 'base-light', 'retro', 'brown', 'gameboy'] as const

/** Extract the declaration body of a token block (no nested braces inside any of these blocks). */
function block(css: string, selector: string): string {
  const re =
    selector === 'base-dark-index'
      ? /@theme\s*\{([\s\S]*?)\n\}/
      : selector === 'base-dark-bible'
        ? /:root\s*\{([\s\S]*?)\n\}/
        : new RegExp(`\\[data-theme="${selector}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`)
  const m = css.match(re)
  if (!m) throw new Error(`block not found: ${selector}`)
  return m[1]
}

/** Map of `name` (after the given prefix) → hex value, for one block body. */
function hexTokens(body: string, prefix: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = new RegExp(`--${prefix}([a-z0-9-]+)\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'g')
  for (const m of body.matchAll(re)) out.set(m[1], m[2].toLowerCase())
  return out
}

describe('design bible ↔ index.css token parity', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')
  const bibleCss = readFileSync(BIBLE_CSS, 'utf8')

  it('self-test: extractors find the base-dark surface token in both files', () => {
    expect(hexTokens(block(indexCss, 'base-dark-index'), 'color-').get('surface')).toBe('#16162a')
    expect(hexTokens(block(bibleCss, 'base-dark-bible'), '').get('surface')).toBe('#16162a')
  })

  for (const theme of THEMES) {
    it(`bible mirrors index.css plain-hex tokens — ${theme}`, () => {
      const indexBody = block(indexCss, theme === 'base-dark' ? 'base-dark-index' : theme)
      const bibleBody = block(bibleCss, theme === 'base-dark' ? 'base-dark-bible' : theme)
      const indexTok = hexTokens(indexBody, 'color-')
      const bibleTok = hexTokens(bibleBody, '')

      const mismatches: Record<string, { bible?: string; index?: string }> = {}
      for (const [bibleName, indexName] of Object.entries(NAME_MAP)) {
        const indexVal = indexTok.get(indexName)
        if (indexVal === undefined) continue // index doesn't pin this token for this theme
        const bibleVal = bibleTok.get(bibleName)
        if (bibleVal !== indexVal) mismatches[bibleName] = { bible: bibleVal, index: indexVal }
      }
      expect(mismatches).toEqual({})
    })
  }
})

// Extended parity (re-review of story 1.5, 2026-06-16). The bible + index also share radius,
// elevation (shadow), and font-family tokens — pin them too so they can't silently drift (the
// colour map above is not the whole P5 surface). The typography SCALE, 8px spacing scale, z-index
// scale and breakpoints have NO bible token counterpart (the bible renders raw px), so they remain
// spec-governed (UX §0.3/§0.4/§0.10) and are intentionally not compared here.

/** Raw (non-hex) token value: name (after prefix) → whitespace-normalised value. */
function rawTokens(body: string, prefix: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = new RegExp(`--${prefix}([a-z0-9-]+)\\s*:\\s*([^;]+);`, 'g')
  for (const m of body.matchAll(re)) out.set(m[1], m[2].trim().replace(/\s+/g, ' '))
  return out
}

/** First (primary) font family in a stack, unquoted — the spec-pinned family. */
function primaryFamily(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const m = value.match(/^\s*['"]?([^'",]+)/)
  return m ? m[1].trim() : undefined
}

describe('design bible ↔ index.css — radius / elevation / font parity', () => {
  const indexCss = readFileSync(INDEX_CSS, 'utf8')
  const bibleCss = readFileSync(BIBLE_CSS, 'utf8')
  const indexBase = block(indexCss, 'base-dark-index')
  const bibleBase = block(bibleCss, 'base-dark-bible')

  it('radius scale agrees (index --radius-* ↔ bible --r-*)', () => {
    const idx = rawTokens(indexBase, 'radius-')
    const bib = rawTokens(bibleBase, 'r-')
    const mismatches: Record<string, { bible?: string; index?: string }> = {}
    for (const key of ['sm', 'md', 'lg', 'xl', '2xl']) {
      if (idx.get(key) !== bib.get(key)) mismatches[key] = { bible: bib.get(key), index: idx.get(key) }
    }
    expect(mismatches).toEqual({})
  })

  it('primary font families agree (fallback stacks are environment-tuned, not pinned)', () => {
    const idx = rawTokens(indexBase, 'font-')
    const bib = rawTokens(bibleBase, 'font-')
    expect(primaryFamily(idx.get('sans'))).toBe(primaryFamily(bib.get('sans')))
    expect(primaryFamily(idx.get('mono'))).toBe(primaryFamily(bib.get('mono')))
  })

  it('elevation (--shadow-*) agrees per theme, where index pins it', () => {
    const mismatches: Record<string, { bible?: string; index?: string }> = {}
    for (const theme of THEMES) {
      const idx = rawTokens(block(indexCss, theme === 'base-dark' ? 'base-dark-index' : theme), 'shadow-')
      const bib = rawTokens(block(bibleCss, theme === 'base-dark' ? 'base-dark-bible' : theme), 'shadow-')
      for (const key of ['sm', 'md', 'lg', 'xl']) {
        const iv = idx.get(key)
        if (iv === undefined) continue // index inherits base-dark for this theme
        if (iv !== bib.get(key)) mismatches[`${theme}/${key}`] = { bible: bib.get(key), index: iv }
      }
    }
    expect(mismatches).toEqual({})
  })
})
