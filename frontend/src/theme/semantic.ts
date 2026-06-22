// Semantic colour on an entity surface (SCP 2026-06-22 colour-system-contract, UX §0.1/§0.2).
// A semantic hue (success/warning/info/error) is meaning-bearing, so standard themes leave it true.
// The one exception: on a VIVID entity fill the semantic colour breaks the card's contrast pole
// (light-on-light / dark-on-dark), so it yields to the pole — return no class and inherit
// `text-on-entity`. Off a vivid fill, it's the plain semantic text utility. One rule, every surface
// (replaces per-component `vivid ? '' : 'text-success'` branches).

export type SemanticIntent = 'success' | 'warning' | 'info' | 'error'

// Literal class strings (NOT `text-${intent}`) so Tailwind's content scanner actually emits them —
// a runtime-built class is silently dropped from the bundle (frontend.md §1.8a).
const SEMANTIC_TEXT: Record<SemanticIntent, string> = {
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  error: 'text-error',
}

export function semanticTextClass(intent: SemanticIntent | null, vivid: boolean): string {
  if (!intent || vivid) return ''
  return SEMANTIC_TEXT[intent]
}
