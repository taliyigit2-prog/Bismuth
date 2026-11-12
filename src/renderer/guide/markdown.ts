// The guide's own small Markdown reader (K-40): the handful of things the guide text uses — headings with a fixed
// anchor (`## Ödeme almak {#take-payment}`), paragraphs, bullet and numbered lists, **bold**, <kbd>Ctrl</kbd>,
// a picture on its own line (`![Takvim](calendar)`), links inside the guide or to a screen, and "ipucu / dikkat"
// boxes (`> [!tip]`, `> [!warning]`), and `[[shortcuts]]` on its own line: the program's keyboard shortcut table, drawn
// from the same list the keys are read from (lib/shortcuts/registry.ts). It produces a plain tree; markdown-view.tsx turns the tree into React
// elements, so no text is ever handed to the browser as HTML. HTML comments (`<!-- doğrula: P10a -->`) are notes
// for the authors and are dropped; any other `<…>` stays visible text.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'kbd'; v: string }
  | { t: 'link'; href: GuideHref; c: Inline[] }

/** Where a link may go: another place in the guide, or one of the program's screens. Nothing outside. */
export type GuideHref =
  { kind: 'guide'; section: string | null; anchor: string | null } | { kind: 'app'; path: string }

export type CalloutKind = 'tip' | 'warning'

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; id: string | null; c: Inline[] }
  | { t: 'paragraph'; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { t: 'image'; name: string; alt: string }
  | { t: 'callout'; kind: CalloutKind; blocks: Block[] }
  | { t: 'shortcuts' }

const COMMENT = /<!--[\s\S]*?-->/g
const HEADING = /^(#{1,3})\s+(.*?)(?:\s+\{#([a-z0-9][a-z0-9-]*)\})?\s*$/
const BULLET = /^[-*]\s+(.*)$/
const NUMBERED = /^(\d{1,3})[.)]\s+(.*)$/
const IMAGE = /^!\[([^\]]*)\]\(([a-z0-9][a-z0-9-]*)\)\s*$/
const CALLOUT = /^\[!(tip|warning)\]\s*(.*)$/i
const ANCHOR = /^[a-z0-9][a-z0-9-]*$/
/** The shortcut table's place in a page. */
export const SHORTCUTS_DIRECTIVE = '[[shortcuts]]'

/** The DOM id of an anchor (anchors are unique across the whole guide). */
export const anchorId = (anchor: string): string => `guide-${anchor}`

/** `guide:payments#cash-drawer`, `#cash-drawer`, `app:/ledger`; anything else is not a link (null). */
export function parseHref(raw: string): GuideHref | null {
  if (raw.startsWith('app:/')) {
    const path = raw.slice(4)
    return /^\/[a-z0-9-]*$/.test(path) ? { kind: 'app', path } : null
  }
  let rest: string
  if (raw.startsWith('guide:')) rest = raw.slice(6)
  else if (raw.startsWith('#')) rest = raw
  else return null
  const [sectionPart = '', anchorPart] = rest.split('#', 2)
  const section = sectionPart === '' ? null : sectionPart
  const anchor = anchorPart === undefined || anchorPart === '' ? null : anchorPart
  if (section !== null && !ANCHOR.test(section)) return null
  if (anchor !== null && !ANCHOR.test(anchor)) return null
  if (section === null && anchor === null) return null
  return { kind: 'guide', section, anchor }
}

const INLINE = /\*\*(.+?)\*\*|<kbd>([^<]{1,40})<\/kbd>|\[([^\]]+)\]\(([^)\s]+)\)/g

/** Bold, keys and links inside one line of text; everything else is kept as typed. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const push = (node: Inline): void => {
    const last = out[out.length - 1]
    if (node.t === 'text' && last?.t === 'text') last.v += node.v
    else if (node.t !== 'text' || node.v !== '') out.push(node)
  }
  let at = 0
  for (const m of text.matchAll(INLINE)) {
    const index = m.index ?? 0
    push({ t: 'text', v: text.slice(at, index) })
    if (m[1] !== undefined) push({ t: 'strong', c: parseInline(m[1]) })
    else if (m[2] !== undefined) push({ t: 'kbd', v: m[2] })
    else {
      const label = m[3] ?? ''
      const href = parseHref(m[4] ?? '')
      if (href) push({ t: 'link', href, c: parseInline(label) })
      else push({ t: 'text', v: label })
    }
    at = index + m[0].length
  }
  push({ t: 'text', v: text.slice(at) })
  return out
}

/** The plain text of inline nodes (search, headings in the outline, picture captions). */
export function inlineText(nodes: readonly Inline[]): string {
  return nodes.map((n) => (n.t === 'text' || n.t === 'kbd' ? n.v : inlineText(n.c))).join('')
}

/** Parses one guide page. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').replace(COMMENT, '').split('\n')
  return parseLines(lines)
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  const isBlank = (line: string | undefined): boolean => line === undefined || line.trim() === ''
  const startsBlock = (line: string): boolean => {
    const s = line.trim()
    return (
      HEADING.test(s) ||
      BULLET.test(s) ||
      NUMBERED.test(s) ||
      IMAGE.test(s) ||
      s.startsWith('>') ||
      s === SHORTCUTS_DIRECTIVE
    )
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (trimmed === '') {
      i++
      continue
    }

    const heading = HEADING.exec(trimmed)
    if (heading) {
      const level = (heading[1] ?? '#').length as 1 | 2 | 3
      blocks.push({ t: 'heading', level, id: heading[3] ?? null, c: parseInline(heading[2] ?? '') })
      i++
      continue
    }

    if (trimmed === SHORTCUTS_DIRECTIVE) {
      blocks.push({ t: 'shortcuts' })
      i++
      continue
    }

    const image = IMAGE.exec(trimmed)
    if (image) {
      blocks.push({ t: 'image', alt: image[1] ?? '', name: image[2] ?? '' })
      i++
      continue
    }

    if (trimmed.startsWith('>')) {
      const inner: string[] = []
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        inner.push((lines[i] ?? '').trim().replace(/^>\s?/, ''))
        i++
      }
      const first = CALLOUT.exec(inner[0] ?? '')
      const kind: CalloutKind = first ? ((first[1] ?? 'tip').toLowerCase() as CalloutKind) : 'tip'
      if (first) inner[0] = first[2] ?? ''
      blocks.push({ t: 'callout', kind, blocks: parseLines(inner) })
      continue
    }

    const bullet = BULLET.exec(trimmed)
    const numbered = NUMBERED.exec(trimmed)
    if (bullet || numbered) {
      const ordered = !bullet
      const start = numbered ? Number(numbered[1]) : 1
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        const s = current.trim()
        const b = BULLET.exec(s)
        const n = NUMBERED.exec(s)
        if (s === '') {
          // A blank line ends the list unless the next line is another item of the same kind.
          const next = (lines[i + 1] ?? '').trim()
          if ((ordered ? NUMBERED : BULLET).test(next)) {
            i++
            continue
          }
          break
        }
        if (ordered ? n : b) {
          items.push((ordered ? n?.[2] : b?.[1]) ?? '')
          i++
          continue
        }
        // An indented line continues the item above it.
        if (/^\s{2,}/.test(current) && items.length > 0 && !startsBlock(current)) {
          items[items.length - 1] += ` ${s}`
          i++
          continue
        }
        break
      }
      blocks.push({ t: 'list', ordered, start, items: items.map(parseInline) })
      continue
    }

    const para: string[] = []
    while (i < lines.length && !isBlank(lines[i]) && (para.length === 0 || !startsBlock(lines[i] ?? ''))) {
      para.push((lines[i] ?? '').trim())
      i++
    }
    blocks.push({ t: 'paragraph', c: parseInline(para.join(' ')) })
  }
  return blocks
}

/** Every anchor a page offers: headings with an `{#id}`, in reading order. */
export function headingIds(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) =>
    b.t === 'heading' && b.id ? [b.id] : b.t === 'callout' ? headingIds(b.blocks) : []
  )
}

/** Every picture a page shows, in reading order. */
export function imageNames(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) => (b.t === 'image' ? [b.name] : b.t === 'callout' ? imageNames(b.blocks) : []))
}

/** Every link a page holds (checked by the tests: each one must lead somewhere). */
export function links(blocks: readonly Block[]): GuideHref[] {
  const fromInline = (nodes: readonly Inline[]): GuideHref[] =>
    nodes.flatMap((n) =>
      n.t === 'link' ? [n.href, ...fromInline(n.c)] : n.t === 'strong' ? fromInline(n.c) : []
    )
  return blocks.flatMap((b) => {
    switch (b.t) {
      case 'heading':
      case 'paragraph':
        return fromInline(b.c)
      case 'list':
        return b.items.flatMap(fromInline)
      case 'callout':
        return links(b.blocks)
      case 'image':
      case 'shortcuts':
        return []
    }
  })
}
