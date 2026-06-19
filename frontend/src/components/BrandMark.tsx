import { branding } from '../config/branding'

/** The brand mark (UX §1.1/§4, bible §4). White-label image when `branding.mark` is set; otherwise
 *  the accent gradient square — gradient lives in the `brand-gradient` @utility (index.css) so it
 *  re-skins per palette and stays P4-clean. Size is a dynamic prop (same inline-size pattern as
 *  Spinner/Icon). One-off brand asset, not a generic primitive — no /design-system demo (cf.
 *  NeutralShell, Story 2.4a). */
export function BrandMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  if (branding.mark) {
    return (
      <img
        data-testid="brand-mark"
        src={branding.mark}
        alt=""
        aria-hidden
        className={`inline-block rounded-md ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      aria-hidden
      data-testid="brand-mark"
      className={`brand-gradient inline-block rounded-md ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
