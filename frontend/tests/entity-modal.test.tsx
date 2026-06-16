import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EntityModal } from '../src/components/entity'

describe('EntityModal (story 1.9b)', () => {
  it('renders nothing when closed', () => {
    render(
      <EntityModal open={false} onClose={vi.fn()} title="Edit account" onSave={vi.fn()}>
        <input aria-label="Name" />
      </EntityModal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the title, fields, and the Cancel/Save footer when open', () => {
    render(
      <EntityModal open onClose={vi.fn()} title="Edit account" onSave={vi.fn()}>
        <input aria-label="Name" />
      </EntityModal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Edit account')).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('calls onSave / onClose from the footer buttons', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(
      <EntityModal open onClose={onClose} title="Edit" onSave={onSave}>
        <input aria-label="Name" />
      </EntityModal>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables Save when saveDisabled and does not fire onSave', () => {
    const onSave = vi.fn()
    render(
      <EntityModal open onClose={vi.fn()} title="Edit" onSave={onSave} saveDisabled>
        <input aria-label="Name" />
      </EntityModal>,
    )
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('honours custom save/cancel labels', () => {
    render(
      <EntityModal
        open
        onClose={vi.fn()}
        title="Snapshot"
        onSave={vi.fn()}
        saveLabel="Save snapshot"
        cancelLabel="Discard"
      >
        <input aria-label="Value" />
      </EntityModal>,
    )
    expect(screen.getByRole('button', { name: 'Save snapshot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })
})
