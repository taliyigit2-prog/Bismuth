// Building blocks of the contract: who may call a procedure and the `proc` helper every module file uses
// (index.ts holds the core procedures, procedures/<module>.ts one file per module).
import * as z from 'zod'
import { idSchema } from './rooms'

/**
 * Who may call a procedure (checked by the router before the service, which still checks permissions, G-23):
 * `public` — anyone, also before sign-in (state, user list, sign-in); `setup` — only while the hotel is not set
 * up yet (the wizard); `user` — a signed-in, unlocked user (the default); `locked` — a signed-in user whose window
 * is locked (unlock, sign-out).
 */
export const ACCESS = ['public', 'setup', 'user', 'locked'] as const
export type Access = (typeof ACCESS)[number]

export interface Procedure {
  input: z.ZodType
  output: z.ZodType
  access?: readonly Access[]
}

export const proc = <I extends z.ZodType, O extends z.ZodType>(
  input: I,
  output: O,
  access?: readonly Access[]
) => ({ input, output, ...(access ? { access } : {}) }) as { input: I; output: O; access?: readonly Access[] }

export const empty = z.object({}).strict()
export const byId = z.object({ id: idSchema }).strict()
export const includeInactive = z.object({ includeInactive: z.boolean().optional() }).strict()
