import { Routes, Route } from 'react-router-dom'
import { useAppearance } from './theme/useAppearance'
import { DesignSystem } from './pages/DesignSystem'

function Placeholder() {
  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <h1>Financial Tracker</h1>
    </main>
  )
}

export default function App() {
  useAppearance()
  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
      <Route path="*" element={<Placeholder />} />
    </Routes>
  )
}
