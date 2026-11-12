#!/usr/bin/env node
// npm run i18n:add -- <spec.json> [...more specs]
// Merges keys into src/renderer/i18n/{tr,en,ru}.json from spec files, so parallel agents never hand-edit the three
// JSON files (their branches would conflict) and the main checkout applies each agent's spec after the merge.
// Spec: {"ns.key": ["tr", "en", "ru"], "ns.count": {"tr": {"one": "…", "other": "…"}, "en": {…}, "ru": {"one", "few",
// "many", "other"}}}. A null in the array keeps that language's current text. Existing keys keep their place, new
// keys are appended to their parent object. Keys are never deleted here (unused keys: `npm run i18n:check`).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.env.I18N_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'src', 'renderer', 'i18n')
const LANGS = ['tr', 'en', 'ru']

const specs = process.argv.slice(2)
if (specs.length === 0) {
  console.error('usage: npm run i18n:add -- <spec.json> [...]')
  process.exit(1)
}

const data = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(readFileSync(join(dir, `${l}.json`), 'utf8'))])
)

function put(obj, path, value) {
  const parts = path.split('.')
  let node = obj
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] !== 'object' || node[p] === null || Array.isArray(node[p])) node[p] = {}
    node = node[p]
  }
  node[parts.at(-1)] = value
}

let count = 0
for (const file of specs) {
  const spec = JSON.parse(readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(spec)) {
    if (Array.isArray(value)) {
      if (value.length !== 3) throw new Error(`${file}: ${key} needs [tr, en, ru]`)
      LANGS.forEach((l, i) => {
        if (value[i] !== null) put(data[l], key, value[i])
      })
    } else {
      for (const l of LANGS) {
        const forms = value[l]
        if (!forms) throw new Error(`${file}: ${key} has no ${l} plural forms`)
        for (const [cat, text] of Object.entries(forms)) put(data[l], `${key}_${cat}`, text)
      }
    }
    count++
  }
}
for (const l of LANGS) writeFileSync(join(dir, `${l}.json`), `${JSON.stringify(data[l], null, 2)}\n`)
console.log(`${count} keys merged from ${specs.length} spec file(s)`)
