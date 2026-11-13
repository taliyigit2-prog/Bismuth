// Faz 20 (P20a): the camera sidecar's state, its secrets and the Telegram test.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/camera.ts.
import * as z from 'zod'
import { cameraSecretsInputSchema, cameraStatusSchema, cameraTelegramTestSchema } from '../camera'
import { empty, proc, type Procedure } from '../proc'

const ok = z.object({ ok: z.literal(true) })

export const cameraProcedures = {
  'camera.status': proc(empty, cameraStatusSchema),
  'camera.restart': proc(empty, ok),
  'camera.setSecrets': proc(cameraSecretsInputSchema, ok),
  'camera.testTelegram': proc(empty, cameraTelegramTestSchema)
} as const satisfies Record<string, Procedure>
