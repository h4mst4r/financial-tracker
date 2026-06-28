import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FilterBar, type FilterDescriptor, type FilterState } from '../src/components/primitives'

const descriptors: FilterDescriptor[] = [
  { key: 'search', label: 'Search', control: 'search', placeholder: 'Search…', primary: true },
  {
    key: 'category',
    label: 'Category',
    control: 'dropdown',
    primary: true,
    placeholder: 'Category',
    toVizField: 'category_ids',
    options: [{ value: 'dining', label: 'Dining' }],
  },
  {
    key: 'type',
    label: 'Type',
    control: 'segmented',
    primary: true,
    toVizField: 'transaction_type',
    options: [
      { value: 'all', label: 'All' },
      { value: 'inflow', label: 'Inflow' },
      { value: 'outflow', label: 'Outflow' },
    ],
  },
  { key: 'account', label: 'Account', control: 'dropdown', toVizField: 'account_ids', options: [{ value: 'dbs', label: 'DBS' }] },
  { key: 'tags', label: 'Tags', control: 'popover', multi: true, toVizField: 'tag_ids', options: [{ value: 'vacation', label: 'Vacation' }] },
]

function Harness({ initial = {} }: { initial?: FilterState }) {
  const [state, setState] = useState<FilterState>(initial)
  return <FilterBar descriptors={descriptors} value={state} onChange={setState} />
}

describe('FilterBar — shell + controls', () => {
  it('renders the primary inline controls (search, Category, type segments)', () => {
    render(<Harness />)
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument()
    expect(screen.getByText('Inflow')).toBeInTheDocument() // type segment
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('search input is controlled — typing updates the value', () => {
    render(<Harness />)
    const search = screen.getByPlaceholderText('Search…') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'coffee' } })
    expect(search.value).toBe('coffee')
  })
})

describe('FilterBar — clear-all', () => {
  it('shows Clear all only when a filter is active, and resets on click', () => {
    render(<Harness />)
    expect(screen.queryByText('Clear all')).toBeNull()
    const search = screen.getByPlaceholderText('Search…') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'coffee' } })
    expect(screen.getByText('Clear all')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear all'))
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText('Clear all')).toBeNull()
  })
})

describe('FilterBar — Filters overflow popover', () => {
  it('shows the active-count badge for active overflow filters', () => {
    render(<Harness initial={{ account: 'dbs' }} />)
    const trigger = screen.getByRole('button', { name: /Filters/i })
    expect(within(trigger).getByText('1')).toBeInTheDocument()
  })

  it('opens the popover and keeps it open on a click inside (inner-popup containment)', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog).toBeInTheDocument()
    // The Account overflow control lives inside the popover (label + its Dropdown trigger).
    expect(within(dialog).getAllByText('Account').length).toBeGreaterThan(0)
    // A click INSIDE the popover must not dismiss it (a Dropdown/DatePicker opened inside stays open).
    fireEvent.mouseDown(dialog)
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
  })

  it('dismisses the popover on an outside click', () => {
    render(
      <div>
        <Harness />
        <button>outside</button>
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('outside'))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull()
  })
})

describe('FilterBar — responsive collapse markers', () => {
  it('inline primary controls hide < md; the popover carries them < md', () => {
    const { container } = render(<Harness />)
    // Category/type are inline ≥ md (hidden md:flex wrapper).
    expect(container.querySelector('.hidden.md\\:flex')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }))
    // The popover holds a md:hidden block (the primary controls, shown only < md).
    const dialog = screen.getByRole('dialog', { name: 'Filters' })
    expect(dialog.querySelector('.md\\:hidden')).not.toBeNull()
  })
})
