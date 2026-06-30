import { useNavigate } from 'react-router-dom'
import { Button, Spinner } from '../../components/primitives'
import { PublicPage } from '../../components/PublicPage'
import { PUBLIC_PAGE_STATES, type PublicPageState } from './publicPages'

/** Renders one UX §3 public/error state via the shared PublicPage shell with its action wired. */
export function PublicError({ state }: { state: PublicPageState }) {
  const navigate = useNavigate()
  const cfg = PUBLIC_PAGE_STATES[state]

  if (state === 'loading') {
    return <PublicPage header={<Spinner size={28} />} title={cfg.title} subtitle={cfg.subtitle} />
  }

  const action =
    cfg.actionLabel && cfg.actionKind ? (
      <Button
        variant={cfg.actionPrimary ? 'filled' : 'outline'}
        onClick={() => {
          if (cfg.actionKind === 'login') navigate('/login')
          else if (cfg.actionKind === 'home') navigate('/')
          else window.location.reload()
        }}
      >
        {cfg.actionLabel}
      </Button>
    ) : undefined

  return (
    <PublicPage
      icon={cfg.icon}
      tone={cfg.tone}
      title={cfg.title}
      subtitle={cfg.subtitle}
      action={action}
    />
  )
}
