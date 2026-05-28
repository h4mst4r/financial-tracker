import { EmptyState } from '../components/ui/EmptyState'
import { Shield } from 'lucide-react'

export const Insurance = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Shield}
        title="Insurance coming soon"
        description="Manage your insurance policies and coverage details here."
      />
    </div>
  )
}
