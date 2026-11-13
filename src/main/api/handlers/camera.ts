// Handlers of procedures/camera.ts (Faz 20 P20a/P20b): contract procedure → service call.
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
  'camera.testTelegram': (ctx) => services.camera.testTelegram(ctx),
  'camera.streamUrl': (ctx) => services.camera.streamUrl(ctx),
  'camera.live': (ctx) => services.camera.live(ctx),
  'camera.alerts': (ctx) => services.camera.alerts(ctx),
  'camera.markAlert': async (ctx, input) => {
    await services.camera.markAlert(ctx, input)
    return { ok: true as const }
  },
  'camera.setAlarmsPaused': (ctx, input) => services.camera.setAlarmsPaused(ctx, input),
  'camera.faceStatus': (ctx, input) => services.camera.faceStatus(ctx, input),
  'camera.enrollFace': (ctx, input) => services.camera.enrollFace(ctx, input),
  'camera.deleteFaces': (ctx, input) => services.camera.deleteFaces(ctx, input),
  'camera.candidates': (ctx) => services.camera.candidates(ctx),
  'camera.alertCrop': (ctx, input) => services.camera.alertCrop(ctx, input),
  'camera.staff': (ctx) => services.camera.staffList(ctx),
  'camera.enrollStaff': (ctx, input) => services.camera.enrollStaff(ctx, input),
  'camera.removeStaff': (ctx, input) => services.camera.removeStaff(ctx, input),
  'camera.retentionReport': (ctx, input) => services.camera.retentionReport(ctx, input),
  'camera.saveAlertAsGuest': async (ctx, input) => {
    await services.camera.saveAlertAsGuest(ctx, input)
    return { ok: true as const }
  },
  'camera.hardware': (ctx) => services.camera.hardware(ctx),
  'camera.discover': (ctx) => services.camera.discover(ctx),
  'camera.probe': (ctx, input) => services.camera.probe(ctx, input)
})
