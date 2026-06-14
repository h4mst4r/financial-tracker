// Frontend initial-load budget gate (NFR §4.1: page load < 3s on throttled 10 Mbps).
// Proxy: gzipped weight of the initial JS+CSS assets must stay under BUDGET_KB. The
// CI build fails when the budget is exceeded, catching bundle-bloat regressions early.
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 350)

const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')
const files = readdirSync(assetsDir).filter((f) => ['.js', '.css'].includes(extname(f)))

let totalGzip = 0
for (const file of files) {
  const gz = gzipSync(readFileSync(resolve(assetsDir, file))).length
  totalGzip += gz
  console.log(`  ${file}: ${(gz / 1024).toFixed(1)} kB gzip`)
}

const totalKb = totalGzip / 1024
console.log(`Total initial assets: ${totalKb.toFixed(1)} kB gzip (budget ${BUDGET_KB} kB)`)

if (totalKb > BUDGET_KB) {
  console.error(`Bundle budget exceeded: ${totalKb.toFixed(1)} kB > ${BUDGET_KB} kB`)
  process.exit(1)
}
