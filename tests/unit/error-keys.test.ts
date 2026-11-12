// Every error a service can return is a translated message (CLAUDE.md yasak 8): each 'errors.x' literal in the
// main process exists in tr.json (en/ru parity is checked by i18n-parity.test.ts).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import tr from '../../src/renderer/i18n/tr.json'

const root = join(__dirname, '../..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : []
  })
}

describe('servis hata mesajları', () => {
  it('ana süreçteki her "errors.*" anahtarı tr.json\'da var', () => {
    const errors = (tr as { errors: Record<string, string> }).errors
    const missing: string[] = []
    for (const file of sources(join(root, 'src/main'))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/'errors\.([A-Za-z0-9]+)'/g))
        if (!errors[m[1] as string]) missing.push(`${relative(root, file)}: errors.${m[1]}`)
    }
    expect(missing).toEqual([])
  })
})
