import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const swPath = path.join(frontendRoot, 'dist', 'sw.js')

if (!existsSync(swPath)) {
  console.warn('[stamp-sw] dist/sw.js no existe (¿se ejecutó vite build?)')
  process.exit(0)
}

const buildId = Date.now().toString(36)
const src = readFileSync(swPath, 'utf8')
const out = src.replace(/(const CACHE = ')([^']+)(')/, `$1totalhealth-${buildId}$3`)
writeFileSync(swPath, out, 'utf8')
console.log(`[stamp-sw] cache actualizado a totalhealth-${buildId}`)