/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In production FastAPI serves the built SPA same-origin (ARCH §5.3), so the API client uses
// relative paths. In dev (Vite :5173 + uvicorn separately), proxy the backend route prefixes to the
// API server so those same relative paths reach it. Override the target with VITE_API_TARGET.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:8000'
const apiProxy = Object.fromEntries(
  ['/auth', '/api', '/health', '/jobs'].map((p) => [p, { target: API_TARGET, changeOrigin: true }]),
)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: apiProxy,
  },
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
