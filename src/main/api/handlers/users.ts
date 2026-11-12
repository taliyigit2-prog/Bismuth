// Handlers of procedures/users.ts (P4fix): contract procedure → service call.
import type { usersProcedures } from '@shared/contract/procedures/users'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const usersHandlers = (services: Services): HandlersFor<keyof typeof usersProcedures> => ({
  'users.roleChoices': (ctx) => services.users.roleChoices(ctx)
})
