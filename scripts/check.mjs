#!/usr/bin/env node
// npm run check — typecheck + lint + format check + unit tests in order, the same gates as CI's verify job
// (ANTIGRAVITY.md: typecheck + lint + test geçmeden iş "bitti" sayılmaz).
// On success writes .cache/.checks-passed (read by scripts/guards/stop-gate.mjs).
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const steps = ['typecheck', 'lint', 'format:check', 'test']

for (const step of steps) {
  console.log(`\n▶ npm run ${step}`)
  const result = spawnSync('npm', ['run', step], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CI: '1' }
  })
  if (result.status !== 0) {
    console.error(`\n✖ npm run ${step} başarısız`)
    process.exit(result.status ?? 1)
  }
}
mkdirSync(join(root, '.cache'), { recursive: true })
writeFileSync(join(root, '.cache', '.checks-passed'), `${new Date().toISOString()}\n`)
console.log('\n✔ typecheck, lint, biçim ve testler geçti')
