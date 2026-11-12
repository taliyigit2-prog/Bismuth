// Field limits read from the contract's zod schemas, so a form's `maxLength` / `min` / `max` and its "1 ile 500
// arasında" message come from the same place the service checks (one source; a limit changed in the contract
// changes the form with it). Unwraps optional / nullable / default / transform layers to the string or number.
import * as z from 'zod'

export interface FieldLimits {
  /** Longest text (characters) the service accepts. */
  maxLength?: number
  /** Smallest / largest number (inclusive; an exclusive bound such as `.positive()` reads as its edge). */
  min?: number
  max?: number
  /** Whole numbers only. */
  integer?: boolean
}

interface Inner {
  unwrap?: () => z.ZodType
  in?: z.ZodType
  def?: { innerType?: z.ZodType }
}

/** The string or number under the wrappers (`optional`, `nullable`, `nullish`, `default`, a transform pipe). */
function core(schema: z.ZodType): z.ZodType {
  let s: z.ZodType = schema
  for (let i = 0; i < 10; i++) {
    if (s instanceof z.ZodString || s instanceof z.ZodNumber) return s
    const inner = s as unknown as Inner
    if (s instanceof z.ZodPipe && inner.in) s = inner.in
    else if (inner.def?.innerType) s = inner.def.innerType
    else if (typeof inner.unwrap === 'function') s = inner.unwrap()
    else return s
  }
  return s
}

const finite = (n: number | null | undefined): number | undefined =>
  n == null || !Number.isFinite(n) || Math.abs(n) >= Number.MAX_SAFE_INTEGER ? undefined : n

/** The limits of one field schema ({} when it has none). */
export function fieldLimits(schema: z.ZodType): FieldLimits {
  const s = core(schema)
  if (s instanceof z.ZodString) {
    const max = finite(s.maxLength)
    return max === undefined ? {} : { maxLength: max }
  }
  if (s instanceof z.ZodNumber) {
    const out: FieldLimits = {}
    const min = finite(s.minValue)
    const max = finite(s.maxValue)
    if (min !== undefined) out.min = min
    if (max !== undefined) out.max = max
    if (s.isInt) out.integer = true
    return out
  }
  return {}
}

type Shape = Record<string, z.ZodType>

/** Limits of every field of an object schema, by field name. */
export function limitsOf<S extends Shape>(schema: { shape: S }): { [K in keyof S]: FieldLimits } {
  const out = {} as { [K in keyof S]: FieldLimits }
  for (const key of Object.keys(schema.shape) as (keyof S)[]) out[key] = fieldLimits(schema.shape[key]!)
  return out
}

/** `maxLength` of a text field, for an `<input maxLength>` (throws in development when the field has none). */
export function maxLengthOf(schema: z.ZodType): number {
  const max = fieldLimits(schema).maxLength
  if (max === undefined) throw new Error('field has no maximum length')
  return max
}
