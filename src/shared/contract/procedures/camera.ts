// Faz 20 (P20a, P20b, P20c, P20g): the camera sidecar's state, its secrets, the Telegram test and the Kamera screen's data.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/camera.ts.
import * as z from 'zod'
import {
  cameraAddonInstallStartSchema,
  cameraAddonInstallStateSchema,
  cameraAlertCropSchema,
  cameraAlertIdInputSchema,
  cameraAlertsSchema,
  cameraCandidatesSchema,
  cameraDiscoverySchema,
  cameraFaceStatusSchema,
  cameraGuestInputSchema,
  cameraHardwareSchema,
  cameraSaveAlertInputSchema,
  cameraLiveSchema,
  cameraMarkAlertInputSchema,
  cameraPauseInputSchema,
  cameraPauseOutputSchema,
  cameraRetentionReportInputSchema,
  cameraRetentionReportSchema,
  cameraProbeInputSchema,
  cameraProbeSchema,
  cameraSecretsInputSchema,
  cameraStaffInputSchema,
  cameraStaffListSchema,
  cameraStatusSchema,
  cameraStreamSchema,
  cameraTelegramTestSchema
} from '../camera'
import { empty, proc, type Procedure } from '../proc'

const ok = z.object({ ok: z.literal(true) })

export const cameraProcedures = {
  // P20g: status and secrets are also open to the setup wizard's camera step (the owner does not exist yet then).
  'camera.status': proc(empty, cameraStatusSchema, ['setup', 'user']),
  'camera.restart': proc(empty, ok),
  'camera.setSecrets': proc(cameraSecretsInputSchema, ok, ['setup', 'user']),
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
  'camera.saveAlertAsGuest': proc(cameraSaveAlertInputSchema, ok),
  // P20e (K-52, K-58, S-107): the staff exclusion list (`camera.enroll`) and the destruction report (`camera` view).
  'camera.staff': proc(empty, cameraStaffListSchema),
  'camera.enrollStaff': proc(cameraStaffInputSchema, cameraStaffListSchema),
  'camera.removeStaff': proc(cameraStaffInputSchema, cameraStaffListSchema),
  'camera.retentionReport': proc(cameraRetentionReportInputSchema, cameraRetentionReportSchema),
  // P20g (K-59): the setup wizard's camera step and Ayarlar → Kamera "Yeniden tara". The hotel computer's own window only.
  'camera.hardware': proc(empty, cameraHardwareSchema, ['setup', 'user']),
  'camera.discover': proc(empty, cameraDiscoverySchema, ['setup', 'user']),
  'camera.probe': proc(cameraProbeInputSchema, cameraProbeSchema, ['setup', 'user']),
  // "Kamera ekini kur…": the picker and the job (hotel computer's own window only), polled for its progress.
  'camera.installAddon': proc(empty, cameraAddonInstallStartSchema, ['setup', 'user']),
  'camera.addonInstallState': proc(empty, cameraAddonInstallStateSchema, ['setup', 'user'])
} as const satisfies Record<string, Procedure>
