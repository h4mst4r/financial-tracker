import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Home, Settings } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Checkbox,
  Toggle,
  Dropdown,
  SegmentedControl,
  Icon,
} from '../src/components/primitives'
import { useThemeStore } from '../src/stores/themeStore'

function wrap(el: React.ReactElement) {
  return (
    <MemoryRouter>
      {el}
    </MemoryRouter>
  )
}

beforeEach(() => {
  useThemeStore.setState({ theme: 'base', font: 'base', reduceMotion: false, density: 'comfortable' })
})

/* ── Button ── */

describe('Button', () => {
  it('renders children', () => {
    render(wrap(<Button>Click me</Button>))
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('fires onClick', () => {
    const fn = vi.fn()
    render(wrap(<Button onClick={fn}>Go</Button>))
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('disabled blocks click', () => {
    const fn = vi.fn()
    render(wrap(<Button disabled onClick={fn}>No</Button>))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(fn).not.toHaveBeenCalled()
  })

  it('disabled applies the §3a disabled treatment (surface-mix + faint, no opacity)', () => {
    render(wrap(<Button variant="danger" disabled>Del</Button>))
    const btn = screen.getByRole('button', { name: 'Del' })
    // The unlayered `disabled` class governs the disabled appearance (it overrides the variant fill to the
    // relative surface-mix + faint text); no opacity dim (5f-5, B14/L5).
    expect(btn.className).toContain('disabled')
    expect(btn.className).not.toContain('opacity-50')
    expect(btn).toBeDisabled()
  })

  it('renders each variant (smoke)', () => {
    render(wrap(
      <>
        <Button variant="filled">P</Button>
        <Button variant="outline">S</Button>
        <Button variant="ghost">G</Button>
        <Button variant="danger">D</Button>
      </>
    ))
    expect(screen.getByRole('button', { name: 'P' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'S' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'G' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument()
  })
})

/* ── Input ── */

describe('Input', () => {
  it('fires onChange with typed value', () => {
    const fn = vi.fn()
    render(wrap(<Input id="test-input" onChange={fn} />))
    const input = document.getElementById('test-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('error prop applies error class', () => {
    render(wrap(<Input id="err" error />))
    const input = document.getElementById('err') as HTMLInputElement
    expect(input.className).toContain('border-error')
    expect(input.className).toContain('ring-glow-error')
  })
})

/* ── Label ── */

describe('Label', () => {
  it('renders htmlFor', () => {
    render(wrap(<Label htmlFor="x">X</Label>))
    const label = screen.getByText('X')
    expect(label.getAttribute('for')).toBe('x')
  })

  it('required shows asterisk', () => {
    render(wrap(<Label required>Name</Label>))
    expect(screen.getByText(/Name/)).toBeInTheDocument()
    expect(screen.getByText(/\*/)).toBeInTheDocument()
  })
})

/* ── Checkbox ── */

describe('Checkbox', () => {
  it('clicking toggles onChange', () => {
    const fn = vi.fn()
    render(wrap(<Checkbox checked={false} onChange={fn} id="cb" />))
    const input = document.getElementById('cb') as HTMLInputElement
    fireEvent.click(input)
    expect(fn).toHaveBeenCalledWith(true)
  })

  it('reflects checked state', () => {
    render(wrap(<Checkbox checked={true} onChange={() => {}} id="cb2" />))
    const input = document.getElementById('cb2') as HTMLInputElement
    expect(input.checked).toBe(true)
  })

  it('disabled blocks toggle', () => {
    const fn = vi.fn()
    render(wrap(<Checkbox checked={false} onChange={fn} disabled id="cb3" />))
    const input = document.getElementById('cb3') as HTMLInputElement
    fireEvent.click(input)
    expect(fn).not.toHaveBeenCalled()
  })

  it('check carries the duration-draw draw animation (AC4)', () => {
    const { container } = render(wrap(<Checkbox checked={true} onChange={() => {}} id="cb-draw" />))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class') ?? '').toContain('duration-draw')
  })
})

/* ── Toggle ── */

describe('Toggle', () => {
  it('has role switch and aria-checked', () => {
    render(wrap(<Toggle checked={false} onChange={() => {}} aria-label="t1" />))
    const sw = screen.getByRole('switch', { name: 't1' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('click toggles state', () => {
    const fn = vi.fn()
    render(wrap(<Toggle checked={false} onChange={fn} aria-label="t2" />))
    const sw = screen.getByRole('switch', { name: 't2' })
    fireEvent.click(sw)
    expect(fn).toHaveBeenCalledWith(true)
  })

  it('disabled blocks toggle', () => {
    const fn = vi.fn()
    render(wrap(<Toggle checked={true} onChange={fn} disabled aria-label="t3" />))
    const sw = screen.getByRole('switch', { name: 't3' })
    fireEvent.click(sw)
    expect(fn).not.toHaveBeenCalled()
  })

  it('track and thumb use density tokens (AC4)', () => {
    render(wrap(<Toggle checked={false} onChange={() => {}} aria-label="t-density" />))
    const sw = screen.getByRole('switch', { name: 't-density' })
    expect(sw.className).toContain('toggle-track')
    expect(sw.querySelector('span')?.className ?? '').toContain('toggle-thumb')
  })
})

/* ── Dropdown ── */

describe('Dropdown', () => {
  const opts = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ]

  it('opens on trigger click', () => {
    render(wrap(<Dropdown value="" options={opts} onChange={() => {}} placeholder="Pick" />))
    const trigger = screen.getByRole('button', { name: /Pick/i })
    fireEvent.click(trigger)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('selecting an option calls onChange and closes', () => {
    const fn = vi.fn()
    render(wrap(<Dropdown value="" options={opts} onChange={fn} placeholder="Pick" />))
    const trigger = screen.getByRole('button', { name: /Pick/i })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('B'))
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('Esc closes the panel', () => {
    render(wrap(<Dropdown value="" options={opts} onChange={() => {}} placeholder="Pick" />))
    const trigger = screen.getByRole('button', { name: /Pick/i })
    fireEvent.click(trigger)
    expect(screen.getByText('A')).toBeInTheDocument()
    fireEvent.keyDown(document.documentElement, { key: 'Escape' })
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('exposes a listbox with option roles, aria-selected and roving tabIndex (AC1)', () => {
    render(wrap(<Dropdown value="b" options={opts} onChange={() => {}} placeholder="Pick" />))
    const trigger = screen.getByRole('button', { name: /B/i })
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    const selected = options.find((o) => o.getAttribute('aria-selected') === 'true')!
    expect(selected.textContent).toContain('B')
    // Roving tabIndex: exactly one option (the active/selected) is tabbable.
    expect(options.filter((o) => o.getAttribute('tabindex') === '0')).toHaveLength(1)
    expect(selected.getAttribute('tabindex')).toBe('0')
    expect(options.filter((o) => o.getAttribute('tabindex') === '-1')).toHaveLength(1)
  })

  /* ── searchable mode (story 1.13, AC1) ── */

  const searchOpts = [
    { value: 'usd', label: 'USD — US Dollar', searchText: 'usd us dollar' },
    { value: 'eur', label: 'EUR — Euro', searchText: 'eur euro' },
    { value: 'sgd', label: 'SGD — Singapore Dollar', searchText: 'sgd singapore dollar' },
  ]

  it('renders no filter input without the searchable prop', () => {
    render(wrap(<Dropdown value="" options={searchOpts} onChange={() => {}} placeholder="Pick" />))
    fireEvent.click(screen.getByRole('button', { name: /Pick/i }))
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument()
  })

  it('searchable mode shows a filter input that narrows the options as you type', () => {
    render(wrap(<Dropdown searchable value="" options={searchOpts} onChange={() => {}} placeholder="Pick" />))
    fireEvent.click(screen.getByRole('button', { name: /Pick/i }))
    const filter = screen.getByPlaceholderText('Search…')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.change(filter, { target: { value: 'singapore' } })
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('SGD')
  })

  it('searchable mode matches on the visible label string too (no searchText needed)', () => {
    render(wrap(<Dropdown searchable value="" options={searchOpts} onChange={() => {}} placeholder="Pick" />))
    fireEvent.click(screen.getByRole('button', { name: /Pick/i }))
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'euro' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('Arrow keys + Enter select the highlighted option from the FILTERED list', () => {
    const fn = vi.fn()
    render(wrap(<Dropdown searchable value="" options={searchOpts} onChange={fn} placeholder="Pick" />))
    fireEvent.click(screen.getByRole('button', { name: /Pick/i }))
    const filter = screen.getByPlaceholderText('Search…')
    fireEvent.change(filter, { target: { value: 'dollar' } }) // USD + SGD
    // Highlight resets to index 0 (USD) on filter; ArrowDown → SGD; Enter selects it.
    fireEvent.keyDown(filter, { key: 'ArrowDown' })
    fireEvent.keyDown(filter, { key: 'Enter' })
    expect(fn).toHaveBeenCalledWith('sgd')
  })

  it('shows "No matches" when the query filters everything out', () => {
    render(wrap(<Dropdown searchable value="" options={searchOpts} onChange={() => {}} placeholder="Pick" />))
    fireEvent.click(screen.getByRole('button', { name: /Pick/i }))
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No matches')).toBeInTheDocument()
  })

  it('clears the filter when the panel is reopened', () => {
    render(wrap(<Dropdown searchable value="" options={searchOpts} onChange={() => {}} placeholder="Pick" />))
    const trigger = screen.getByRole('button', { name: /Pick/i })
    fireEvent.click(trigger)
    fireEvent.change(screen.getByPlaceholderText('Search…'), { target: { value: 'euro' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(trigger) // close
    fireEvent.click(trigger) // reopen
    expect((screen.getByPlaceholderText('Search…') as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})

/* ── SegmentedControl ── */

describe('SegmentedControl', () => {
  const opts = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
  ]

  it('renders all options', () => {
    render(wrap(<SegmentedControl value="x" options={opts} onChange={() => {}} />))
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.getByText('Y')).toBeInTheDocument()
  })

  it('clicking a segment calls onChange', () => {
    const fn = vi.fn()
    render(wrap(<SegmentedControl value="x" options={opts} onChange={fn} />))
    fireEvent.click(screen.getByText('Y'))
    expect(fn).toHaveBeenCalledWith('y')
  })

  it('active segment is marked', () => {
    render(wrap(<SegmentedControl value="y" options={opts} onChange={() => {}} />))
    const active = screen.getByText('Y')
    expect(active.className).toContain('bg-control-active')
  })
})

/* ── Icon ── */

describe('Icon', () => {
  it('renders an SVG', () => {
    const { container } = render(wrap(<Icon icon={Home} />))
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('aria-label sets role=img', () => {
    const { container } = render(wrap(<Icon icon={Home} aria-label="Home" />))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
    expect(svg?.getAttribute('aria-label')).toBe('Home')
  })

  it('absence of aria-label sets aria-hidden', () => {
    const { container } = render(wrap(<Icon icon={Settings} />))
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
  })
})
