import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface User {
  id: string
  email: string
  name: string
  picture_url?: string
  role: string
  created_at?: string
}

interface PendingInvitation {
  id: string
  household_id: string
  email: string
  invited_by: string
  status: string
  expires_at: string | null
  created_at: string | null
  is_expired: boolean
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  csrfToken: string | null
  pendingInvitations: PendingInvitation[]
  login: () => void
  logout: () => Promise<void>
  refreshCsrfToken: () => Promise<void>
  refreshPendingInvitations: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([])

  const fetchCsrfToken = async () => {
    try {
      const sessionId = localStorage.getItem('session_id')
      const response = await fetch('/api/auth/csrf-token', {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      })
      if (response.ok) {
        const data = await response.json()
        setCsrfToken(data.csrf_token)
      }
    } catch {
      // ignore
    }
  }

  const checkPendingInvitations = async () => {
    try {
      const sessionId = localStorage.getItem('session_id')
      console.log('[Auth] Checking pending invitations for user:', user?.email)
      const response = await fetch('/api/households/my-invitations', {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      })
      console.log('[Auth] Response status:', response.status)
      if (response.ok) {
        const data = await response.json()
        console.log('[Auth] Pending invitations found:', data.length)
        if (data.length > 0) {
          // Store pending invitations for components to use
          setPendingInvitations(data)
          return data[0] // Return first pending invitation
        }
      }
    } catch (err) {
      console.error('[Auth] Error checking invitations:', err)
    }
    return null
  }

  const checkAuth = async () => {
    // Check for session_id in URL params (from OAuth callback redirect)
    const urlParams = new URLSearchParams(window.location.search)
    const urlSessionId = urlParams.get('session_id')
    if (urlSessionId) {
      localStorage.setItem('session_id', urlSessionId)
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    try {
      const sessionId = localStorage.getItem('session_id')
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      })
      if (response.ok) {
        const data = await response.json()
        setUser(data.user)
        // Fetch CSRF token after successful auth
        await fetchCsrfToken()
        // Check for pending invitations — if found, redirect to accept page immediately
        // BUT skip if we're already on an invite page (to prevent infinite redirect loop)
        const firstInvitation = await checkPendingInvitations()
        if (firstInvitation && !window.location.pathname.startsWith('/invite/')) {
          // Redirect to invitation acceptance page before any other page renders
          window.location.href = `/invite/${firstInvitation.id}`
          return
        }
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = () => {
    window.location.href = '/api/auth/google'
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        credentials: 'include',
      })
    } catch {
      // ignore
    }
    setUser(null)
    setCsrfToken(null)
    window.location.href = '/login'
  }

  const refreshCsrfToken = async () => {
    await fetchCsrfToken()
  }

  const refreshPendingInvitations = async () => {
    if (user) {
      await checkPendingInvitations()
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, csrfToken, pendingInvitations, login, logout, refreshCsrfToken, refreshPendingInvitations }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
