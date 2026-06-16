import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Guards against the Tailwind v4 token/class collision documented in
// .claude/reference/frontend.md §1.4a. A colour token whose name starts with a utility
// prefix (e.g. --color-ring-glow-primary, --color-border-accent) does NOT produce the
// obvious class — the prefix is parsed twice and the class silently no-ops to a near-white
// fallback with no build error. Sanctioned spellings: an @utility of that exact name, or the
// doubled auto-class (border-border-accent). This test fails loudly if a bare (single-prefix)
// spelling sneaks back in, and asserts the sanctioned @utility aliases still exist.

const CSS_PATH = join(__dirname, '..', 'src', 'index.css')
const SRC_DIR = join(__dirname, '..', 'src')

// Tailwind utility prefixes that consume a colour name.
const COLOUR_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'ring-offset', 'fill', 'stroke', 'outline',
  'divide', 'accent', 'caret', 'from', 'to', 'via', 'shadow', 'decoration', 'placeholder',
]

function readCss(): string {
  return readFileSync(CSS_PATH, 'utf8')
}

/** Strip JS/TS/JSX comments so a token named in a warning comment isn't read as a class.
   Leaves `://` (URLs) intact. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments + JSX {/* … */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // line comments, but not the `//` in `https://`
}

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Colour-token names (the part after `--color-`) declared anywhere in the CSS. */
function tokenColourNames(css: string): Set<string> {
  return new Set([...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

/** Names of every `@utility` block defined in the CSS. */
function utilityNames(css: string): Set<string> {
  return new Set([...css.matchAll(/@utility\s+([a-z0-9-]+)\s*\{/g)].map((m) => m[1]))
}

/** Token names that collide with a utility prefix and so MUST be aliased or doubled. */
function dangerousColourNames(tokens: Set<string>): string[] {
  return [...tokens].filter((name) => {
    const first = name.split('-')[0]
    return name.includes('-') && COLOUR_PREFIXES.includes(first)
  })
}

/**
 * Returns the dangerous colour names that appear as a *bare* class token in `source`
 * (i.e. the silently-broken spelling) without a sanctioned @utility of the same name.
 * A bare occurrence is one bounded by start/space/quote/backtick/colon on the left
 * (so `focus:ring-glow-primary` counts, but the doubled `border-border-accent` does not).
 */
function findTraps(source: string, dangerous: string[], utilities: Set<string>): string[] {
  const hits: string[] = []
  for (const name of dangerous) {
    if (utilities.has(name)) continue // sanctioned @utility alias makes the bare class valid
    const re = new RegExp(`(^|[\\s"'\`:])${name.replace(/[-]/g, '\\-')}([\\s"'\`]|$)`, 'm')
    if (re.test(source)) hits.push(name)
  }
  return hits
}

describe('design tokens — Tailwind v4 token/class collision guard', () => {
  it('detector itself catches a known trap (self-test)', () => {
    const sample = `className={\`focus:ring-2 focus:ring-glow-primary border-accent\`}`
    const traps = findTraps(sample, ['ring-glow-primary', 'border-accent', 'border-error'], new Set())
    expect(traps.sort()).toEqual(['border-accent', 'ring-glow-primary'])
    // …and an @utility alias of the same name clears it:
    const cleared = findTraps(sample, ['ring-glow-primary'], new Set(['ring-glow-primary']))
    expect(cleared).toEqual([])
  })

  it('no component uses a bare colliding token name as a class', () => {
    const css = readCss()
    const dangerous = dangerousColourNames(tokenColourNames(css))
    const utilities = utilityNames(css)
    const violations: Record<string, string[]> = {}
    for (const file of tsxFiles(SRC_DIR)) {
      const hits = findTraps(stripComments(readFileSync(file, 'utf8')), dangerous, utilities)
      if (hits.length) violations[file.replace(SRC_DIR, 'src')] = hits
    }
    expect(violations).toEqual({})
  })

  it('sanctioned @utility colour aliases exist (removing one silently breaks theming)', () => {
    const utilities = utilityNames(readCss())
    for (const alias of ['bg-primary', 'text-primary', 'text-accent', 'text-on-primary', 'ring-glow-primary', 'ring-glow-accent', 'ring-glow-error', 'ring-accent']) {
      expect(utilities, `missing @utility ${alias}`).toContain(alias)
    }
  })
})

// Sibling collision on the SIZING scale (frontend.md §1.4a). In Tailwind v4 `max-w-<key>`
// resolves against our --spacing-* scale, NOT the container scale, when a matching --spacing-<key>
// token exists — so `max-w-sm`→12px, `max-w-lg`→24px, collapsing the element to a sliver /
// one-word-per-line with no build error. There is no alias that repairs the bare spelling; the only
// fix is a dedicated @utility (max-w-empty-state, max-w-modal, …). This guard forbids the colliding
// bare spellings in components. (Recurred 4× in EmptyState before the root cause was found.)

/** Spacing-token names (the part after `--spacing-`) declared in the CSS. */
function spacingNames(css: string): Set<string> {
  return new Set([...css.matchAll(/--spacing-([a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

/** `max-w-<key>` bare-class occurrences for keys that collide with a --spacing token. */
function findMaxWTraps(source: string, keys: string[]): string[] {
  const hits: string[] = []
  for (const key of keys) {
    const re = new RegExp(`(^|[\\s"'\`:])max-w-${key.replace(/[-]/g, '\\-')}([\\s"'\`]|$)`, 'm')
    if (re.test(source)) hits.push(`max-w-${key}`)
  }
  return hits
}

describe('design tokens — max-w / spacing-scale collision guard', () => {
  it('detector itself catches a known trap (self-test)', () => {
    expect(findMaxWTraps('className="mx-auto max-w-sm flex"', ['sm', 'lg']).sort()).toEqual(['max-w-sm'])
    // the dedicated @utility spelling (different name) does NOT trip the detector:
    expect(findMaxWTraps('className="mx-auto max-w-empty-state"', ['sm', 'lg'])).toEqual([])
    // a token named only inside a comment is stripped before scanning:
    expect(findMaxWTraps(stripComments('// must use max-w-empty-state, NOT max-w-sm'), ['sm', 'lg'])).toEqual([])
  })

  it('no component uses max-w-<spacing-key> (silently collapses to the spacing px value)', () => {
    const keys = [...spacingNames(readCss())]
    const violations: Record<string, string[]> = {}
    for (const file of tsxFiles(SRC_DIR)) {
      const hits = findMaxWTraps(stripComments(readFileSync(file, 'utf8')), keys)
      if (hits.length) violations[file.replace(SRC_DIR, 'src')] = hits
    }
    expect(violations).toEqual({})
  })

  it('sanctioned dedicated max-width @utilities exist', () => {
    const utilities = utilityNames(readCss())
    for (const alias of ['max-w-empty-state', 'max-w-modal', 'max-w-input', 'max-w-tooltip']) {
      expect(utilities, `missing @utility ${alias}`).toContain(alias)
    }
  })
})
