// Camera module contract (Faz 20 P20a; K-49…K-53, K-57…K-59): the sidecar's state for the Kamera screen, the secrets
// (camera address, Telegram) and the Telegram test. Secrets only go IN; a reply says whether one is set, never what it is.
import * as z from 'zod'
import { ULID_PATTERN } from '../ids'

export const CAMERA_RUNTIME_STATES = [
  'unavailable',
  'stopped',
  'starting',
  'running',
  'backoff',
  'gaveUp'
] as const
export const cameraRuntimeStateSchema = z.enum(CAMERA_RUNTIME_STATES)
export type CameraRuntimeState = z.infer<typeof cameraRuntimeStateSchema>

export const cameraStatusSchema = z.object({
  /** `camera.enabled`. */
  enabled: z.boolean(),
  /** `unavailable`: this computer does not host the sidecar (a client device, a server without the camera). */
  state: cameraRuntimeStateSchema,
  /** Why it is not started: no camera address saved yet. */
  blocked: z.enum(['noSource']).nullable(),
  /** Crashes inside the last ten minutes and since the program started. */
  crashes: z.number().int().min(0),
  totalCrashes: z.number().int().min(0),
  lastExitAt: z.string().nullable(),
  /** Last error line of the sidecar, passwords masked. */
  lastError: z.string().nullable(),
  /** The analysis loop's health (`ok`, `degraded`, `stalled`) while running. */
  loop: z.enum(['ok', 'degraded', 'stalled']).nullable(),
  secrets: z.object({
    source: z.boolean(),
    telegramToken: z.boolean(),
    telegramChats: z.boolean()
  }),
  telegram: z.object({
    enabled: z.boolean(),
    /** `network.enabled`: the Telegram copy needs the optional online data on. */
    networkEnabled: z.boolean()
  })
})
export type CameraStatus = z.infer<typeof cameraStatusSchema>

/** `null` removes the value; a missing key leaves it. */
export const cameraSecretsInputSchema = z
  .object({
    /** An rtsp:// address (the camera's user and password go in front of the host) or a webcam number ("0"). */
    source: z.string().trim().max(500).nullable().optional(),
    telegramToken: z.string().trim().max(100).nullable().optional(),
    /** Chat or group ids separated by commas. */
    telegramChatIds: z.string().trim().max(200).nullable().optional()
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'empty' })
export type CameraSecretsInput = z.infer<typeof cameraSecretsInputSchema>

export const cameraTelegramTestSchema = z.object({
  ok: z.boolean(),
  /** Why it did not go: off (settings or network off), noCredentials, invalidCredentials, network, timeout. */
  reason: z.enum(['off', 'noCredentials', 'invalidCredentials', 'network', 'timeout']).nullable()
})
export type CameraTelegramTest = z.infer<typeof cameraTelegramTestSchema>

// --- Kamera sekmesi (Faz 20 P20b) -------------------------------------------------------------------------------
// The live picture goes to the hotel computer's own window only (S-108): the address is a short-lived signed one.
export const cameraStreamSchema = z.object({
  /** `http://127.0.0.1:<port>/api/stream?st=…` or null while the sidecar is not running. */
  url: z.string().nullable()
})
export type CameraStream = z.infer<typeof cameraStreamSchema>

/** A face box over the live picture, in the picture's own pixels; the label is drawn by the screen (any alphabet). */
export const cameraBoxSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  w: z.number().positive(),
  h: z.number().positive(),
  /** A guest's name or room, "" for an unknown person. */
  label: z.string().max(100),
  kind: z.enum(['known', 'unknown'])
})
export type CameraBox = z.infer<typeof cameraBoxSchema>

/** What the strip above the live picture says (it used to be painted into the picture by OpenCV). */
export const cameraLiveSchema = z.object({
  /** null while the sidecar does not answer. */
  header: z
    .object({
      location: z.string(),
      activeGuests: z.number().int().min(0),
      alarmsPaused: z.boolean(),
      cameraConnected: z.boolean(),
      cameraCovered: z.boolean(),
      fps: z.number().min(0)
    })
    .nullable(),
  frame: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).nullable(),
  boxes: z.array(cameraBoxSchema).max(50)
})
export type CameraLive = z.infer<typeof cameraLiveSchema>

export const CAMERA_ALERT_STATES = ['new', 'seen', 'handled'] as const
export const cameraAlertStateSchema = z.enum(CAMERA_ALERT_STATES)
export type CameraAlertState = z.infer<typeof cameraAlertStateSchema>

export const cameraAlertSchema = z.object({
  /** The `camera_events` row id (P20c: alarms live in Bismuth's own table). */
  id: z.string(),
  /** Local `YYYY-MM-DDTHH:mm:ss`, or null when the event has no time. */
  at: z.string().nullable(),
  state: cameraAlertStateSchema,
  /** A sealed face crop is still kept and this window may look at it (hotel computer only, S-108). */
  hasCrop: z.boolean(),
  /** Staff already saved this person as a guest ("Misafir olarak kaydet"). */
  linked: z.boolean()
})
export type CameraAlert = z.infer<typeof cameraAlertSchema>

export const cameraAlertsSchema = z.object({
  /** Kept for the screen: the list is read from Bismuth's own table, so it is there whether or not the sidecar runs. */
  available: z.boolean(),
  alerts: z.array(cameraAlertSchema).max(100)
})
export type CameraAlerts = z.infer<typeof cameraAlertsSchema>

export const cameraMarkAlertInputSchema = z
  .object({ id: z.string().regex(ULID_PATTERN), state: cameraAlertStateSchema })
  .strict()
export type CameraMarkAlertInput = z.infer<typeof cameraMarkAlertInputSchema>

export const cameraPauseInputSchema = z.object({ paused: z.boolean() }).strict()
export const cameraPauseOutputSchema = z.object({ alarmsPaused: z.boolean() })

// --- Yüz kaydı (Faz 20 P20c; K-51…K-53) ---------------------------------------------------------------------------
// A face is taken from the camera on the guest's card (Kişiler), sealed, and kept only while the guest is in the house
// (or for `camera.faceRetentionDays` after). Nothing here is typed into the camera panel: the guest is Bismuth's.
export const cameraGuestInputSchema = z.object({ guestId: z.string().min(1).max(40) }).strict()
export type CameraGuestInput = z.infer<typeof cameraGuestInputSchema>

export const cameraFaceStatusSchema = z.object({
  /** The guest is in the house now: only then a face can be taken. */
  inHouse: z.boolean(),
  /** How many face rows the guest has (angles). */
  count: z.number().int().min(0),
  max: z.number().int().positive(),
  enrolledAt: z.string().nullable(),
  /** `data:image/jpeg;base64,…` of the newest crop, only for the hotel computer's own window. */
  crop: z.string().nullable(),
  /** This computer has no operating-system key store: a face cannot be kept (never stored unsealed). */
  keyStore: z.boolean()
})
export type CameraFaceStatus = z.infer<typeof cameraFaceStatusSchema>

/** In-house guests a face can be saved for (the picker of "Misafir olarak kaydet"). */
export const cameraCandidateSchema = z.object({
  guestId: z.string(),
  name: z.string(),
  room: z.string(),
  faces: z.number().int().min(0)
})
export const cameraCandidatesSchema = z.array(cameraCandidateSchema).max(500)
export type CameraCandidate = z.infer<typeof cameraCandidateSchema>

export const cameraAlertIdInputSchema = z.object({ id: z.string().regex(ULID_PATTERN) }).strict()
export const cameraAlertCropSchema = z.object({ crop: z.string().nullable() })
export type CameraAlertCrop = z.infer<typeof cameraAlertCropSchema>

export const cameraSaveAlertInputSchema = z
  .object({ id: z.string().regex(ULID_PATTERN), guestId: z.string().min(1).max(40) })
  .strict()
export type CameraSaveAlertInput = z.infer<typeof cameraSaveAlertInputSchema>
