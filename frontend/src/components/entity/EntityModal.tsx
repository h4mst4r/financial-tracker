import type { ReactNode } from 'react'
import { Modal } from '../primitives/Modal'
import { Button } from '../primitives/Button'

// The single create/edit surface for every entity (UX §8.2). Wraps the Modal primitive (portal, focus
// trap, max-w-modal, scale entrance) and lays its form fields out in a two-column grid that collapses
// below md, with the locked Cancel-left / Save-right footer (§4.2). Generic shell only — the §8.2 controls
// (colour picker, EmojiIconPicker, subtype-adaptive fields) arrive with their pickers + concrete entities
// in later epics; the side-drawer variant (tall forms) is deferred until one exists. A field spans both
// columns via className="md:col-span-2" on its wrapper.

export interface EntityModalProps {
  open: boolean
  onClose: () => void
  title: string
  /** The form fields — arranged by the consumer into the two-column grid. */
  children: ReactNode
  onSave: () => void
  /** Save stays disabled until the form is valid (§0.9). */
  saveDisabled?: boolean
  saveLabel?: string
  cancelLabel?: string
}

export function EntityModal({
  open,
  onClose,
  title,
  children,
  onSave,
  saveDisabled = false,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
}: EntityModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      // Cap the panel + scroll the body so a tall form (insurance, Story 4.12) keeps its header +
      // Cancel/Save footer pinned and Save reachable. Invisible for short forms (cap never hit).
      // Interim until the §8.2 side-drawer. NOTE: Dropdown/DatePicker popups are absolute (not
      // portalled) → a picker opened near the bottom of a tall scrolling form can clip; account-form
      // pickers are mid-form so this is acceptable here (real fix = the side-drawer, Story 7.3).
      panelClassName="w-full max-w-modal bg-surface-raised border border-border flex flex-col max-h-modal"
      bodyClassName="px-md py-md overflow-y-auto"
      footer={
        // Modal's footer is justify-between → first child left, last child right (§4.2 locked convention).
        <>
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button onClick={onSave} disabled={saveDisabled}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-md md:grid-cols-2">{children}</div>
    </Modal>
  )
}
