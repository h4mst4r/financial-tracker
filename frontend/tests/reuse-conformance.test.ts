import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

// FRONTEND-AUDIT F10/F11 — reuse-conformance regression guards.
//
// These surfaces were recomposed onto the shared primitives (F10: the auth-gate confirm dialogs → the
// `ConfirmationDialog` primitive, closed by 5f-6; the DeleteHousehold type-name confirm → the same
// primitive's confirm-input slot, closed by 5f-10 — F11: BulkActionBar single-target picks stay an INLINE
// picker, never a chooser Modal/EntityModal, ratified §8.6). None of these is caught by the L0–L20
// value-guards (they ban VALUES, not "hand-rolled a raw Modal where a primitive exists"), so pin them here:
// a future regression to a raw `<Modal>` confirm or a chooser-modal in the bulk bar fails CI.
//
// [Source: ux-design-specification.md L2 Feedback (ConfirmationDialog = decisions incl. the confirm-input
//  safeguard) + §8.6 (BulkActionBar owns its parameterised pickers INLINE — no "bulk chooser" modal).]

const SRC = join(__dirname, '..', 'src')
const read = (relPath: string) => readFileSync(join(SRC, relPath), 'utf8')

/** True if the file imports a name from a module whose path ends in `/<module>` (value import). */
const importsModule = (src: string, module: string) =>
  new RegExp(`from\\s*['"][^'"]*/${module}['"]`).test(src)

describe('reuse conformance · F10 — auth-gate confirms compose ConfirmationDialog, not a raw Modal', () => {
  // The two auth-gate decision dialogs (App.tsx gate). DeleteHousehold lives in ManagementTab (composes
  // ConfirmationDialog; confirm parity covered by danger-zone.test.tsx). The FX-provider FORM now composes
  // EntityModal too (§6 conformance) — so no ManagementTab surface hand-rolls a raw Modal; ManagementTab is
  // file-guarded below.
  for (const f of ['components/HouseholdConflictDialog.tsx', 'components/PendingInvitationDialog.tsx']) {
    it(`${f} composes ConfirmationDialog and does not hand-roll a raw Modal`, () => {
      const src = read(f)
      expect(importsModule(src, 'ConfirmationDialog')).toBe(true)
      expect(importsModule(src, 'Modal')).toBe(false)
    })
  }

  it('ManagementTab hosts no hand-rolled raw Modal — its FX-provider form composes EntityModal', () => {
    const src = read('components/settings/ManagementTab.tsx')
    expect(importsModule(src, 'Modal')).toBe(false)
    expect(importsModule(src, 'EntityModal')).toBe(true)
  })

  it('self-test: the Modal-import detector actually fires on a raw-Modal import', () => {
    expect(importsModule(`import { Modal } from './primitives/Modal'`, 'Modal')).toBe(true)
    expect(importsModule(`import { ConfirmationDialog } from './primitives/ConfirmationDialog'`, 'Modal')).toBe(false)
  })
})

describe('reuse conformance · F11 — BulkActionBar single-target picks are inline, not a chooser modal', () => {
  it('BulkActionBar imports no Modal / EntityModal (picks = inline picker; destructive → ConfirmationDialog)', () => {
    const src = read('components/entity/BulkActionBar.tsx')
    expect(importsModule(src, 'Modal')).toBe(false)
    expect(importsModule(src, 'EntityModal')).toBe(false)
  })
})
