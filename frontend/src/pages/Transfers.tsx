import { EmptyState } from '../components/ui/EmptyState'
import { ArrowLeftRight } from 'lucide-react'

export const Transfers = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={ArrowLeftRight}
        title="Transfers coming soon"
        description="Track money transfers between accounts and external parties."
      />
    </div>
  )
}
