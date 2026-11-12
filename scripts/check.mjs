#!/usr/bin/env node
// npm run check — typecheck + lint + format check + unit tests in order, the same gates as CI's verify job
// (CLAUDE.md: "üçü geçmeden madde bitti sayılmaz").
// On success writes .claude/.checks-passed (read by the stop-gate hook).
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
mkdirSync(join(root, '.claude'), { recursive: true })
writeFileSync(join(root, '.claude', '.checks-passed'), `${new Date().toISOString()}\n`)
console.log('\n✔ typecheck, lint, biçim ve testler geçti')
