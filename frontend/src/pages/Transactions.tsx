import { EmptyState } from '../components/ui/EmptyState'
import { Receipt } from 'lucide-react'

export const Transactions = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Receipt}
        title="Transactions coming soon"
        description="Record and manage your income, expenses, and financial transactions."
      />
    </div>
  )
}
