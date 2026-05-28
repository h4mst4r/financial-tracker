import { EmptyState } from '../components/ui/EmptyState'
import { Settings as SettingsIcon } from 'lucide-react'

export const Settings = () => {
  return (
    <div className="p-6">
      <EmptyState
        icon={SettingsIcon}
        title="Settings coming soon"
        description="Configure your account preferences, household settings, and display options."
      />
    </div>
  )
}
