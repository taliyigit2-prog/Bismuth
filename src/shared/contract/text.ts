// Shared text limits and phone text of the contract (H-05, H-07, H-19, H-25, H-44): one place says how long a name,
// a short text, a note or a long note may be, so a form's counter and the service's refusal read the same number
// (forms read them with `fieldLimits`, src/shared/contract/limits.ts). Data saved earlier with longer texts stays
// readable; only what is typed now is checked.
import * as z from 'zod'
import { isPlausiblePhone } from '../phone'

/** Characters: a person or company name · one line (title, reference) · a note · a long free text. */
export const TEXT_MAX = { name: 120, line: 200, note: 500, long: 2000, phone: 40 } as const

/** A phone text: 6–17 digits with the usual separators; '' is no phone (null). */
export const phoneTextSchema = z
  .string()
  .trim()
  .max(TEXT_MAX.phone)
  .refine(isPlausiblePhone, { message: 'phone' })

/** Optional phone: '' clears it (null), undefined leaves it unchanged on update. */
export const optionalPhone = phoneTextSchema.transform((v) => (v === '' ? null : v)).nullish()
