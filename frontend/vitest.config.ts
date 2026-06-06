import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Mirror vite.config.ts: load .env from project root, expose AUTH_BYPASS_ENABLED.
  envDir: '..',
  envPrefix: ['VITE_', 'AUTH_BYPASS_'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
