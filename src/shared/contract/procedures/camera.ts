// Faz 20 (P20a, P20b, P20c): the camera sidecar's state, its secrets, the Telegram test and the Kamera screen's data.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/camera.ts.
import * as z from 'zod'
import {
  cameraAlertCropSchema,
  cameraAlertIdInputSchema,
  cameraAlertsSchema,
  cameraCandidatesSchema,
  cameraFaceStatusSchema,
  cameraGuestInputSchema,
  cameraSaveAlertInputSchema,
  cameraLiveSchema,
  cameraMarkAlertInputSchema,
  cameraPauseInputSchema,
  cameraPauseOutputSchema,
  cameraSecretsInputSchema,
  cameraStatusSchema,
  cameraStreamSchema,
  cameraTelegramTestSchema
} from '../camera'
import { empty, proc, type Procedure } from '../proc'

const ok = z.object({ ok: z.literal(true) })

export const cameraProcedures = {
  'camera.status': proc(empty, cameraStatusSchema),
  'camera.restart': proc(empty, ok),
  'camera.setSecrets': proc(cameraSecretsInputSchema, ok),
  'camera.testTelegram': proc(empty, cameraTelegramTestSchema),
  // P20b. The live picture and its strip are for the hotel computer's own window only (S-108).
  'camera.streamUrl': proc(empty, cameraStreamSchema),
  'camera.live': proc(empty, cameraLiveSchema),
  'camera.alerts': proc(empty, cameraAlertsSchema),
  'camera.markAlert': proc(cameraMarkAlertInputSchema, ok),
  'camera.setAlarmsPaused': proc(cameraPauseInputSchema, cameraPauseOutputSchema),
  // P20c (K-51…K-53): a guest's face (taken from the camera, sealed, deleted at check-out) and alarm crops. `camera.enroll`.
  'camera.faceStatus': proc(cameraGuestInputSchema, cameraFaceStatusSchema),
  'camera.enrollFace': proc(cameraGuestInputSchema, cameraFaceStatusSchema),
  'camera.deleteFaces': proc(cameraGuestInputSchema, cameraFaceStatusSchema),
  'camera.candidates': proc(empty, cameraCandidatesSchema),
  'camera.alertCrop': proc(cameraAlertIdInputSchema, cameraAlertCropSchema),
  'camera.saveAlertAsGuest': proc(cameraSaveAlertInputSchema, ok)
} as const satisfies Record<string, Procedure>
