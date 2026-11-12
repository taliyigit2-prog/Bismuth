// CLAUDE.md yasak 8: tr.json is the source; en and ru carry exactly the same keys and placeholders. Plural keys
// (`x_one`, `x_few`, …) are compared by their base key: each language has the CLDR categories of its own plural
// rules (tr/en: one + other; ru: one + few + many + other).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const load = (lang: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, '../../src/renderer/i18n', `${lang}.json`), 'utf8'))

function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v as Record<string, unknown>, key))
    else out[key] = String(v)
  }
  return out
}

const PLURAL = /_(zero|one|two|few|many|other)$/
const LOCALE: Record<string, string> = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU' }
const base = (key: string): string => key.replace(PLURAL, '')
const placeholders = (s: string): string[] => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1] ?? '').sort()

/** Base key → placeholders of its texts (a plural group shares its variables). */
function byBase(texts: Record<string, string>): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [key, text] of Object.entries(texts)) {
    const vars = [...new Set([...(out.get(base(key)) ?? []), ...placeholders(text)])].sort()
    out.set(base(key), vars)
  }
  return out
}

describe('dil dosyaları', () => {
  const tr = flatten(load('tr'))
  const trBases = byBase(tr)
  for (const lang of ['en', 'ru']) {
    const other = flatten(load(lang))
    const otherBases = byBase(other)
    it(`${lang}.json tr.json ile aynı anahtarlara sahip`, () => {
      expect([...otherBases.keys()].sort()).toEqual([...trBases.keys()].sort())
    })
    it(`${lang}.json değişkenleri ({{…}}) tr.json ile aynı`, () => {
      for (const [key, vars] of trBases) expect(otherBases.get(key) ?? [], key).toEqual(vars)
    })
    it(`${lang}.json boş metin içermez`, () => {
      for (const [key, text] of Object.entries(other)) expect(text.trim(), key).not.toBe('')
    })
  }
  it('her dil kendi çoğul biçimlerinin hepsine sahip', () => {
    for (const lang of ['tr', 'en', 'ru']) {
      const needed = [...new Intl.PluralRules(LOCALE[lang]).resolvedOptions().pluralCategories].sort()
      const groups = new Map<string, string[]>()
      for (const key of Object.keys(flatten(load(lang)))) {
        const m = key.match(PLURAL)
        if (m?.[1]) groups.set(base(key), [...(groups.get(base(key)) ?? []), m[1]])
      }
      for (const [key, cats] of groups) expect(cats.sort(), `${lang}: ${key}`).toEqual(needed)
    }
  })
})
