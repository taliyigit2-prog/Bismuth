// QA2b: user text with no space (a pasted link, a number run) must wrap inside its box on every screen. The page
// gets `overflow-wrap: anywhere` once (globals.css, inherited by screens, dialogs and sheets), and the screens'
// `break-words` marker follows it: Tailwind's own `overflow-wrap: break-word` would keep a long word's full width
// in flex and grid cells. The built stylesheet is checked too (the override must win over the generated rule).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEEP_CLEAN_TEMPLATE_CODE } from '../../src/shared/domain/task-recurrence'
import { DEEP_CLEAN_CODE } from '../../src/main/db/seed/tasks'

const ROOT = join(__dirname, '../..')
const css = readFileSync(join(ROOT, 'src/renderer/styles/globals.css'), 'utf8')

describe('uzun boşluksuz metin', () => {
  it('sayfanın tamamı sığmayan sözcüğü kırar (body overflow-wrap: anywhere)', () => {
    const body = /\n {2}body \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(body).toMatch(/overflow-wrap:\s*anywhere/)
  })

  it('break-words da anywhere ile kırar (Tailwind kuralının yerine, aynı katmanda sonra)', () => {
    expect(css).toMatch(/@layer utilities \{\s*\.break-words \{\s*overflow-wrap: anywhere;/)
    const assets = join(ROOT, 'out/renderer/assets')
    if (!existsSync(assets)) return // built by `npm run build`; the e2e tour checks the result on screen
    // A build older than the stylesheet predates this rule; only a fresh build is checked.
    if (statSync(assets).mtimeMs < statSync(join(ROOT, 'src/renderer/styles/globals.css')).mtimeMs) return
    for (const file of readdirSync(assets).filter((f) => f.endsWith('.css'))) {
      const built = readFileSync(join(assets, file), 'utf8')
      const rules = [...built.matchAll(/\.break-words\{overflow-wrap:([a-z-]+)\}/g)].map((m) => m[1])
      if (rules.length) expect(rules.at(-1), file).toBe('anywhere')
    }
  })
})

describe('Bakım: derin temizlik şablonu', () => {
  it('arayüzün tanıdığı kod tohumdaki kodla aynı', () => {
    expect(DEEP_CLEAN_TEMPLATE_CODE).toBe(DEEP_CLEAN_CODE)
  })
})
