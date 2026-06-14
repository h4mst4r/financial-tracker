// Boots the same-origin production path for the Playwright matrix (ARCH §5.3):
// build the SPA, stage it into <root>/frontend_dist, then serve it + /health from
// a single FastAPI/uvicorn origin. This is the real production serving model, so the
// E2E smoke exercises exactly what ships (AC 4/5).
import { execSync, spawn } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = resolve(frontendDir, '..')
const distDir = resolve(frontendDir, 'dist')
const stagedDir = resolve(rootDir, 'frontend_dist')

execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' })
rmSync(stagedDir, { recursive: true, force: true })
cpSync(distDir, stagedDir, { recursive: true })

const port = process.env.PORT ?? '8080'
const server = spawn(
  'python',
  ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', port],
  { cwd: rootDir, stdio: 'inherit' },
)

function cleanup() {
  server.kill()
  process.exit(0)
}

process.on('SIGTERM', cleanup)
process.on('SIGINT', cleanup)
process.on('exit', () => server.kill())
