// Camera module contract (Faz 20 P20a; K-49…K-53, K-57…K-59): the sidecar's state for the Kamera screen, the secrets
// (camera address, Telegram) and the Telegram test. Secrets only go IN; a reply says whether one is set, never what it is.
import * as z from 'zod'

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
  /** The sidecar's row number as text. */
  id: z.string(),
  /** Local `YYYY-MM-DDTHH:mm:ss`, or null when the sidecar gave none. */
  at: z.string().nullable(),
  state: cameraAlertStateSchema
})
export type CameraAlert = z.infer<typeof cameraAlertSchema>

export const cameraAlertsSchema = z.object({
  /** false: the sidecar is not running (or does not answer), so the list is empty for that reason. */
  available: z.boolean(),
  alerts: z.array(cameraAlertSchema).max(100)
})
export type CameraAlerts = z.infer<typeof cameraAlertsSchema>

export const cameraMarkAlertInputSchema = z
  .object({ id: z.string().regex(/^\d{1,12}$/), state: cameraAlertStateSchema })
  .strict()
export type CameraMarkAlertInput = z.infer<typeof cameraMarkAlertInputSchema>

export const cameraPauseInputSchema = z.object({ paused: z.boolean() }).strict()
export const cameraPauseOutputSchema = z.object({ alarmsPaused: z.boolean() })
