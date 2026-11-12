// Electron-free core of the IPC bridge, so it is unit-testable: validate the envelope from the
// renderer, run it through the shared router with the window's ctx, return a plain envelope.
import type { Hono } from 'hono'
import { serializedRequestSchema, type SerializedResponse } from '@shared/contract'
import type { ApiEnv } from '../api/app'
import type { Ctx } from '../services/context'
import type { SessionBinding } from '../api/session'

export async function handleIpcRequest(
  app: Hono<ApiEnv>,
  ctx: Ctx,
  raw: unknown,
  session: SessionBinding | null = null
): Promise<SerializedResponse> {
  const parsed = serializedRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      status: 400,
      body: JSON.stringify({ error: { code: 'VALIDATION', messageKey: 'errors.validation' } })
    }
  }
  const request = new Request(`http://bismuth.ipc${parsed.data.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: parsed.data.body
  })
  const response = await app.fetch(request, { ctx, transport: 'ipc', ...(session ? { session } : {}) })
  return { status: response.status, body: await response.text() }
}
