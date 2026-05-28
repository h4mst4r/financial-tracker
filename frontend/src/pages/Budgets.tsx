import { EmptyState } from '../components/ui/EmptyState'
import { PieChart } from 'lucide-react'

export const Budgets = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={PieChart}
        title="Budgets coming soon"
        description="Create and monitor budgets to stay on top of your spending."
      />
    </div>
  )
}
