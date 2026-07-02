// The headless interaction behaviors (UX "Behaviors", L0) + the Portal host. Behaviors are
// headless (no standalone demo) so they are deliberately NOT re-exported through `primitives/index.ts`
// — the /design-system completeness guard requires a gallery entry for every public-barrel export, and
// a behavior has nothing to render. Import them directly from `behaviors/`.
export { Portal } from './Portal'
export { usePressable, PRESS_SCALE, DISABLED_CLASS } from './usePressable'
export type { UsePressableOptions, HostPressableProps, NativePressableProps } from './usePressable'
export { useField } from './useField'
export type { UseFieldOptions, UseFieldResult } from './useField'
export { usePopover } from './usePopover'
export type { UsePopoverOptions } from './usePopover'
export { useMenu } from './useMenu'
export type { UseMenuOptions } from './useMenu'
export { useFormValidation, REQUIRED_FIELDS_NOTE } from './useFormValidation'
export type { ValidatedField, UseFormValidationResult } from './useFormValidation'
