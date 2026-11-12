// Searching the guide: every heading, paragraph, list item and box, matched word by word without minding case or
// Turkish/Russian letter marks ("odeme" finds "Ödeme", "kasa" finds "Kasa"), each hit pointing at the nearest
// heading so the page opens right there.
import type { Block, Inline } from './markdown'
import { inlineText } from './markdown'
import type { GuideSection, GuideSectionId } from './sections'

export interface GuideHit {
  section: GuideSectionId
  sectionTitle: string
  /** Nearest heading above the text (null: the top of the page). */
  anchor: string | null
  heading: string
  /** The matching text, shortened around the first word. */
  snippet: string
}

/** Lower case, without accents: ı/i, ş/s, ö/o, ё/е… compare equal. */
export function foldText(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ё/g, 'е')
}

interface Piece {
  anchor: string | null
  heading: string
  text: string
}

function pieces(section: GuideSection): Piece[] {
  const out: Piece[] = []
  let anchor: string | null = null
  let heading = section.title
  const walk = (blocks: readonly Block[]): void => {
    for (const b of blocks) {
      switch (b.t) {
        case 'heading':
          if (b.level > 1) {
            anchor = b.id ?? anchor
            heading = inlineText(b.c)
          }
          out.push({ anchor, heading, text: inlineText(b.c) })
          break
        case 'paragraph':
          out.push({ anchor, heading, text: inlineText(b.c) })
          break
        case 'list':
          for (const item of b.items as Inline[][]) out.push({ anchor, heading, text: inlineText(item) })
          break
        case 'callout':
          walk(b.blocks)
          break
        case 'image':
          if (b.alt) out.push({ anchor, heading, text: b.alt })
          break
        case 'shortcuts':
          // The table's words are the program's own (shortcuts.*); the heading above it is what a search finds.
          break
      }
    }
  }
  walk(section.blocks)
  return out
}

function snippetOf(text: string, word: string): string {
  const at = foldText(text).indexOf(word)
  if (text.length <= 160 || at < 0) return text.length <= 160 ? text : `${text.slice(0, 157)}…`
  const from = Math.max(0, at - 60)
  const to = Math.min(text.length, from + 160)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`
}

/**
 * Hits for a query: every word must appear in the same piece of text. At most one hit per heading, at most
 * `limit` hits; sections in reading order.
 */
export function searchGuide(sections: readonly GuideSection[], query: string, limit = 40): GuideHit[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const hits: GuideHit[] = []
  for (const section of sections) {
    const seen = new Set<string>()
    for (const piece of pieces(section)) {
      const folded = foldText(piece.text)
      if (!words.every((w) => folded.includes(w))) continue
      const key = piece.anchor ?? ''
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({
        section: section.id,
        sectionTitle: section.title,
        anchor: piece.anchor,
        heading: piece.heading,
        snippet: snippetOf(piece.text, words[0] ?? '')
      })
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
