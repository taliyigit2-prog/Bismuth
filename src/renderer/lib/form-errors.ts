// Field-level form errors from the contract's own zod schemas (one source with the service, G-23):
// - `useSchemaErrors`: check a form's data before sending it; field path → message ("phones.0.number").
// - `useServerFieldErrors`: when the service still answers VALIDATION, put the message under the field(s) it
//   names instead of the general "Girilen bilgi geçersiz" toast (re-reads the sent data with the same schema for
//   exact paths; falls back to the top-level names the router sends, `z.flattenError`).
// - `useRangeText`: one wording for a number field's bounds ("1 ile 500 arasında bir tam sayı yazın.").
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type * as z from 'zod'
import type { FieldLimits } from '@shared/contract/limits'
import { useFormat } from '@/hooks/use-format'
import { ApiError } from './transport/types'

/** Field path ("name", "phones.0.number") → message shown under that field. */
export type FieldErrors = Record<string, string>

type Issue = z.core.$ZodIssue

/** Message for one zod issue, by its code and limit. */
export function useIssueText(): (issue: Issue) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return useCallback(
    (issue) => {
      switch (issue.code) {
        case 'too_big':
          return issue.origin === 'string'
            ? t('form.tooLong', { max: f.number(Number(issue.maximum)) })
            : t('form.tooBig', { max: f.number(Number(issue.maximum)) })
        case 'too_small':
          if (issue.origin === 'string')
            return Number(issue.minimum) <= 1
              ? t('form.required')
              : t('form.tooShort', { min: f.number(Number(issue.minimum)) })
          return t('form.tooSmall', { min: f.number(Number(issue.minimum)) })
        case 'invalid_type':
          return issue.expected === 'int' ? t('form.wholeNumber') : t('form.invalid')
        default:
          return t('form.invalid')
      }
    },
    [t, f]
  )
}

const pathOf = (issue: Issue): string => issue.path.map(String).join('.')

function collect(issues: readonly Issue[], text: (issue: Issue) => string): FieldErrors {
  const out: FieldErrors = {}
  for (const issue of issues) {
    const path = pathOf(issue)
    out[path] ??= text(issue)
  }
  return out
}

/** Checks `data` with `schema`; {} when it passes. */
export function useSchemaErrors(): (schema: z.ZodType, data: unknown) => FieldErrors {
  const text = useIssueText()
  return useCallback(
    (schema, data) => {
      const parsed = schema.safeParse(data)
      return parsed.success ? {} : collect(parsed.error.issues, text)
    },
    [text]
  )
}

interface Flattened {
  fieldErrors?: Record<string, unknown>
}

/**
 * The fields a VALIDATION answer is about, with their messages; null for any other error or when it names none of
 * the form's fields (the caller shows its usual toast). `schema` + `sent` = what the form sent, re-read here for
 * exact paths and limit messages; otherwise the top-level names of the router's answer (`z.flattenError`) that
 * are fields of `sent` get "Bu değer kabul edilmedi".
 */
export function useServerFieldErrors(): (
  error: unknown,
  schema?: z.ZodType,
  sent?: unknown
) => FieldErrors | null {
  const { t } = useTranslation()
  const text = useIssueText()
  return useCallback(
    (error, schema, sent) => {
      if (!(error instanceof ApiError) || error.code !== 'VALIDATION') return null
      if (schema) {
        const parsed = schema.safeParse(sent)
        if (!parsed.success) return collect(parsed.error.issues, text)
      }
      const fields = sent && typeof sent === 'object' ? Object.keys(sent) : []
      const named = Object.keys((error.details as Flattened | null)?.fieldErrors ?? {}).filter(
        (field) => !sent || fields.includes(field)
      )
      if (!named.length) return null
      return Object.fromEntries(named.map((field) => [field, t('form.invalid')]))
    },
    [t, text]
  )
}

/** "1 ile 500 arasında bir tam sayı yazın." from a number field's limits. */
export function useRangeText(): (limits: FieldLimits) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return useCallback(
    (limits) => {
      const whole = limits.integer ?? false
      const min = limits.min === undefined ? undefined : f.number(limits.min)
      const max = limits.max === undefined ? undefined : f.number(limits.max)
      if (min !== undefined && max !== undefined)
        return whole ? t('form.rangeWhole', { min, max }) : t('form.range', { min, max })
      if (min !== undefined) return whole ? t('form.minWhole', { min }) : t('form.tooSmall', { min })
      if (max !== undefined) return t('form.tooBig', { max })
      return whole ? t('form.wholeNumber') : t('form.invalid')
    },
    [t, f]
  )
}

/** Whether a typed number fits the limits (text as typed: "1.5" is not whole, "" is not a number). */
export function numberInLimits(text: string, { min, max, integer }: FieldLimits): boolean {
  const trimmed = text.trim()
  if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) return false
  const n = Number(trimmed.replace(',', '.'))
  if (integer && !Number.isInteger(n)) return false
  if (min !== undefined && n < min) return false
  if (max !== undefined && n > max) return false
  return true
}

/**
 * Errors of one form: `validate` before sending (the contract schema), `sending` just before the call, `handled`
 * as the mutation's handler for a VALIDATION answer (true = shown under the fields, no toast). `sending` takes the
 * form's own data (for an update, the patch).
 */
export function useFormErrors() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const check = useSchemaErrors()
  const fromServer = useServerFieldErrors()
  const sent = useRef<{ schema: z.ZodType; data: unknown } | null>(null)
  const validate = useCallback(
    (schema: z.ZodType, data: unknown): boolean => {
      const found = check(schema, data)
      setErrors(found)
      return Object.keys(found).length === 0
    },
    [check]
  )
  const sending = useCallback((schema: z.ZodType, data: unknown): void => {
    sent.current = { schema, data }
  }, [])
  const handled = useCallback(
    (error: unknown): boolean => {
      const last = sent.current
      const found = fromServer(error, last?.schema, last?.data)
      if (!found) return false
      setErrors(found)
      return true
    },
    [fromServer]
  )
  const clear = useCallback(() => setErrors({}), [])
  return { errors, validate, sending, handled, clear }
}
