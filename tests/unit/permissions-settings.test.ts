// Faz 15 (P15a2) through the one router, as a window calls it: the hotel's accent colour is a hotel colour like the
// status colours (G-33): only `settings.colors` at edit level may change it (Sahip by default; Müdür sees it), and
// everyone reads it (the sign-in screen too, to draw with it).
import { afterEach, describe, expect, it } from 'vitest'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import { anonymousCtx } from '../../src/main/services/context'
import { roleCtx } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const services = createServices(handle, {
    name: 'Bismuth',
    version: 'test',
    packaged: false,
    dataDir: '',
    electron: null,
    chrome: null
  })
  const api = createApiApp({ handlers: createHandlers(services) })
  const call = async (ctx: Ctx, name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> }
  }
  return { services, call }
}

describe('vurgu rengi (faz-15 madde 6): otelin rengi, settings.colors yetkisiyle', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: vurgu rengini yalnız renk düzenleme yetkisi varsa değiştirir',
    async (role) => {
      const { call } = await setup()
      const allowed = levelAllows(defaultPermissions(role)['settings.colors'], 'edit')
      const res = await call(roleCtx(role), 'settings.set', { 'ui.accentColor': '#15803d' })
      expect(res.status).toBe(allowed ? 200 : 403)
      const after = await call(roleCtx('owner'), 'settings.get')
      expect(after.body['ui.accentColor']).toBe(allowed ? '#15803d' : null)
    }
  )

  it('yalnız #rrggbb kabul edilir; oturum açma ekranı otelin vurgusunu okur', async () => {
    const { call } = await setup()
    const bad = await call(roleCtx('owner'), 'settings.set', { 'ui.accentColorDark': 'red;}*{x:y' })
    expect(bad.status).toBe(400)
    expect((await call(roleCtx('owner'), 'settings.set', { 'ui.accentColorDark': '#93c5fd' })).status).toBe(
      200
    )
    const signIn = await call(anonymousCtx('d', 'ipc'), 'settings.get')
    expect(signIn.body['ui.accentColorDark']).toBe('#93c5fd')
  })
})
