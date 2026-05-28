import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { useAuthStore } from './store/authStore'
import './index.css'

/**
 * Seed a mock user for local development & Epic 2 visual testing.
 * Remove this block once Epic 3 (Authentication) is complete.
 */
useAuthStore.setState({
  currentPerson: {
    personId: 'dev-1',
    displayName: 'Dev User',
    email: 'dev@local.test',
    defaultView: 'household',
    displayCurrency: 'USD',
  },
  householdId: 'hh-dev-1',
  csrfToken: 'dev-token',
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
