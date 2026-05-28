import { EmptyState } from '../components/ui/EmptyState'
import { Car } from 'lucide-react'

export const Assets = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Car}
        title="Assets coming soon"
        description="Track your non-financial assets like vehicles, property, and valuables."
      />
    </div>
  )
}
