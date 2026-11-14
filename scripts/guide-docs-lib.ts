// docs/otel/kullanim-kilavuzu.md from the program's own Turkish guide
// (src/renderer/guide/content/tr/*.md, K-40), so the user guide in the repository and the one inside the program are
// the same text (Faz 16 madde 7). Guide links become anchors of this one file, pictures point at the bundled
// screenshots, "ipucu / dikkat" boxes become GitHub notes, author notes (<!-- doğrula: … -->) are dropped, and
// `[[shortcuts]]` becomes the keyboard shortcut table, written from the program's own list (lib/shortcuts/registry.ts)
// with the Turkish texts of src/renderer/i18n/tr.json.
// `npm run guide:docs` (scripts/guide-docs.ts) writes it; tests/unit/guide-docs.test.ts fails when the file is
// older than the guide.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  comboText,
  SHORTCUT_GROUPS,
  SHORTCUTS,
  type ShortcutDef
} from '../src/renderer/lib/shortcuts/registry'

export interface GuidePage {
  /** File name, e.g. "03-reservations.md". */
  file: string
  text: string
}

const ROOT = resolve(__dirname, '..')
export const CONTENT_DIR = join(ROOT, 'src/renderer/guide/content/tr')
export const DOC_FILE = join(ROOT, 'docs/otel/kullanim-kilavuzu.md')
const IMAGE_DIR = '../../src/renderer/guide/img/tr'

const I18N_FILE = join(ROOT, 'src/renderer/i18n/tr.json')

/** The shortcut table as Markdown (Turkish, Windows keys; the guide text says ⌘ on a Mac). */
export function shortcutTableMarkdown(dict: unknown = JSON.parse(readFileSync(I18N_FILE, 'utf8'))): string[] {
  const text = (key: string): string => {
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict)
    return typeof value === 'string' ? value : key
  }
  const keys = (def: ShortcutDef): string =>
    def.keys
      .map((combo) =>
        comboText(combo, false)
          .split(' + ')
          .map((cap) => `<kbd>${cap}</kbd>`)
          .join(' + ')
      )
      .join(def.keys.every((k) => k.startsWith('Arrow')) ? ' ' : ` ${text('shortcuts.or')} `)
  const out: string[] = []
  for (const group of SHORTCUT_GROUPS) {
    out.push(`**${text(`shortcuts.group.${group}`)}**`, '', '| | |', '|---|---|')
    for (const def of SHORTCUTS.filter((s) => s.group === group))
      out.push(`| ${text(def.labelKey)} | ${keys(def)} |`)
    out.push('')
  }
  out.push(text('shortcuts.typingNote'))
  return out
}

const sectionId = (file: string): string => file.replace(/^\d{2}-/, '').replace(/\.md$/, '')

function convertLine(line: string): string[] {
  if (line.trim() === '[[shortcuts]]') return shortcutTableMarkdown()
  const heading = /^(#{2,3})\s+(.*?)(?:\s+\{#([a-z0-9-]+)\})?\s*$/.exec(line)
  if (heading) {
    const level = (heading[1] ?? '##').length + 1
    const text = `${'#'.repeat(level)} ${heading[2] ?? ''}`
    return heading[3] ? [`<a id="${heading[3]}"></a>`, '', text] : [text]
  }
  const image = /^!\[([^\]]*)\]\(([a-z0-9-]+)\)\s*$/.exec(line.trim())
  if (image) return [`![${image[1] ?? ''}](${IMAGE_DIR}/${image[2] ?? ''}.jpg)`]
  const callout = /^>\s*\[!(tip|warning)\]\s*$/i.exec(line)
  if (callout) return [`> [!${(callout[1] ?? 'tip').toLowerCase() === 'warning' ? 'WARNING' : 'TIP'}]`]
  return [
    line
      // [text](guide:section#anchor) → #anchor; [text](guide:section) → #section; [text](app:/x) → text.
      .replace(/\[([^\]]+)\]\(guide:([a-z0-9-]+)#([a-z0-9-]+)\)/g, '[$1](#$3)')
      .replace(/\[([^\]]+)\]\(guide:([a-z0-9-]+)\)/g, '[$1](#$2)')
      .replace(/\[([^\]]+)\]\(app:\/[a-z0-9-]*\)/g, '$1')
  ]
}

/** The whole user guide as one Markdown file. */
export function renderGuideDoc(pages: readonly GuidePage[]): string {
  const sorted = [...pages].sort((a, b) => a.file.localeCompare(b.file))
  const titles = sorted.map((p) => /^#\s+(.+)$/m.exec(p.text)?.[1]?.trim() ?? sectionId(p.file))
  const out: string[] = [
    '# Bismuth kullanım kılavuzu',
    '',
    '> Bu dosya programın içindeki kılavuzdan (`src/renderer/guide/content/tr/`) `npm run guide:docs` ile üretilir;',
    '> elle düzenlemeyin. Programda: **Ayarlar → Kılavuz** ya da her ekranın üst çubuğundaki **?** düğmesi.',
    '',
    '## İçindekiler',
    '',
    ...sorted.map((p, i) => `${i + 1}. [${titles[i]}](#${sectionId(p.file)})`),
    ''
  ]
  sorted.forEach((page, i) => {
    const lines = page.text
      .replace(/\r\n?/g, '\n')
      .replace(/<!--[\s\S]*?-->\n?/g, '')
      .split('\n')
    out.push(`<a id="${sectionId(page.file)}"></a>`, '', `## ${i + 1}. ${titles[i]}`)
    for (const line of lines) {
      if (/^#\s+/.test(line)) continue
      out.push(...convertLine(line))
    }
  })
  return `${out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}

/** The Turkish guide pages as they are on disk. */
export function readGuidePages(dir = CONTENT_DIR): GuidePage[] {
  return readdirSync(dir)
    .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
    .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') }))
}
