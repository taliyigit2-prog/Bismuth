// Faz 16 (P16a): a window reports an error it could not handle, for the error log of the main process.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/system.ts.
import * as z from 'zod'
import { proc, type Procedure } from '../proc'

export const CLIENT_ERROR_KINDS = ['render', 'window', 'rejection'] as const

export const clientErrorReportSchema = z
  .object({
    /** render: the error screen caught it; window: window.onerror; rejection: an unhandled promise. */
    kind: z.enum(CLIENT_ERROR_KINDS),
    /** Error name and message, stack (cut short): the main process removes personal data before writing. */
    name: z.string().max(200),
    message: z.string().max(2000),
    stack: z.string().max(8000).nullable(),
    /** The screen (route path without the query): which screen broke, never what was typed. */
    route: z.string().max(200).nullable()
  })
  .strict()
export type ClientErrorReport = z.output<typeof clientErrorReportSchema>

export const systemProcedures = {
  /** Any window, also before sign-in, in the wizard or locked (the service drops anonymous remote callers). */
  'system.reportError': proc(clientErrorReportSchema, z.object({ ok: z.literal(true) }), [
    'public',
    'setup',
    'user',
    'locked'
  ])
} as const satisfies Record<string, Procedure>
