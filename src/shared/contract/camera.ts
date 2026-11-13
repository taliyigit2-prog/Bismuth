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
