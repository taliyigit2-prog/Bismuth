// KBS nationality → ministry country (K-24, K-29, K-36; 03-mimari.md §6.11).
// KBS writes nationalities mostly as English upper-case names, sometimes with a native name in parentheses,
// a few non-ISO or historical entries and occasional misspellings of "Türkiye" and "Kuzey Kıbrıs". Lookup order:
// user-confirmed mapping (country_map, source=user) → seed alias → English/Turkish library name → fuzzy
// suggestion (always needs confirmation). Ambiguous ("KIBRIS") and sensitive ("CYPRUS") values are never
// mapped silently. The ministry panel has no list, only a type-ahead box, so the Turkish display name comes
// from here (ministry usage overrides the library name for a few countries).
// The core entry (not the Node entry, which require()s every language file dynamically and breaks the bundle).
import countries from 'i18n-iso-countries/index.js'
import enLocale from 'i18n-iso-countries/langs/en.json'
import trLocale from 'i18n-iso-countries/langs/tr.json'

countries.registerLocale(enLocale)
countries.registerLocale(trLocale)

/** Why a value cannot be used without the user's confirmation. */
export type NationalityReviewReason = 'typo' | 'ambiguous' | 'sensitive' | 'historical' | 'unknown'

export type NationalitySource = 'user' | 'seed' | 'library' | 'fuzzy' | 'unmapped'

export interface NationalityMatch {
  /** The value as written in the KBS file. */
  raw: string
  /** `normalizeCountryKey(raw)`: the country_map primary key. */
  key: string
  /** ISO 3166-1 alpha-2, or "XC" for the Turkish Republic of Northern Cyprus; null when unresolved. */
  iso2: string | null
  /** Turkish name to type into the ministry panel; null when unresolved. */
  ministryNameTr: string | null
  needsReview: boolean
  reason: NationalityReviewReason | null
  /** ISO codes the user can pick from (the single suggestion for a typo). */
  suggestions: readonly string[]
  source: NationalitySource
}

/** A mapping the user confirmed once (country_map row with source=user). */
export interface UserCountryMapping {
  iso2: string | null
  ministryNameTr: string
}

/** User-confirmed mappings keyed by `normalizeCountryKey(raw)`. */
export type UserCountryMap = Readonly<Record<string, UserCountryMapping>>

/** One country_map seed row (one per alias spelling). */
export interface CountrySeedRow {
  keyNormalized: string
  rawExample: string
  iso2: string | null
  ministryNameTr: string
}

/** Pseudo-ISO code used for the Turkish Republic of Northern Cyprus (not in ISO 3166). */
export const KKTC_ISO2 = 'XC'

const FOLD: Readonly<Record<string, string>> = {
  Ç: 'C',
  Ğ: 'G',
  İ: 'I',
  Ö: 'O',
  Ş: 'S',
  Ü: 'U',
  Â: 'A',
  Î: 'I',
  Û: 'U'
}

/**
 * Upper-case with Turkish rules, fold diacritics and drop punctuation:
 * "K.K.T.C." → "KKTC", "Türkiye" → "TURKIYE", "KOREA, REPUBLIC OF" → "KOREA REPUBLIC OF".
 */
export function normalizeCountryKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[ÇĞİÖŞÜÂÎÛ]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.'’`]/g, '')
    .replace(/[^A-Z0-9()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "GERMANY (DEUTSCHLAND)" → "GERMANY". */
const stripParenthesis = (key: string): string => key.replace(/\s*\(.*\)\s*$/, '').trim()

interface SeedEntry {
  iso2: string | null
  /** Ministry display name; defaults to the library's Turkish name. */
  nameTr?: string
  names: readonly string[]
  review?: Exclude<NationalityReviewReason, 'typo' | 'unknown'>
  suggestions?: readonly string[]
}

// Seed aliases. Entries with `review` are valid spellings that are ambiguous or sensitive: they are suggested,
// never applied, until the user confirms them once.
const SEED: readonly SeedEntry[] = [
  {
    iso2: 'TR',
    names: [
      'TÜRKİYE',
      'TURKEY',
      'TÜRKİYE CUMHURİYETİ',
      'REPUBLIC OF TURKEY',
      'REPUBLIC OF TÜRKİYE',
      'TÜRKEI',
      'T.C.',
      'TR'
    ]
  },
  {
    iso2: KKTC_ISO2,
    nameTr: 'Kuzey Kıbrıs Türk Cumhuriyeti',
    names: [
      'KUZEY KIBRIS TÜRK CUMHURİYETİ',
      'KKTC',
      'K.K.T.C.',
      'KUZEY KIBRIS',
      'KIBRIS TÜRK',
      'KIBRIS (KUZEY)',
      'TURKISH REPUBLIC OF NORTHERN CYPRUS',
      'NORTHERN CYPRUS',
      'NORTH CYPRUS',
      'TRNC'
    ]
  },
  {
    iso2: 'CY',
    names: ['CYPRUS', 'REPUBLIC OF CYPRUS', 'GÜNEY KIBRIS', 'GÜNEY KIBRIS RUM YÖNETİMİ', 'GKRY'],
    review: 'sensitive'
  },
  { iso2: null, names: ['KIBRIS'], review: 'ambiguous', suggestions: [KKTC_ISO2, 'CY'] },
  {
    iso2: null,
    nameTr: 'Sırbistan ve Karadağ',
    names: ['SERBIA AND MONTENEGRO'],
    review: 'historical',
    suggestions: ['RS', 'ME']
  },
  { iso2: 'PS', nameTr: 'Filistin', names: ['PALESTINIAN TERRITORIES', 'PALESTINE', 'FİLİSTİN'] },
  { iso2: 'XK', nameTr: 'Kosova', names: ['KOSOVO', 'KOSOVA'] },
  { iso2: 'RU', nameTr: 'Rusya Federasyonu', names: ['RUSSIAN FEDERATION'] },
  { iso2: 'US', nameTr: 'Amerika Birleşik Devletleri', names: ['UNITED STATES'] },
  { iso2: 'KR', names: ['KOREA, REPUBLIC OF'] },
  { iso2: 'IR', names: ['IRAN, ISLAMIC REPUBLIC OF'] },
  { iso2: 'SY', names: ['SYRIAN ARAB REPUBLIC'] }
]

/** Countries whose every automatic match is shown to the user first. */
const SENSITIVE_ISO2: ReadonlySet<string> = new Set(['CY'])

const MINISTRY_NAME_TR: ReadonlyMap<string, string> = new Map(
  SEED.flatMap((e) => (e.iso2 && e.nameTr ? [[e.iso2, e.nameTr] as const] : []))
)

/** Turkish ministry display name for a code: ministry usage first, then the library's Turkish name. */
export function ministryNameOf(iso2: string): string {
  return MINISTRY_NAME_TR.get(iso2) ?? countries.getName(iso2, 'tr') ?? iso2
}

interface IndexEntry {
  iso2: string | null
  nameTr: string | null
  review: NationalityReviewReason | null
  suggestions: readonly string[]
  source: 'seed' | 'library'
}

// Every known spelling → entry. Seed first so it wins over library names.
const INDEX = new Map<string, IndexEntry>()
for (const e of SEED) {
  const entry: IndexEntry = {
    iso2: e.iso2,
    nameTr: e.nameTr ?? (e.iso2 ? ministryNameOf(e.iso2) : null),
    review: e.review ?? null,
    suggestions: e.suggestions ?? (e.review && e.iso2 ? [e.iso2] : []),
    source: 'seed'
  }
  for (const n of e.names) {
    const k = normalizeCountryKey(n)
    if (!INDEX.has(k)) INDEX.set(k, entry)
  }
}
for (const lang of ['en', 'tr'] as const) {
  for (const [iso2, names] of Object.entries(countries.getNames(lang, { select: 'all' }))) {
    const sensitive = SENSITIVE_ISO2.has(iso2)
    const entry: IndexEntry = {
      iso2,
      nameTr: ministryNameOf(iso2),
      review: sensitive ? 'sensitive' : null,
      suggestions: sensitive ? [iso2] : [],
      source: 'library'
    }
    for (const n of names) {
      const k = normalizeCountryKey(n)
      if (k && !INDEX.has(k)) INDEX.set(k, entry)
    }
  }
}

/** Every code a stay can be counted under: ISO 3166-1, plus KKTC ("XC") and Kosovo ("XK"). */
export const COUNTRY_CODES: readonly string[] = [
  ...new Set([...Object.keys(countries.getAlpha2Codes()), KKTC_ISO2, 'XK'])
]

/**
 * Optimal string alignment distance (Levenshtein + adjacent transposition). Returns `max + 1` as soon as the
 * distance is known to exceed `max`.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const width = b.length + 1
  const d = new Int32Array((a.length + 1) * width)
  const at = (i: number, j: number): number => d[i * width + j] ?? 0
  for (let j = 0; j <= b.length; j++) d[j] = j
  for (let i = 1; i <= a.length; i++) {
    d[i * width] = i
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, at(i - 2, j - 2) + 1)
      d[i * width + j] = v
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
  }
  return Math.min(at(a.length, b.length), max + 1)
}

/** Allowed misspelling distance by length: short names and codes are never guessed. */
const typoBudget = (length: number): number => (length >= 8 ? 2 : length >= 5 ? 1 : 0)

function fromEntry(raw: string, key: string, e: IndexEntry): NationalityMatch {
  return {
    raw,
    key,
    iso2: e.iso2,
    ministryNameTr: e.nameTr,
    needsReview: e.review !== null,
    reason: e.review,
    suggestions: e.suggestions,
    source: e.source
  }
}

/** Map one KBS "Uyruğu" value. `userMap` (keyed by normalized key) always wins. */
export function mapNationality(raw: string, userMap: UserCountryMap = {}): NationalityMatch {
  const key = normalizeCountryKey(raw)
  const user = Object.hasOwn(userMap, key) ? userMap[key] : undefined
  if (user) {
    return {
      raw,
      key,
      iso2: user.iso2,
      ministryNameTr: user.ministryNameTr,
      needsReview: false,
      reason: null,
      suggestions: [],
      source: 'user'
    }
  }
  const base = stripParenthesis(key)
  const hit = INDEX.get(key) ?? INDEX.get(base)
  if (hit) return fromEntry(raw, key, hit)

  // Misspelling guard: a unique nearest country is suggested, but the user must confirm it.
  const max = typoBudget(base.length)
  let best = max + 1
  let candidates = new Set<string>()
  if (max > 0) {
    for (const [k, e] of INDEX) {
      if (!e.iso2) continue
      const dist = editDistance(base, k, max)
      if (dist < best) {
        best = dist
        candidates = new Set([e.iso2])
      } else if (dist === best && dist <= max) {
        candidates.add(e.iso2)
      }
    }
  }
  const [only] = candidates
  if (best <= max && candidates.size === 1 && only) {
    return {
      raw,
      key,
      iso2: only,
      ministryNameTr: ministryNameOf(only),
      needsReview: true,
      reason: 'typo',
      suggestions: [only],
      source: 'fuzzy'
    }
  }
  const suggestions = best <= max ? [...candidates] : []
  return {
    raw,
    key,
    iso2: null,
    ministryNameTr: null,
    needsReview: true,
    reason: suggestions.length > 0 ? 'ambiguous' : 'unknown',
    suggestions,
    source: 'unmapped'
  }
}

/**
 * Seed rows for the country_map table: one row per seed alias spelling that maps without review. Spellings that
 * need confirmation (KIBRIS, CYPRUS, SERBIA AND MONTENEGRO…) are deliberately absent: a country_map row means
 * "confirmed", and those stay in code so they are always asked. Library names are resolved at runtime.
 */
export const COUNTRY_SEED_ROWS: readonly CountrySeedRow[] = (() => {
  const rows = new Map<string, CountrySeedRow>()
  for (const e of SEED) {
    if (e.review || !e.iso2) continue
    const ministryNameTr = e.nameTr ?? ministryNameOf(e.iso2)
    for (const rawExample of e.names) {
      const keyNormalized = normalizeCountryKey(rawExample)
      if (!rows.has(keyNormalized))
        rows.set(keyNormalized, { keyNormalized, rawExample, iso2: e.iso2, ministryNameTr })
    }
  }
  return [...rows.values()]
})()
