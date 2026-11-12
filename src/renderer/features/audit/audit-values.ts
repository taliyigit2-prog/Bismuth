// The two sides of an audit row (G-24) paired up field by field: nested records open into paths
// ("permissions › staff"), the bookkeeping times never count as a change, and an amount finds its currency.
// Pure: audit-diff.tsx draws the result.
import { AUDIT_NOISE_FIELDS } from './audit-labels'

export type Fields = Record<string, unknown>

/** One leaf of the two records: its path, both values and the records holding them (for a sibling currency). */
export interface DiffRow {
  path: string[]
  before: unknown
  after: unknown
  changed: boolean
  beforeIn: Fields
  afterIn: Fields
}

export type Diff =
  | { kind: 'hidden' }
  | { kind: 'empty' }
  | { kind: 'value'; row: DiffRow; hasBefore: boolean; hasAfter: boolean }
  | { kind: 'fields'; rows: DiffRow[]; compared: boolean; hasBefore: boolean; hasAfter: boolean }

/** Nested records are opened this deep ("permissions › staff"); deeper ones show as text. */
const MAX_DEPTH = 3

export const isObject = (v: unknown): v is Fields => v !== null && typeof v === 'object' && !Array.isArray(v)
export const isHidden = (v: unknown): boolean =>
  isObject(v) && v['hidden'] === true && Object.keys(v).length === 1
const missing = (v: unknown): boolean => v === null || v === undefined
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** A record that can be opened into its fields (not a hidden marker). */
const openable = (v: unknown): v is Fields => isObject(v) && !isHidden(v)

function flatten(
  before: Fields | undefined,
  after: Fields | undefined,
  path: string[],
  compared: boolean,
  out: DiffRow[]
): void {
  const b = before ?? {}
  const a = after ?? {}
  for (const field of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
    const bv = b[field]
    const av = a[field]
    const at = [...path, field]
    const nested =
      at.length < MAX_DEPTH &&
      (openable(bv) || openable(av)) &&
      (openable(bv) || missing(bv)) &&
      (openable(av) || missing(av))
    if (nested) {
      flatten(openable(bv) ? bv : undefined, openable(av) ? av : undefined, at, compared, out)
      continue
    }
    out.push({
      path: at,
      before: bv,
      after: av,
      changed: compared && !AUDIT_NOISE_FIELDS.has(field) && !same(bv, av),
      beforeIn: b,
      afterIn: a
    })
  }
}

/** Pairs the two sides up by field path; `compared` when both sides exist (only then is "changed" meaningful). */
export function diffOf(before: unknown, after: unknown): Diff {
  if (isHidden(before) || isHidden(after)) return { kind: 'hidden' }
  if (missing(before) && missing(after)) return { kind: 'empty' }
  const hasBefore = !missing(before)
  const hasAfter = !missing(after)
  if ((isObject(before) || !hasBefore) && (isObject(after) || !hasAfter)) {
    const compared = isObject(before) && isObject(after)
    const rows: DiffRow[] = []
    flatten(isObject(before) ? before : undefined, isObject(after) ? after : undefined, [], compared, rows)
    return { kind: 'fields', compared, rows, hasBefore, hasAfter }
  }
  return {
    kind: 'value',
    hasBefore,
    hasAfter,
    row: {
      path: [],
      before,
      after,
      changed: hasBefore && !same(before, after),
      beforeIn: {},
      afterIn: {}
    }
  }
}

const CURRENCY = /^[A-Z]{3}$/

/**
 * The currency of an amount in minor units: its own field ("basePriceMinor" → "baseCurrency", "defaultPriceMinor"
 * → "defaultCurrency"), the record's "currency", else the hotel's base currency (amounts without one are kept in
 * it, G-131).
 */
export function currencyOf(field: string, record: Fields, fallback: string): string {
  const stem = field.replace(/Minor$/, '')
  const keys = [
    `${stem}Currency`,
    `${stem.replace(/(Price|Amount)$/, '')}Currency`,
    'currency',
    'baseCurrency'
  ]
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && CURRENCY.test(value)) return value
  }
  return fallback
}

/** "2026-10-04T12:59:00.000Z": an instant the screen shows as a local date and time. */
export const isIsoTime = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v) &&
  !Number.isNaN(Date.parse(v))
