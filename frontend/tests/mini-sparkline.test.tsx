import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { MiniSparkline } from '../src/components/primitives/MiniSparkline'
import { sparkPoints } from '../src/components/primitives/sparkline'

// Pull every fill/stroke attribute off the rendered SVG to prove no literal hex leaks in (AC4).
function svgPaintAttrs(container: HTMLElement): string[] {
  const svg = container.querySelector('svg')
  if (!svg) return []
  const out: string[] = []
  svg.querySelectorAll('*').forEach((el) => {
    const fill = el.getAttribute('fill')
    const stroke = el.getAttribute('stroke')
    if (fill) out.push(fill)
    if (stroke) out.push(stroke)
  })
  return out
}

describe('sparkPoints geometry', () => {
  it('inverts y (higher value → smaller y) and spans the width', () => {
    const pts = sparkPoints([0, 10], 120, 40, 4)
    expect(pts).toHaveLength(2)
    expect(pts[0].x).toBe(0)
    expect(pts[1].x).toBe(120)
    // value 10 is the max → highest on screen → smallest y
    expect(pts[1].y).toBeLessThan(pts[0].y)
  })

  it('places a flat series at mid-height (no divide-by-zero)', () => {
    const pts = sparkPoints([5, 5, 5], 120, 40, 4)
    expect(pts.every((p) => p.y === 20)).toBe(true)
  })

  it('returns nothing for an empty series', () => {
    expect(sparkPoints([])).toEqual([])
  })
})

describe('MiniSparkline — line variant (default)', () => {
  it('renders the polyline, area fill, and end-dot', () => {
    const { container } = render(<MiniSparkline data={[1, 2, 3, 4]} />)
    expect(container.querySelector('polyline.spark-line')).not.toBeNull()
    expect(container.querySelector('path.spark-area')).not.toBeNull()
    expect(container.querySelector('circle.spark-end')).not.toBeNull()
    expect(container.querySelector('rect.spark-bar')).toBeNull()
  })

  it('plots only the last 12 points when given more', () => {
    const data = Array.from({ length: 20 }, (_, i) => i)
    const { container } = render(<MiniSparkline data={data} />)
    const points = container.querySelector('polyline.spark-line')!.getAttribute('points')!
    expect(points.trim().split(/\s+/)).toHaveLength(12)
  })

  // The motion-aware draw-on-mount (AC1/§9.2) is carried by the animate-spark-draw class on the line;
  // JSDOM can't assert the animation runs, but locking the class prevents a refactor silently dropping it.
  it('carries the motion-aware draw-on-mount class on the line', () => {
    const { container } = render(<MiniSparkline data={[1, 2, 3, 4]} />)
    expect(container.querySelector('polyline.spark-line')!.classList).toContain('animate-spark-draw')
  })
})

describe('MiniSparkline — bar variant', () => {
  it('renders one rect per visible point and no line/end-dot', () => {
    const { container } = render(<MiniSparkline variant="bar" data={[3, 1, 4, 1, 5]} />)
    expect(container.querySelectorAll('rect.spark-bar')).toHaveLength(5)
    expect(container.querySelector('polyline.spark-line')).toBeNull()
    expect(container.querySelector('circle.spark-end')).toBeNull()
  })

  it('windows bars to the last 12 too', () => {
    const data = Array.from({ length: 18 }, (_, i) => i + 1)
    const { container } = render(<MiniSparkline variant="bar" data={data} />)
    expect(container.querySelectorAll('rect.spark-bar')).toHaveLength(12)
  })
})

describe('MiniSparkline — states', () => {
  it('< 2 points shows the "no history yet" placeholder, not a broken chart', () => {
    const { container, getByText } = render(<MiniSparkline data={[42]} />)
    expect(getByText('no history yet')).toBeTruthy()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('[data-testid="spark-empty"]')).not.toBeNull()
  })

  it('an empty series also shows the placeholder', () => {
    const { container } = render(<MiniSparkline data={[]} />)
    expect(container.querySelector('[data-testid="spark-empty"]')).not.toBeNull()
  })

  it('loading shows a sized Skeleton (shimmer) and no chart', () => {
    const { container } = render(<MiniSparkline data={[1, 2, 3]} loading />)
    expect(container.querySelector('.animate-shimmer')).not.toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    // The Skeleton fills the sparkline footprint (h-sparkline) so the card layout doesn't jump.
    expect(container.querySelector('.h-sparkline')).not.toBeNull()
  })
})

describe('MiniSparkline — delta caption (semantic colours, AC1)', () => {
  it('shows a green ▲ caption for a rising series', () => {
    const { container } = render(<MiniSparkline data={[10, 20]} showDelta />)
    const delta = container.querySelector('[data-testid="spark-delta"]')!
    expect(delta).not.toBeNull()
    expect(delta.className).toContain('text-success')
    expect(delta.textContent).toContain('+100%')
  })

  it('shows a red ▼ caption for a falling series', () => {
    const { container } = render(<MiniSparkline data={[20, 10]} showDelta />)
    const delta = container.querySelector('[data-testid="spark-delta"]')!
    expect(delta.className).toContain('text-error')
    expect(delta.textContent).toContain('-50%')
  })

  it('omits the caption when showDelta is false', () => {
    const { container } = render(<MiniSparkline data={[10, 20]} />)
    expect(container.querySelector('[data-testid="spark-delta"]')).toBeNull()
  })
})

describe('MiniSparkline — colour (AC4: reads --entity-colour, no literal hex)', () => {
  it('sets --entity-colour inline from the colour prop and never writes a hex fill/stroke', () => {
    const { container } = render(<MiniSparkline data={[1, 2, 3]} variant="bar" colour="#abcdef" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('style')).toContain('--entity-colour')
    // No SVG element carries a literal hex paint — colour flows only through the spark-* utilities.
    for (const v of svgPaintAttrs(container)) {
      expect(v.startsWith('#')).toBe(false)
    }
  })
})

describe('MiniSparkline — expand affordance (AC3 Epic-9 seam)', () => {
  it('renders a focusable button that calls onExpand when provided', () => {
    const onExpand = vi.fn()
    const { container } = render(<MiniSparkline data={[1, 2, 3]} onExpand={onExpand} />)
    const button = container.querySelector('button[aria-label="Expand chart"]') as HTMLButtonElement | null
    expect(button).not.toBeNull()
    fireEvent.click(button!)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('is purely presentational (no button) when onExpand is omitted', () => {
    const { container } = render(<MiniSparkline data={[1, 2, 3]} />)
    expect(container.querySelector('button')).toBeNull()
  })
})
