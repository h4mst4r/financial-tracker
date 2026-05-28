import { EmptyState } from '../components/ui/EmptyState'
import { Wallet } from 'lucide-react'

export const Accounts = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={Wallet}
        title="Accounts coming soon"
        description="Manage your bank accounts, credit cards, and other financial accounts here."
      />
    </div>
  )
}
