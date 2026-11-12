// Ayarlar → Kullanıcılar: the roles an account can be given, for whoever manages accounts without seeing the role
// editor (Faz 4 bug hunt P4fix #13). Spread into the contract by ./index.ts; handlers in
// src/main/api/handlers/users.ts.
import * as z from 'zod'
import { empty, proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema } from '../rooms'

export const roleChoiceSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  name: z.string(),
  displayName: i18nTextSchema.nullable(),
  /** The owner role. */
  locked: z.boolean(),
  /** The caller holds at least the role's rights, so may give it to an account. */
  assignable: z.boolean()
})
export type RoleChoice = z.infer<typeof roleChoiceSchema>

export const usersProcedures = {
  'users.roleChoices': proc(empty, z.array(roleChoiceSchema))
} as const satisfies Record<string, Procedure>
