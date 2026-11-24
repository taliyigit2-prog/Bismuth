#!/usr/bin/env node
// Owner review gallery: screenshots → WebP + one index.html (template.html) that keeps the owner's verdicts in the
// artifact's db (reviews/<key> = {status: approved|changes, note, title, at}; general/note = {note, at}).
// Usage: node .agent/skills/owner-review/build.mjs <review.json> <shots dir with tr/ en/ ru/> <out dir>
// review.json: {"title": "Bismuth Faz 5 onayı", "eyebrow": "Faz 5 · rezervasyon takvimi", "date": "2026-10-06",
//   "lede": "…plain Turkish…", "groups": [{"group": "Takvim", "items": [{"key": "calendar", "title": "Takvim",
//   "desc": "…", "req": "G-30"}]}]}
// Expects <shots>/<lang>/<key>-<desktop|mobile>-<light|dark>.png (English and Russian: light only). Needs ImageMagick.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const [reviewFile, shots, out] = process.argv.slice(2)
if (!reviewFile || !shots || !out) {
  console.error('usage: build.mjs <review.json> <shots dir> <out dir>')
  process.exit(1)
}
const review = JSON.parse(readFileSync(reviewFile, 'utf8'))
const magick = spawnSync('magick', ['-version']).status === 0 ? 'magick' : 'convert'

const files = []
const missing = []
for (const lang of ['tr', 'en', 'ru']) {
  mkdirSync(join(out, 'img', lang), { recursive: true })
  for (const { items } of review.groups) {
    for (const { key } of items) {
      for (const device of ['desktop', 'mobile']) {
        for (const theme of ['light', 'dark']) {
          if (lang !== 'tr' && theme === 'dark') continue
          const src = join(shots, lang, `${key}-${device}-${theme}.png`)
          const dst = join(out, 'img', lang, `${key}-${device}-${theme}.webp`)
          if (!existsSync(src)) {
            missing.push(src)
            continue
          }
          const args = [src, ...(device === 'mobile' ? ['-resize', '585x'] : [])]
          args.push('-quality', '72', '-define', 'webp:method=6', dst)
          const res = spawnSync(magick, args, { stdio: 'inherit' })
          if (res.status !== 0) process.exit(res.status ?? 1)
          files.push(relative(out, dst))
        }
      }
    }
  }
}
if (missing.length > 0) {
  console.error(`missing screenshots:\n${missing.join('\n')}`)
  process.exit(1)
}

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'template.html'), 'utf8')
const html = template
  .replaceAll('__TITLE__', review.title)
  .replace('__EYEBROW__', review.eyebrow)
  .replace('__DATE__', review.date)
  .replace('__LEDE__', review.lede)
  .replace('__SCREENS__', JSON.stringify(review.groups))
writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, 'files.json'), JSON.stringify(files))
console.log(`${files.length} images → ${out}`)
