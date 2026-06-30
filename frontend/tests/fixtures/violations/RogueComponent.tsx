import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

// DELIBERATELY-TERRIBLE FIXTURE — do NOT "fix" the violations below. It packs every Part II value-guard
// violation (L0 · L3 · L4 · L5 · L6 · L7 · L9 · L10 · L11 · L12 · L13) into one real, type-valid .tsx
// file. It lives under tests/ (the production guards sweep src/ ONLY, so this is never flagged by the real
// CI gate) and is never imported or executed — enforcement-coverage.test.ts readFileSync's it and runs
// every detector over it, proving the whole guard battery bites a real component end-to-end. The bad
// values are eslint/tsc-clean by design (raw hex, arbitrary-Tailwind, inline color-mix etc. are caught by
// the vitest guards, not the linter) — so the file passes the gate yet trips every detector.

function FakeBadge({ variant, children }: { variant: string; children: ReactNode }) {
  return <span data-variant={variant}>{children}</span>
}

const brandHex = '#abcdef' // L7 — raw hex

export function RogueComponent({ size }: { size: number }) {
  const pct = (0.5).toFixed(2) // L11 — hand-formatted number outside the value atoms
  document.addEventListener('keydown', () => {}) // L0 — hand-rolled overlay keydown

  // L0 — hand-rolled portal outside behaviors/Portal.tsx
  return createPortal(
    <div
      // L3 opacity-emphasis · L5 disabled:opacity · L7 arbitrary-TW · L10 raw border · L12 raw duration · L13 arbitrary padding
      className="opacity-70 disabled:opacity-50 w-[37px] border-[3px] duration-[200ms] p-[12px]"
      style={{
        boxShadow: '0 1px 2px black', // L9 — raw box-shadow
        height: 37, // L13 — hardcoded height
        color: brandHex,
        borderColor: `color-mix(in srgb, ${brandHex} 30%, var(--bg))`, // L4 — inline color-mix
      }}
      data-size={size}
      data-pct={pct}
    >
      <FakeBadge variant="error">bad</FakeBadge> {/* L6 — status tone authored as a Badge variant */}
    </div>,
    document.body,
  )
}
