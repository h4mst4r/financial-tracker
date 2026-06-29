import { type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './primitives'

/** Semantic tone of the icon circle (UX §0.1 / §3). Maps to the tinted-circle token pair. */
export type PublicPageTone = 'accent' | 'warning' | 'error' | 'info' | 'neutral'

interface PublicPageProps {
  /** Icon glyph for the tinted circle. Omit to render a custom `children` header (e.g. Login's mark). */
  icon?: LucideIcon
  tone?: PublicPageTone
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  secondaryAction?: ReactNode
  /** Replaces the icon circle with custom header content (Login uses this for the brand mark). */
  header?: ReactNode
  /** Extra body content below the subtitle (Login's Google/dev buttons + error banner). */
  children?: ReactNode
  /** Root height override. Defaults to `min-h-screen` (full-page route); the /design-system demo
   *  passes `min-h-0` to collapse each frame to its content (compact preview). */
  className?: string
}

// tone → tinted-circle tokens (UX §0.1). Same `bg-*-fill text-*` pairs the Badge primitive uses, so
// the classes are known to paint (the §1.4a token/class collision does NOT affect these — verified).
const toneClasses: Record<PublicPageTone, string> = {
  accent: 'bg-accent-subtle text-primary',
  warning: 'bg-warning-fill text-warning',
  error: 'bg-error-fill text-error',
  info: 'bg-info-fill text-info',
  neutral: 'bg-surface-active text-text-strong',
}

/** Shared shell for every public / error page (UX §3, bible .pubpage): a centered column with a
 *  semantic icon in a tinted circle · title (H3) · calm plain subtitle · action(s). Rendered against
 *  the base theme (often pre-auth). Copy is calm and plain — no jokes (UX §3). */
export function PublicPage({
  icon,
  tone = 'neutral',
  title,
  subtitle,
  action,
  secondaryAction,
  header,
  children,
  className,
}: PublicPageProps) {
  return (
    <main
      data-testid="public-page"
      className={`flex items-center justify-center bg-bg p-lg text-text-strong ${className ?? 'min-h-screen'}`}
    >
      <div className="mx-auto max-w-public-page flex flex-col items-center gap-sm text-center">
        {header ?? (
          icon && (
            <span
              className={`mb-sm inline-flex h-14 w-14 items-center justify-center rounded-full ${toneClasses[tone]}`}
            >
              <Icon icon={icon} size={24} />
            </span>
          )
        )}
        <h3 className="text-lg font-medium text-text-strong">{title}</h3>
        {subtitle && <p className="w-full text-sm text-text-default">{subtitle}</p>}
        {children}
        {(action || secondaryAction) && (
          <div className="mt-sm flex items-center gap-sm">
            {secondaryAction}
            {action}
          </div>
        )}
      </div>
    </main>
  )
}
