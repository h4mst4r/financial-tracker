import { useAppearance } from './theme/useAppearance'

// Placeholder shell. The provider tree (QueryClient/Router/Toast) and api/client
// arrive in Story 1.4; design tokens in Story 1.5; theming engine in Story 1.6.
// No user-facing UI yet (P0) — useAppearance only applies data-theme/data-font to <html>.
export default function App() {
  useAppearance()
  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <h1>Financial Tracker</h1>
    </main>
  )
}
