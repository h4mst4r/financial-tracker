import { useId } from 'react'

// useField — the headless form-control behavior (UX "Behaviors": Field owns
// "value · change · error · disabled · label"). It centralises the controlled-value change gating
// (a disabled field never emits a change), a stable field id for label association, and the error/
// disabled flags. The *presentation* (the error-ring vs focus-ring class ternary, the inset surface)
// stays in the skin — the behavior owns the contract, not the look.

export interface UseFieldOptions<T> {
  onChange?: (value: T) => void
  disabled?: boolean
  error?: boolean
  /** Caller-supplied id; falls back to a stable generated id for label association. */
  id?: string
}

export interface UseFieldResult<T> {
  fieldId: string
  disabled: boolean
  error: boolean
  /** Disabled-gated change emitter — a no-op while disabled. */
  change: (value: T) => void
}

export function useField<T>({ onChange, disabled, error, id }: UseFieldOptions<T>): UseFieldResult<T> {
  const autoId = useId()
  return {
    fieldId: id ?? autoId,
    disabled: !!disabled,
    error: !!error,
    change: (value: T) => {
      if (!disabled) onChange?.(value)
    },
  }
}
