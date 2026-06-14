/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Built assets are served same-origin by FastAPI from /assets/* (ARCH §5.3).
  build: {
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Playwright owns e2e/; keep it out of the vitest run.
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
