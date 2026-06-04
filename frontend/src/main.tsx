import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ToastContainer } from './components/ui/Toast'
import { useAuthStore } from './store/authStore'
import { setAuthStoreGetter } from './api/client'
import './index.css'

const queryClient = new QueryClient()

// Wire the API client to read CSRF token and call clearAuth on 401 (G-02)
setAuthStoreGetter(() => useAuthStore.getState())

// Dev auth: Vite proxy strips Set-Cookie headers, so the backend passes the
// session ID in the URL hash after OAuth callback. Capture it here and store
// in sessionStorage so the API client can send it as X-Session-Token.
const hash = window.location.hash
if (hash.startsWith('#session=')) {
  const sessionId = hash.slice('#session='.length)
  if (sessionId) {
    sessionStorage.setItem('dev_session_token', sessionId)
    // Clean the hash from the URL without a page reload
    history.replaceState(null, '', window.location.pathname + window.location.search)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        {/* Rendered outside AppShell so z-toast (500) is never trapped by a child stacking context */}
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
