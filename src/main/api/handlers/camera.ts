// Handlers of procedures/camera.ts (Faz 20 P20a): contract procedure → service call.
import type { cameraProcedures } from '@shared/contract/procedures/camera'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const cameraHandlers = (services: Services): HandlersFor<keyof typeof cameraProcedures> => ({
  'camera.status': (ctx) => services.camera.status(ctx),
  'camera.restart': async (ctx) => {
    await services.camera.restart(ctx)
    return { ok: true as const }
  },
  'camera.setSecrets': async (ctx, input) => {
    await services.camera.setSecrets(ctx, input)
    return { ok: true as const }
  },
  'camera.testTelegram': (ctx) => services.camera.testTelegram(ctx)
})
