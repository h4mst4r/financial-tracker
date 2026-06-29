import { useState } from 'react'
import { EMPTY_STATE } from '../config/emptyStateRegistry'
import { SegmentedControl } from '../components/primitives/SegmentedControl'
import { EmptyState } from '../components/primitives/EmptyState'
import { ProfileTab } from '../components/settings/ProfileTab'
import { ManagementTab } from '../components/settings/ManagementTab'

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'management', label: 'Management' },
  { value: 'data', label: 'Data' },
]

/**
 * Settings page (UX §5). Tabbed Profile · Management · Data, split by ownership. Profile (Story 2.9,
 * the bible-default tab) and Management (Story 2.5) are built; Data (Epic 10) is a placeholder.
 */
export function Settings() {
  const [tab, setTab] = useState('profile')

  return (
    <div className="p-lg">
      <div className="mx-auto flex max-w-3xl flex-col gap-lg">
        <h1 className="text-2xl font-medium text-text-strong">Settings</h1>
        <div className="max-w-input">
          <SegmentedControl value={tab} options={TABS} onChange={setTab} />
        </div>
        {tab === 'profile' ? (
          <ProfileTab />
        ) : tab === 'management' ? (
          <ManagementTab />
        ) : (
          <EmptyState {...EMPTY_STATE.settingsPlaceholder} />
        )}
      </div>
    </div>
  )
}
