import { EmptyState } from '../components/ui/EmptyState'
import { Landmark } from 'lucide-react'

export const Capital = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Landmark}
        title="Capital coming soon"
        description="Track your capital accounts and investments here."
      />
    </div>
  )
}
