import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Table, categoryColumn, textColumn } from '../src/components/primitives'
import type { ColumnDef } from '../src/components/primitives'

interface Row {
  id: string
  name: string
  cat: { name: string; color: string } | null
}
const rows: Row[] = [
  { id: 'a', name: 'Alpha', cat: { name: 'Groceries', color: '#22c55e' } },
  { id: 'b', name: 'Bravo', cat: null },
]

describe('Table — hideBelow responsive column fold (§12.6)', () => {
  it('applies the breakpoint hidden class to the column <col>, <th> and <td>', () => {
    const columns: ColumnDef<Row>[] = [
      textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name, width: '10rem' }),
      { key: 'extra', header: 'Extra', width: '8rem', hideBelow: 'lg', render: (r) => r.name },
    ]
    const { container } = render(<Table rows={rows} columns={columns} rowKey={(r) => r.id} />)

    const col = container.querySelector('col:nth-child(2)')
    expect(col?.className).toContain('lg:table-column')
    expect(col?.className).toContain('hidden')

    const th = screen.getByRole('columnheader', { name: 'Extra' })
    expect(th.className).toContain('hidden')
    expect(th.className).toContain('lg:table-cell')

    // Every body cell for that column carries the same fold class.
    const bodyCells = container.querySelectorAll('tbody td:nth-child(2)')
    expect(bodyCells.length).toBe(2)
    bodyCells.forEach((td) => expect(td.className).toContain('lg:table-cell'))
  })

  it('a column without hideBelow is never given a fold class', () => {
    const columns: ColumnDef<Row>[] = [textColumn<Row>({ key: 'name', header: 'Name', get: (r) => r.name })]
    render(<Table rows={rows} columns={columns} rowKey={(r) => r.id} />)
    const th = screen.getByRole('columnheader', { name: /Name/ })
    expect(th.className).not.toContain('table-cell')
  })
})

describe('categoryColumn — colour-led entity Badge (§751)', () => {
  it('renders a colour-led entity Badge (entity fill + floor-safe text, no raw hex on the text)', () => {
    const columns: ColumnDef<Row>[] = [
      categoryColumn<Row>({ get: (r) => r.cat }),
    ]
    const { container } = render(<Table rows={[rows[0]]} columns={columns} rowKey={(r) => r.id} />)
    const name = screen.getByText('Groceries')
    // The §5 entity Badge: entity-axis fill + floor-safe text, keyed off --entity-colour (data).
    expect(name.className).toContain('bg-entity-fill-calm')
    expect(name.className).toContain('text-entity-fg')
    expect(name.getAttribute('style')).toContain('--entity-colour')
    // The colour rides on --entity-colour (data), never a raw hex on a `color`/text style.
    expect(name.getAttribute('style')).not.toMatch(/color:\s*#/)
    expect(container.querySelector('[style*="--entity-colour"]')).not.toBeNull()
  })

  it('renders an em dash for an uncategorised row', () => {
    const columns: ColumnDef<Row>[] = [categoryColumn<Row>({ get: (r) => r.cat })]
    render(<Table rows={[rows[1]]} columns={columns} rowKey={(r) => r.id} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
