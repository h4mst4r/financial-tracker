import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  Badge,
  Avatar,
  Card,
  Divider,
  Spinner,
  Skeleton,
  ProgressBar,
  Tooltip,
  ContextMenu,
  Modal,
  Toast,
  EmptyState,
  ConfirmationDialog,
} from '../src/components/primitives'
import { useAlertStore } from '../src/stores/alertStore'
import { ToastContainer } from '../src/components/ToastContainer'
import { Home } from 'lucide-react'

function wrap(el: React.ReactElement) {
  return <MemoryRouter>{el}</MemoryRouter>
}

beforeEach(() => {
  useAlertStore.setState({ toasts: [], panelOpen: false })
})

/* ── Badge ── */

describe('Badge', () => {
  it('renders children', () => {
    render(wrap(<Badge>Label</Badge>))
    expect(screen.getByText('Label')).toBeInTheDocument()
  })

  it('applies variant class', () => {
    const { container } = render(wrap(<Badge variant="success">OK</Badge>))
    expect(container.firstChild).toHaveClass('bg-success-fill')
  })

  it('defaults to neutral variant', () => {
    const { container } = render(wrap(<Badge>Default</Badge>))
    expect(container.firstChild).toHaveClass('bg-surface-active')
  })
})

/* ── Divider ── */

describe('Divider', () => {
  it('renders horizontal by default', () => {
    render(wrap(<Divider />))
    const el = screen.getByRole('separator')
    expect(el).toHaveAttribute('data-orientation', 'horizontal')
    expect(el).toHaveClass('border-t')
  })

  it('renders vertical when specified', () => {
    render(wrap(<Divider orientation="vertical" />))
    const el = screen.getByRole('separator')
    expect(el).toHaveAttribute('data-orientation', 'vertical')
    expect(el).toHaveClass('border-l')
  })
})

/* ── Spinner ── */

describe('Spinner', () => {
  it('renders a spinning ring with animate-spin', () => {
    render(wrap(<Spinner />))
    expect(screen.getByRole('status')).toHaveClass('animate-spin')
  })

  it('has loading status role', () => {
    render(wrap(<Spinner />))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})

/* ── Avatar ── */

describe('Avatar', () => {
  it('renders initials when no src', () => {
    render(wrap(<Avatar name="Alice Chen" colour="#6366f1" />))
    expect(screen.getByText('AC')).toBeInTheDocument()
  })

  it('renders img when src provided', () => {
    render(wrap(<Avatar src="/avatar.png" name="Alice" />))
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('falls back to initials on image error', async () => {
    render(wrap(<Avatar src="broken.png" name="Bob Smith" colour="#22c55e" />))
    // Simulate image error
    const img = screen.getByRole('img')
    fireEvent.error(img)
    await waitFor(() => {
      expect(screen.getByText('BS')).toBeInTheDocument()
    })
  })
})

/* ── Card ── */

describe('Card', () => {
  it('renders children', () => {
    render(wrap(<Card><span>Content</span></Card>))
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('applies interactive classes', () => {
    const { container } = render(wrap(<Card interactive>Click me</Card>))
    const card = container.querySelector('[role="button"]')
    expect(card).toHaveClass('cursor-pointer')
  })

  it('fires onClick when interactive', () => {
    const fn = vi.fn()
    render(wrap(<Card interactive onClick={fn}>Go</Card>))
    fireEvent.click(screen.getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

/* ── ProgressBar ── */

describe('ProgressBar', () => {
  it('has progressbar role', () => {
    render(wrap(<ProgressBar value={50} />))
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('reflects aria-valuenow', () => {
    render(wrap(<ProgressBar value={75} />))
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })

  it('clamps value to 0-100 range', () => {
    const { container } = render(wrap(<ProgressBar value={150} />))
    const fill = container.querySelector('[style*="width"]') as HTMLElement
    expect(fill?.style.width).toBe('100%')
  })
})

/* ── Skeleton ── */

describe('Skeleton', () => {
  it('applies shimmer classes', () => {
    const { container } = render(wrap(<Skeleton className="h-4 w-32" />))
    expect(container.firstChild).toHaveClass('shimmer-gradient')
    expect(container.firstChild).toHaveClass('animate-shimmer')
  })

  it('applies circle variant', () => {
    const { container } = render(wrap(<Skeleton variant="circle" className="h-10 w-10" />))
    expect(container.firstChild).toHaveClass('rounded-full')
  })
})

/* ── Tooltip ── */

describe('Tooltip', () => {
  it('renders content in DOM', () => {
    render(wrap(
      <Tooltip content="Help text">
        <span>Target</span>
      </Tooltip>
    ))
    expect(screen.getByText('Help text')).toBeInTheDocument()
  })

  it('has tooltip role', () => {
    render(wrap(
      <Tooltip content="Info">
        <span>Target</span>
      </Tooltip>
    ))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})

/* ── ContextMenu ── */

describe('ContextMenu', () => {
  it('opens on trigger click', () => {
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[{ label: 'Edit', onClick: vi.fn() }]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('fires item onClick', () => {
    const fn = vi.fn()
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[{ label: 'Edit', onClick: fn }]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('disabled item does not fire onClick', () => {
    const fn = vi.fn()
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[{ label: 'Edit', onClick: fn, disabled: true }]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(fn).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[{ label: 'Edit', onClick: vi.fn() }]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('activates the focused item via keyboard ArrowDown + Enter', () => {
    const fn = vi.fn()
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[{ label: 'Edit', onClick: fn }]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not activate a disabled item via keyboard (skips it in nav)', () => {
    const disabledFn = vi.fn()
    const enabledFn = vi.fn()
    render(wrap(
      <ContextMenu
        trigger={<button>Menu</button>}
        items={[
          { label: 'Disabled', onClick: disabledFn, disabled: true },
          { label: 'Enabled', onClick: enabledFn },
        ]}
      />
    ))
    fireEvent.click(screen.getByText('Menu'))
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(disabledFn).not.toHaveBeenCalled()
    expect(enabledFn).toHaveBeenCalledTimes(1)
  })
})

/* ── Modal ── */

describe('Modal', () => {
  it('is hidden when open=false', () => {
    render(wrap(<Modal open={false} onClose={vi.fn()}>Content</Modal>))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows dialog when open=true', () => {
    render(wrap(<Modal open={true} onClose={vi.fn()} title="Test">Content</Modal>))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onClose on Escape', () => {
    const fn = vi.fn()
    render(wrap(<Modal open={true} onClose={fn} title="Test">Content</Modal>))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the panel on open and restores it to the trigger on close (Task 11)', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Test">
            Content
          </Modal>
        </>
      )
    }
    render(wrap(<Harness />))
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(dialog).toHaveFocus())
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(opener).toHaveFocus())
  })
})

/* ── ConfirmationDialog ── */

describe('ConfirmationDialog', () => {
  it('calls onConfirm when confirm button clicked', () => {
    const confirmFn = vi.fn()
    const closeFn = vi.fn()
    render(wrap(
      <ConfirmationDialog
        open={true}
        onClose={closeFn}
        onConfirm={confirmFn}
        title="Delete"
        message="Are you sure?"
      />
    ))
    // The confirm button has label "Confirm"
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmFn).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel clicked', () => {
    const closeFn = vi.fn()
    render(wrap(
      <ConfirmationDialog
        open={true}
        onClose={closeFn}
        onConfirm={vi.fn()}
        title="Delete"
        message="Are you sure?"
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(closeFn).toHaveBeenCalledTimes(1)
  })

  it('uses danger button when destructive', () => {
    render(wrap(
      <ConfirmationDialog
        open={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete"
        message="Are you sure?"
        destructive={true}
      />
    ))
    const btn = screen.getByRole('button', { name: 'Confirm' })
    expect(btn).toHaveClass('bg-error-solid')
  })
})

/* ── Toast ── */

describe('Toast', () => {
  it('renders message', () => {
    render(wrap(<Toast variant="info" message="Hello" onDismiss={vi.fn()} />))
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('calls onDismiss when dismiss button clicked', () => {
    const fn = vi.fn()
    render(wrap(<Toast variant="success" message="Done" onDismiss={fn} />))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('has alert role', () => {
    render(wrap(<Toast variant="warning" message="Careful" onDismiss={vi.fn()} />))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

/* ── ToastContainer ── */

describe('ToastContainer', () => {
  it('renders nothing when queue is empty', () => {
    const { container } = render(wrap(<ToastContainer />))
    expect(container.children.length).toBe(0)
  })

  it('renders a Toast per queued item', () => {
    useAlertStore.getState().pushToast({ variant: 'info', message: 'Test toast' })
    render(wrap(<ToastContainer />))
    expect(screen.getByText('Test toast')).toBeInTheDocument()
  })

  it('removes toast on dismiss', () => {
    useAlertStore.getState().pushToast({ variant: 'error', message: 'Error!' })
    render(wrap(<ToastContainer />))
    expect(screen.getByText('Error!')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Error!')).not.toBeInTheDocument()
  })
})

/* ── EmptyState ── */

describe('EmptyState', () => {
  it('renders title', () => {
    render(wrap(<EmptyState title="Nothing here" />))
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(wrap(<EmptyState title="Empty" description="No items found" />))
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    const { container } = render(wrap(<EmptyState icon={Home} title="Empty" />))
    expect(container.querySelector('svg.lucide-house')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(wrap(
      <EmptyState
        title="Empty"
        action={<button>Action</button>}
      />
    ))
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })
})
