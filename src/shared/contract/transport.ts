// Wire format between renderer and main over Electron IPC. The renderer never gets raw ipcRenderer:
// the preload exposes exactly one function that forwards this envelope (faz-01 madde 3/5).
import * as z from 'zod'

export { API_CHANNEL, READY_CHANNEL } from './channels'
export const MAX_BODY_BYTES = 8 * 1024 * 1024

export const serializedRequestSchema = z.object({
  path: z.string().regex(/^\/api\/[a-zA-Z0-9_.-]+$/),
  body: z.string().max(MAX_BODY_BYTES)
})
export type SerializedRequest = z.infer<typeof serializedRequestSchema>

export interface SerializedResponse {
  status: number
  body: string
}

/** What the preload puts on `window.bismuth` (contextBridge). */
export interface BismuthBridge {
  api(request: SerializedRequest): Promise<SerializedResponse>
  ready(): void
  platform: string
}
