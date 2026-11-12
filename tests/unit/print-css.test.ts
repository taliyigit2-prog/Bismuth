// The print stylesheets (reports, night list, guide) are all in the page at once once their screens have been
// opened: each may hide the program window only while its own print root is under <body>. An unscoped
// `body > :not(.print-root)` (reports) hid the night list of "Otelde kalanlar" too, and it printed blank.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const renderer = resolve(__dirname, '../../src/renderer')

/** Every stylesheet of the renderer, by its path under src/renderer (read as text: Vitest empties imported CSS). */
function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : []
  )
}

/** Selectors of the rules directly inside `@media print { … }` (nested at-rules such as @page left out). */
function printSelectors(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: string[] = []
  let at = text.indexOf('@media print')
  while (at >= 0) {
    let i = text.indexOf('{', at) + 1
    let depth = 1
    let start = i
    while (i < text.length && depth > 0) {
      const ch = text[i]
      if (ch === '{') {
        const head = text.slice(start, i).trim()
        if (depth === 1 && !head.startsWith('@')) out.push(...head.split(',').map((s) => s.trim()))
        depth++
        start = i + 1
      } else if (ch === '}') {
        depth--
        start = i + 1
      } else if (ch === ';' && depth === 1) start = i + 1
      i++
    }
    at = text.indexOf('@media print', i)
  }
  return out
}

const sheets = cssFiles(renderer)
  .map((file) => ({
    file: relative(renderer, file).split(/[\\/]/).join('/'),
    selectors: printSelectors(readFileSync(file, 'utf8'))
  }))
  .filter((s) => s.selectors.length > 0)

describe('yazdırma stilleri', () => {
  it('rapor, gece listesi ve kılavuz yazdırma stilleri bulunur', () => {
    expect(sheets.map((s) => s.file).sort()).toEqual(
      expect.arrayContaining([
        'features/guide/guide-print.css',
        'features/in-house/night-list.css',
        'features/reports/print.css'
      ])
    )
  })

  it('her stil program penceresini yalnız kendi yazdırma kökü sayfadayken gizler', () => {
    for (const { file, selectors } of sheets)
      for (const selector of selectors.filter((s) => /\bbody\b[^{]*>/.test(s) && s.includes(':not(')))
        expect(selector, file).toMatch(/^body:has\(> \.([\w-]+)\) > :not\(\.\1\)$/)
  })

  it('sayfa düzeyindeki kurallar (html, body) bir yazdırma köküne bağlıdır', () => {
    for (const { file, selectors } of sheets)
      for (const selector of selectors.filter((s) => /^(html|body)\b/.test(s)))
        expect(selector, file).toMatch(/^(html:has\(> body > \.[\w-]+\)|body:has\(> \.[\w-]+\))/)
  })
})
