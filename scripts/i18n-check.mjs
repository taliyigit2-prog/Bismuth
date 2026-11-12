#!/usr/bin/env node
// npm run i18n:check — every literal t('a.b') / tMain('a.b') key used in code exists in tr.json, and
// en.json / ru.json have exactly the keys of tr.json (CLAUDE.md yasak 8). Dynamic keys (t(item.labelKey),
// t(`status.${key}`)) are typed by the i18next declaration and checked by `npm run typecheck`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')
const load = (lang) => JSON.parse(readFileSync(join(root, 'src/renderer/i18n', `${lang}.json`), 'utf8'))
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, prefix ? `${prefix}.${k}` : k) : [prefix ? `${prefix}.${k}` : k]
  )

// Plural keys (`x_one`, `x_few`, …) follow each language's CLDR categories: Turkish and English need
// one/other, Russian one/few/many/other. They are compared by their base key; every language must have
// exactly the categories its own plural rules use.
const PLURAL = /_(zero|one|two|few|many|other)$/
const LOCALE = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU' }
const shape = (lang) => {
  const plain = new Set()
  const plurals = new Map()
  for (const k of flatten(load(lang))) {
    const m = k.match(PLURAL)
    if (!m) plain.add(k)
    else plurals.set(k.slice(0, -m[0].length), [...(plurals.get(k.slice(0, -m[0].length)) ?? []), m[1]])
  }
  return { plain, plurals }
}
const keysOf = ({ plain, plurals }) => new Set([...plain, ...plurals.keys()])

let problems = 0
const report = (message) => {
  problems++
  console.error(message)
}
const shapes = Object.fromEntries(['tr', 'en', 'ru'].map((lang) => [lang, shape(lang)]))
for (const lang of ['tr', 'en', 'ru']) {
  const needed = new Intl.PluralRules(LOCALE[lang]).resolvedOptions().pluralCategories.sort().join(',')
  for (const [base, cats] of shapes[lang].plurals)
    if ([...cats].sort().join(',') !== needed)
      report(`${lang}.json çoğul biçimleri ${base}: ${[...cats].sort().join(',')} (gereken: ${needed})`)
}
const tr = keysOf(shapes.tr)
for (const lang of ['en', 'ru']) {
  const other = keysOf(shapes[lang])
  for (const k of tr) if (!other.has(k)) report(`${lang}.json eksik: ${k}`)
  for (const k of other) if (!tr.has(k)) report(`${lang}.json fazla: ${k}`)
}

// The same {{placeholders}} in every language (a renamed variable silently prints nothing). Plural forms
// are compared per base key: some forms may leave out {{count}}, so the union of the forms is compared.
const values = Object.fromEntries(
  ['tr', 'en', 'ru'].map((lang) => {
    const out = new Map()
    const walkValues = (obj, prefix = '') => {
      for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object') walkValues(v, key)
        else {
          const base = key.replace(PLURAL, '')
          const vars = out.get(base) ?? new Set()
          for (const m of String(v).matchAll(/\{\{\s*([\w.]+)/g)) vars.add(m[1])
          out.set(base, vars)
        }
      }
    }
    walkValues(load(lang))
    return [lang, out]
  })
)
for (const [key, vars] of values.tr)
  for (const lang of ['en', 'ru']) {
    const other = values[lang].get(key)
    if (!other) continue
    const a = [...vars].sort().join(',')
    const b = [...other].sort().join(',')
    if (a !== b) report(`${lang}.json değişkenleri farklı: ${key} (tr: ${a || '—'}, ${lang}: ${b || '—'})`)
  }

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
  }
}
walk(join(root, 'src/renderer'))
walk(join(root, 'src/main'))
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(/\b(?:t|tMain)\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g)) {
    if (!tr.has(m[1])) report(`${relative(root, file)}: tr.json'da yok: ${m[1]}`)
  }
}
if (problems) process.exit(1)
console.log(`i18n: ${tr.size} anahtar; tr/en/ru eşit; koddaki anahtarların hepsi tr.json'da`)
