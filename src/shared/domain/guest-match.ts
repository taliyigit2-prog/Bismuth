// Guest name search with spelling slips (faz-06 kabul: "gadir garibov" finds "GADİR GADİROV"; G-51). Names come
// from Excel and passports in several spellings: case and Turkish letters are folded by `normalizeName`; on top of
// that a word of the query may differ from a word of the name by one letter (4–5 letters) or two (6+ letters),
// as long as at least one word matches exactly. Exact matches rank before near ones.
import { normalizeName } from './normalize'

/** Edit distance (insert, delete, replace, swap of two neighbours) up to `max`; `max + 1` when farther. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  // d[i][j]: distance between the first i letters of a and the first j letters of b (names are short).
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  const at = (i: number, j: number): number => d[i]?.[j] ?? 0
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, at(i - 2, j - 2) + 1)
      const row = d[i]
      if (row) row[j] = v
    }
  return Math.min(at(a.length, b.length), max + 1)
}

/** How far a word of the query may be from a word of the name. */
const allowed = (word: string): number => (word.length >= 6 ? 2 : word.length >= 4 ? 1 : 0)

export type NameMatch = 'exact' | 'near'

/**
 * Does the typed query find this (normalised) name? `exact`: every word of the query is inside a word of the name
 * (the search as you type); `near`: the remaining words are a slip away (and at least one word is exact).
 */
export function matchName(query: string, nameNormalized: string): NameMatch | null {
  const words = normalizeName(query).split(' ').filter(Boolean)
  if (!words.length) return null
  const parts = nameNormalized.split(' ').filter(Boolean)
  let exact = 0
  let near = 0
  for (const w of words) {
    if (parts.some((p) => p.includes(w))) exact++
    else if (allowed(w) && parts.some((p) => editDistance(w, p, allowed(w)) <= allowed(w))) near++
    else return null
  }
  if (!near) return 'exact'
  return exact > 0 ? 'near' : null
}

/**
 * Two full names probably of the same person (duplicate hint): same number of words and each word equal or a
 * slip away, at least one word equal.
 */
export function sameNameLikely(a: string, b: string): boolean {
  const x = normalizeName(a).split(' ').filter(Boolean)
  const y = normalizeName(b).split(' ').filter(Boolean)
  if (!x.length || x.length !== y.length) return false
  let equal = 0
  for (let i = 0; i < x.length; i++) {
    const w = x[i] ?? ''
    const v = y[i] ?? ''
    if (w === v) equal++
    else if (!allowed(w) || editDistance(w, v, allowed(w)) > allowed(w)) return false
  }
  return equal > 0
}
