import { EmptyState } from '../components/ui/EmptyState'
import { Tags } from 'lucide-react'

export const Categories = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Tags}
        title="Categories coming soon"
        description="Organize your transactions with custom categories and subcategories."
      />
    </div>
  )
}
