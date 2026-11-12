// Handlers of procedures/system.ts (Faz 16, P16a): contract procedure → service call.
import type { systemProcedures } from '@shared/contract/procedures/system'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const systemHandlers = (services: Services): HandlersFor<keyof typeof systemProcedures> => ({
  'system.reportError': (ctx, input, env) => {
    services.diagnostics.reportClientError(ctx, input, env.transport)
    return { ok: true }
  }
})
