// Error shape shared by every transport (IPC and HTTP). `messageKey` is an i18n key (tr.json `errors.*`).
import * as z from 'zod'

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'UNKNOWN_PROCEDURE',
  /** Too many tries in a short time (server mode: sign-in attempts, requests per address). */
  'RATE_LIMITED',
  'INTERNAL',
  /** Client mode: the hotel's main computer cannot be reached right now. */
  'UNAVAILABLE'
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  NOT_FOUND: 404,
  UNKNOWN_PROCEDURE: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UNAVAILABLE: 503
}

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    messageKey: z.string(),
    details: z.unknown().optional()
  })
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
