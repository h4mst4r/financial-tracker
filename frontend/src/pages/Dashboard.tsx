import { EmptyState } from '../components/ui/EmptyState'
import { LayoutDashboard } from 'lucide-react'

export const Dashboard = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard coming soon"
        description="Your financial overview will appear here once the dashboard module is complete."
      />
    </div>
  )
}
