import { Component, type ReactNode } from 'react'
import { Button } from './primitives'
import { PublicPage } from './PublicPage'
import { PUBLIC_PAGE_STATES } from '../pages/public/publicPages'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/** Top-level boundary for uncaught render errors → the Generic Error page (ARCH §5.8/§6.6). A class
 *  component is the only way to catch render errors; no library needed. "Try again" hard-reloads. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      const cfg = PUBLIC_PAGE_STATES.generic_error
      return (
        <PublicPage
          icon={cfg.icon}
          tone={cfg.tone}
          title={cfg.title}
          subtitle={cfg.subtitle}
          action={<Button onClick={() => window.location.reload()}>{cfg.actionLabel}</Button>}
        />
      )
    }
    return this.props.children
  }
}
