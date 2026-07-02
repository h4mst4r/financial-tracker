import { useCallback, useEffect, useRef, useState } from 'react'

// useFormValidation — the ONE headless form-submission behavior (UX §6 "Form submission & required-field
// validation"). The primary action is NEVER disabled for missing/invalid fields (only while a mutation is
// in-flight); on a submit attempt with unmet fields it: reddens each offending Field (error-ring), moves
// focus to the FIRST offending field, shakes the PRIMARY ACTION once (error-bounce — to signal "not
// allowed"), and surfaces a summary note. After the first attempt, fields re-validate on change (a ring
// clears the moment its field becomes valid, because `fields` recomputes each render). The consumer wraps
// its real save as `submit(realSave)`, gates the primary on its own in-flight flag, feeds `shaking` to the
// modal's `shakeSave`, and renders the summary when `showSummary` is true.
//
// The behavior owns the contract, not the look: the field error-ring, the primary's shake class, and the
// summary Zone live in the skin (Input `error` prop + EntityModal `shakeSave`/`errorSummary`).

/** The one summary note every modal shows above its footer on a failed submit (UX §6). */
export const REQUIRED_FIELDS_NOTE = 'Please complete the required fields.'

/** One field's identity + current validity. `id` is the field's DOM id (the focus target). */
export interface ValidatedField {
  id: string
  invalid: boolean
}

export interface UseFormValidationResult {
  /** True once a submit has been attempted with any invalid field. */
  attempted: boolean
  /** `id → invalid`, populated only AFTER the first failed attempt (empty before). */
  errors: Record<string, boolean>
  /** Any field currently invalid. */
  hasErrors: boolean
  /** Render the summary note (attempted && still-invalid). */
  showSummary: boolean
  /** One-shot flag driving the PRIMARY action's shake — true for the emphatic duration after a failed
   *  submit, then auto-resets. Feed to EntityModal's `shakeSave`. */
  shaking: boolean
  /** Attempt submit: if all valid → onValid(); else mark attempted, focus the first offending field, shake. */
  submit: (onValid: () => void) => void
}

// Mirrors --duration-emphatic (index.css) — the error-bounce runs for this long, so the one-shot shake
// flag clears after it (a later attempt re-adds the class → the CSS animation re-fires).
const SHAKE_MS = 500

export function useFormValidation({ fields }: { fields: ValidatedField[] }): UseFormValidationResult {
  const [attempted, setAttempted] = useState(false)
  const [shaking, setShaking] = useState(false)
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Clear a pending shake-reset timer if the host unmounts mid-animation.
  useEffect(() => () => clearTimeout(shakeTimer.current), [])

  const firstInvalid = fields.find((f) => f.invalid)
  const hasErrors = firstInvalid !== undefined
  // Rings only appear after the first failed submit; thereafter they track live validity.
  const errors: Record<string, boolean> = attempted
    ? Object.fromEntries(fields.map((f) => [f.id, f.invalid]))
    : {}

  const submit = useCallback(
    (onValid: () => void) => {
      if (firstInvalid) {
        setAttempted(true)
        document.getElementById(firstInvalid.id)?.focus()
        // Re-trigger the one-shot shake: drop the flag, then re-set it on the next frame so an identical
        // `animate-error-bounce` class re-fires the CSS animation (React would otherwise no-op an
        // unchanged class).
        clearTimeout(shakeTimer.current)
        setShaking(false)
        requestAnimationFrame(() => {
          setShaking(true)
          shakeTimer.current = setTimeout(() => setShaking(false), SHAKE_MS)
        })
        return
      }
      onValid()
    },
    [firstInvalid],
  )

  return { attempted, errors, hasErrors, showSummary: attempted && hasErrors, shaking, submit }
}
