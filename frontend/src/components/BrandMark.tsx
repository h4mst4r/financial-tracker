/** The brand mark — the accent gradient square (UX §4 / bible §4). Gradient lives in the
 *  `brand-gradient` @utility (index.css) so it re-skins per palette and stays P4-clean; size is a
 *  dynamic prop (same inline-size pattern as Spinner/Icon). One-off brand asset, not a generic
 *  primitive — no /design-system demo (cf. NeutralShell, Story 2.4a). */
export function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-testid="brand-mark"
      className={`brand-gradient inline-block rounded-md ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
