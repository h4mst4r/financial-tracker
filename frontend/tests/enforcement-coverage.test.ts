import { globSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, it, expect } from 'vitest'
import * as enforcement from './helpers/enforcement'

const { SRC_DIR, srcFiles, rel, stripComments, GUARDS } = enforcement

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Enforcement COVERAGE — proving the guard battery actually gives the certainty it claims.
//
// The per-guard self-tests (enforcement-l0-l20.test.ts) prove DETECTOR SOUNDNESS: a violation in a
// modelled shape reddens. They feed string literals to detect() — they never exercise the file DISCOVERY
// in front of detect(), nor prove the exemptions are tight. This suite closes those gaps:
//   1. Discovery canary  — the source sweep reaches EVERY component file (an independent glob agrees).
//   2. Allowlist audit   — every exemption still shields a real file, and the exemption surface is a
//                          reviewed snapshot (a new/broader exemption can't slip in silently).
//   3. Rogue battery     — every guard bites a single deliberately-terrible REAL .tsx file end-to-end.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const norm = (p: string) => p.replace(/\\/g, '/')

describe('coverage · discovery — the source sweep reaches every component file', () => {
  it('the walker recurses into nested dirs and filters by extension (unit, on a temp tree)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'enforcement-walk-'))
    try {
      mkdirSync(join(tmp, 'nested', 'deep'), { recursive: true })
      writeFileSync(join(tmp, 'a.tsx'), 'x')
      writeFileSync(join(tmp, 'nested', 'b.ts'), 'x')
      writeFileSync(join(tmp, 'nested', 'deep', 'c.tsx'), 'x')
      writeFileSync(join(tmp, 'nested', 'skip.css'), 'x') // wrong extension — must be ignored
      const found = srcFiles(['.ts', '.tsx'], tmp)
        .map((f) => norm(relative(tmp, f)))
        .sort()
      expect(found).toEqual(['a.tsx', 'nested/b.ts', 'nested/deep/c.tsx'])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('every src/**/*.{ts,tsx} is visited by the production walker (independent glob agrees)', () => {
    const walked = srcFiles(['.ts', '.tsx'])
      .map((f) => norm(relative(SRC_DIR, f)))
      .sort()
    const globbed = [
      ...globSync('**/*.ts', { cwd: SRC_DIR }),
      ...globSync('**/*.tsx', { cwd: SRC_DIR }),
    ]
      .map(norm)
      .sort()
    // If these diverge, a component is escaping the guards (or being scanned that shouldn't be).
    expect(walked).toEqual(globbed)
  })
})

describe('coverage · allowlist audit — exemptions are tight and deliberate', () => {
  const ALL_EXEMPTIONS = [...new Set(GUARDS.flatMap((g) => g.allowlist))].sort()

  // The reviewed exemption surface. Changing this list is a deliberate, reviewed edit — a new or broader
  // exemption (which silently un-guards files) can't land without updating this snapshot.
  const REVIEWED_EXEMPTIONS = [
    'src/config/statusRegistry.ts', // L6 — the §4 status registry
    'src/components/primitives/Badge.tsx', // L6 — the Badge primitive
    'src/pages/DesignSystem.tsx', // L3/L4/L6/L9/L10/L12/L13 — the demo gallery
    'src/lib/', // L11 — formatting helpers
    'src/components/primitives/MonetaryValue', // L11 — value atom
    'src/components/primitives/DateValue', // L11 — value atom
    'src/components/primitives/NumberValue', // L11 — value atom
    'src/components/primitives/ColourPicker.tsx', // L7 — entity-colour palette/default
    'src/components/primitives/Avatar.tsx', // L7 — contrast-pole hex
    'src/components/primitives/behaviors/usePressable.ts', // L7 — press-scale token home
    'src/components/primitives/behaviors/Portal.tsx', // L0 — the one portal home
    'src/components/primitives/behaviors/', // L0 — the overlay-keydown home
    'src/components/primitives/Tooltip.tsx', // L0 — CSS-primary Esc exception
    'src/components/primitives/ContextMenu.tsx', // L0 — composed menu keyboard
    'src/components/shell/Sidebar.tsx', // L0 — mobile-drawer Esc
  ].sort()

  it('the exemption surface is the reviewed snapshot (a new/broader exemption requires editing this list)', () => {
    expect(ALL_EXEMPTIONS).toEqual(REVIEWED_EXEMPTIONS)
  })

  it('no stale exemption — every allowlist entry still shields a real source file', () => {
    const relPaths = srcFiles(['.ts', '.tsx']).map(rel)
    const stale = GUARDS.flatMap((g) =>
      g.allowlist.filter((entry) => !relPaths.some((r) => r.includes(entry))).map((entry) => `${g.id}:${entry}`),
    )
    expect(stale).toEqual([])
  })
})

describe('coverage · registry — every guard is wired into GUARDS (so the battery + audit reach it)', () => {
  it('every exported detector is registered in GUARDS', () => {
    const registered = new Set<unknown>(GUARDS.map((g) => g.detect))
    const orphans = Object.entries(enforcement)
      .filter(([name, val]) => name.startsWith('detect') && typeof val === 'function')
      .filter(([, fn]) => !registered.has(fn))
      .map(([name]) => name)
    // A new detector that isn't in GUARDS escapes the rogue battery AND the allowlist audit — register
    // it (the whole self-enforcing chain hangs off GUARDS being the single source of guards).
    expect(orphans).toEqual([])
  })
})

describe('coverage · rogue battery — every guard bites a real deliberately-bad component', () => {
  const ROGUE = join(__dirname, 'fixtures', 'violations', 'RogueComponent.tsx')
  const rogueSrc = stripComments(readFileSync(ROGUE, 'utf8'))

  it.each(GUARDS)('guard $id ($label) flags the rogue component', (guard) => {
    expect(
      guard.detect(rogueSrc).length,
      `${guard.id} did not flag RogueComponent.tsx — the guard has a blind spot, or the fixture lost that violation`,
    ).toBeGreaterThan(0)
  })

  it('the rogue fixture lives OUTSIDE the swept src/ tree (so it is never a real CI violation)', () => {
    expect(srcFiles(['.tsx']).some((f) => norm(f).includes('RogueComponent'))).toBe(false)
  })
})
