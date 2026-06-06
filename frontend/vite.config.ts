import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Load .env from the project root (parent of frontend/) so backend and frontend
  // share a single .env file. Without this Vite defaults to looking in frontend/.
  envDir: '..',
  // Expose AUTH_BYPASS_ENABLED to import.meta.env without requiring a VITE_ prefix.
  envPrefix: ['VITE_', 'AUTH_BYPASS_'],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
})
