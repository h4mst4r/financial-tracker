import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import CreateHouseholdModal from './CreateHouseholdModal'

interface Household {
  id: string;
  name: string;
}

interface HouseholdResponse {
  household: Household | null;
  member: {
    role: string;
  } | null;
}

export default function DashboardPage() {
  const { user, logout, csrfToken, isLoading: authLoading } = useAuth()
  const [_household, setHousehold] = useState<Household | null>(null)
  const [showCreateHousehold, setShowCreateHousehold] = useState(false)

  // Wait for auth to complete, then check if user has a household
  useEffect(() => {
    if (authLoading || !user) return
    fetchMyHousehold()
  }, [authLoading, user])

  const fetchMyHousehold = async () => {
    try {
      const sessionId = localStorage.getItem('session_id')
      const response = await fetch('/api/households/my-household', {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      })
      if (!response.ok) throw new Error('Failed to fetch household')
      
      const data: HouseholdResponse = await response.json()
      setHousehold(data.household)
      
      if (!data.household) {
        setShowCreateHousehold(true)
      }
    } catch (err) {
      console.error('Failed to fetch household:', err)
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-primary">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-text">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-primary m-0">
          Financial Tracker
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-text-secondary">
            {user?.name} ({user?.email})
          </span>
          <button
            onClick={logout}
            className="bg-transparent border border-border text-text rounded-md px-4 py-2 cursor-pointer text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: '32px 24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px' }}>
          Dashboard
        </h2>
        <p className="text-text-secondary">
          Welcome to your Financial Tracker dashboard.
        </p>
      </main>

      {/* Household Creation Modal for First-Time Users */}
      {showCreateHousehold && csrfToken && (
        <CreateHouseholdModal
          csrfToken={csrfToken}
          onClose={() => setShowCreateHousehold(false)}
          onSuccess={() => {
            setShowCreateHousehold(false)
            fetchMyHousehold()
          }}
        />
      )}
    </div>
  )
}
