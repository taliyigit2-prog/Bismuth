// The guide's sections (G-18, K-40): one Markdown file per section and language under content/<lang>/, named
// `NN-<id>.md` (NN = reading order). The same files, with the same anchors, exist in every language (a test keeps
// them equal). Who a section is mainly for drives the "Kimin için" filter; the text itself is open to everyone.
// Pages are loaded per language when the guide opens (the program does not carry three guides at start-up).
import type { AppLocale } from '@shared/format'
import { headingIds, inlineText, parseMarkdown, type Block } from './markdown'

export const GUIDE_AUDIENCES = ['reception', 'housekeeping', 'accounting', 'owner'] as const
export type GuideAudience = (typeof GUIDE_AUDIENCES)[number]

const ALL = GUIDE_AUDIENCES

/** Reading order and audience of every section; the file name carries the same id. */
export const GUIDE_SECTIONS = [
  { id: 'getting-started', audiences: ALL },
  { id: 'today', audiences: ['reception', 'owner'] },
  { id: 'reservations', audiences: ['reception', 'owner'] },
  { id: 'payments', audiences: ['reception', 'accounting', 'owner'] },
  { id: 'ledger', audiences: ['reception', 'accounting', 'owner'] },
  { id: 'guests', audiences: ['reception', 'owner'] },
  { id: 'in-house', audiences: ['reception', 'owner'] },
  { id: 'rooms', audiences: ['reception', 'housekeeping', 'owner'] },
  { id: 'housekeeping', audiences: ['housekeeping', 'owner'] },
  { id: 'tasks', audiences: ['reception', 'housekeeping', 'owner'] },
  { id: 'shift', audiences: ['reception', 'owner'] },
  { id: 'staff', audiences: ['accounting', 'owner'] },
  { id: 'operations', audiences: ['reception', 'housekeeping', 'accounting', 'owner'] },
  { id: 'currency', audiences: ['reception', 'accounting', 'owner'] },
  { id: 'month-end', audiences: ['accounting', 'owner'] },
  { id: 'tourism', audiences: ['reception', 'owner'] },
  { id: 'backup', audiences: ['owner'] },
  { id: 'remote', audiences: ['owner'] },
  { id: 'settings', audiences: ['owner'] },
  { id: 'faq', audiences: ALL },
  { id: 'installation', audiences: ['owner'] }
] as const satisfies readonly { id: string; audiences: readonly GuideAudience[] }[]

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id']

export const isGuideSectionId = (value: unknown): value is GuideSectionId =>
  typeof value === 'string' && GUIDE_SECTIONS.some((s) => s.id === value)

/** The guide's own audience for a role (custom roles and "Çalışan" see every section). */
export function audienceOfRole(roleCode: string | null | undefined): GuideAudience | null {
  switch (roleCode) {
    case 'owner':
    case 'manager':
      return 'owner'
    case 'reception':
      return 'reception'
    case 'accountant':
      return 'accounting'
    case 'housekeeping':
      return 'housekeeping'
    default:
      return null
  }
}

export interface GuideHeading {
  id: string
  level: 2 | 3
  text: string
}

export interface GuideSection {
  id: GuideSectionId
  audiences: readonly GuideAudience[]
  /** The page's `# heading`. */
  title: string
  /** First paragraph: the one-line summary on the guide's home cards. */
  summary: string
  headings: GuideHeading[]
  blocks: Block[]
}

/** File name → section id ("03-reservations.md" → "reservations"); null for a file outside the list. */
export function sectionIdOfFile(path: string): GuideSectionId | null {
  const name = path.split('/').pop() ?? ''
  const m = /^\d{2}-([a-z0-9-]+)\.md$/.exec(name)
  return m && isGuideSectionId(m[1]) ? m[1] : null
}

/** One page's text → its section (title, summary, outline). */
export function buildSection(id: GuideSectionId, source: string): GuideSection {
  const meta = GUIDE_SECTIONS.find((s) => s.id === id)
  const blocks = parseMarkdown(source)
  const title = blocks.find((b) => b.t === 'heading' && b.level === 1)
  const first = blocks.find((b) => b.t === 'paragraph')
  const ids = new Set(headingIds(blocks))
  return {
    id,
    audiences: meta?.audiences ?? ALL,
    title: title?.t === 'heading' ? inlineText(title.c) : id,
    summary: first?.t === 'paragraph' ? inlineText(first.c) : '',
    headings: blocks.flatMap((b) =>
      b.t === 'heading' && b.level > 1 && b.id && ids.has(b.id)
        ? [{ id: b.id, level: b.level as 2 | 3, text: inlineText(b.c) }]
        : []
    ),
    blocks
  }
}

// Each language's pages, loaded when first needed (separate chunks in the build).
const PAGES = import.meta.glob<string>('./content/*/*.md', { query: '?raw', import: 'default' })

/** The language's pages as `[file path, loader]`. */
export function pageLoaders(lang: AppLocale): [string, () => Promise<string>][] {
  return Object.entries(PAGES).filter(([path]) => path.startsWith(`./content/${lang}/`))
}

const cache = new Map<AppLocale, Promise<GuideSection[]>>()

/** Every section of the guide in one language, in reading order. */
export function loadGuide(lang: AppLocale): Promise<GuideSection[]> {
  let found = cache.get(lang)
  if (!found) {
    found = Promise.all(
      pageLoaders(lang).map(async ([path, load]) => {
        const id = sectionIdOfFile(path)
        return id ? buildSection(id, await load()) : null
      })
    ).then((sections) => {
      const byId = new Map(sections.flatMap((s) => (s ? [[s.id, s] as const] : [])))
      return GUIDE_SECTIONS.flatMap((meta) => {
        const section = byId.get(meta.id)
        return section ? [section] : []
      })
    })
    found.catch(() => cache.delete(lang))
    cache.set(lang, found)
  }
  return found
}
