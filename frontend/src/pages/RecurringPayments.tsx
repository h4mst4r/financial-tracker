import { EmptyState } from '../components/ui/EmptyState'
import { Repeat } from 'lucide-react'

export const RecurringPayments = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Repeat}
        title="Recurring Payments coming soon"
        description="Set up and manage recurring payments, subscriptions, and regular transfers."
      />
    </div>
  )
}
