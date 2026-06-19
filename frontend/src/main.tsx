import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastContainer } from './components/ToastContainer.tsx'
import { setAuthStoreGetter } from './api/client.ts'
import { useAuthStore } from './stores/authStore.ts'
import { branding } from './config/branding.ts'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'

// Wire the auth-store getter once at startup (avoids circular import)
setAuthStoreGetter(() => useAuthStore.getState())

// Brand the document from the single branding source (FR-SYS-011). The index.html <title> is the
// inert pre-JS fallback; the favicon <link> is injected only when a white-label favicon is set.
document.title = branding.appName
if (branding.favicon) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link')
  link.rel = 'icon'
  link.href = branding.favicon
  document.head.appendChild(link)
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToastContainer />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
