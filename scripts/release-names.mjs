#!/usr/bin/env node
// node scripts/release-names.mjs [folder=release] — gives the installers electron-builder wrote their fixed download
// names (G-03, faz-16 madde 3), then writes SHA256SUMS.txt next to them. Used by .github/workflows/ci.yml and
// release.yml so the CI download and the GitHub Release carry the same names as docs/otel/kurulum.md and README.md.
//
//   Bismuth-Setup-x64.exe   → Bismuth-Setup.exe        Windows 10/11, x64 (the hotel PC; nearly every Windows PC)
//   Bismuth-Setup-arm64.exe → Bismuth-Setup-arm64.exe  Windows on ARM (G-04)
//   Bismuth-arm64.dmg       → Bismuth.dmg              Mac with an Apple chip (M1…; the owner's M2)
//   Bismuth-x64.dmg         → Bismuth-Intel.dmg        Mac with an Intel processor
//
// The version is not in the names: it is in the Release title and on the About screen, and a
// …/releases/latest/download/Bismuth-Setup.exe link keeps working for every version.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RELEASE_NAMES = {
  'Bismuth-Setup-x64.exe': 'Bismuth-Setup.exe',
  'Bismuth-Setup-arm64.exe': 'Bismuth-Setup-arm64.exe',
  'Bismuth-arm64.dmg': 'Bismuth.dmg',
  'Bismuth-x64.dmg': 'Bismuth-Intel.dmg'
}

const FINAL = new Set(Object.values(RELEASE_NAMES))

const dir = process.argv[2] ?? 'release'
if (!existsSync(dir)) {
  console.error(`release-names: no folder ${dir}`)
  process.exit(1)
}

const installers = []
for (const file of readdirSync(dir).sort()) {
  if (!/\.(exe|dmg)$/.test(file)) continue
  const target = RELEASE_NAMES[file] ?? (FINAL.has(file) ? file : null)
  if (target === null) {
    // A name nobody documented (an electron-builder default changed, a combined installer came back): stop, so the
    // owner never sees a file the installation guide does not explain.
    console.error(`release-names: unexpected installer ${file}`)
    process.exit(1)
  }
  if (target !== file) renameSync(join(dir, file), join(dir, target))
  installers.push(target)
}
if (installers.length === 0) {
  console.error(`release-names: no installer in ${dir}`)
  process.exit(1)
}

const sums = installers.sort().map(
  (name) =>
    `${createHash('sha256')
      .update(readFileSync(join(dir, name)))
      .digest('hex')}  ${name}`
)
writeFileSync(join(dir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`)
console.log(sums.join('\n'))
