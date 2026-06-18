import { useState } from 'react'
import { Settings as SettingsIcon } from 'lucide-react'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { EmptyState } from '../components/primitives/EmptyState'
import { ManagementTab } from '../components/settings/ManagementTab'

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'management', label: 'Management' },
  { value: 'data', label: 'Data' },
]

/**
 * Settings page (UX §5). Tabbed Profile · Management · Data, split by ownership. Story 2.5 owns the
 * shell and builds the Management tab; Profile (Story 2.9) and Data (Epic 10) are placeholders until
 * their stories land — so the default tab is Management, the only built one (D-TABS).
 */
export function Settings() {
  const [tab, setTab] = useState('management')

  return (
    <div className="p-lg">
      <div className="mx-auto flex max-w-3xl flex-col gap-lg">
        <h1 className="text-2xl font-medium text-text-primary">Settings</h1>
        <div className="max-w-input">
          <SegmentedControl value={tab} options={TABS} onChange={setTab} />
        </div>
        {tab === 'management' ? (
          <ManagementTab />
        ) : (
          <EmptyState
            icon={SettingsIcon}
            title="Coming soon"
            description="This section isn't available yet."
          />
        )}
      </div>
    </div>
  )
}
