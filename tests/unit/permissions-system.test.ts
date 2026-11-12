// system.reportError (Faz 16, P16a): every window of this computer may report an error for the log — before sign-in,
// in the wizard, locked — but over the network only a signed-in user; at most 20 reports a minute.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import { anonymousCtx, type Ctx } from '../../src/main/services/context'
import type { DatabaseHandle } from '../../src/main/db/client'
import { REPORTS_PER_MINUTE } from '../../src/main/services/diagnostics-service'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

const report = { kind: 'render', name: 'TypeError', message: 'x is undefined', stack: null, route: '/guests' }
let handle: DatabaseHandle
const received: { transport: string; userId: string | null }[] = []
const clock = testClock('2026-10-05T09:00:00.000Z')
let api: ReturnType<typeof createApiApp>

beforeAll(async () => {
  handle = await seededDatabase()
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: tempDataDir(),
      electron: null,
      chrome: null
    },
    { clock, onClientError: (r) => received.push({ transport: r.transport, userId: r.userId }) }
  )
  api = createApiApp({ handlers: createHandlers(services) })
})
afterAll(() => handle?.close())

const viaIpc = (ctx: Ctx, body: unknown = report) =>
  handleIpcRequest(api, ctx, { path: '/api/system.reportError', body: JSON.stringify(body) })
const viaHttp = (ctx: Ctx) =>
  api.fetch(
    new Request('http://192.168.1.20:7373/api/system.reportError', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report)
    }),
    { ctx, transport: 'http' }
  )

describe('system.reportError', () => {
  it('bu bilgisayarın penceresi oturum açmadan da hata bildirebilir; bildirim günlüğe gider', async () => {
    received.length = 0
    expect((await viaIpc(anonymousCtx('d1', 'ipc'))).status).toBe(200)
    expect((await viaIpc(roleCtx('housekeeping'))).status).toBe(200)
    expect(received).toEqual([
      { transport: 'ipc', userId: null },
      { transport: 'ipc', userId: 'user-housekeeping' }
    ])
  })

  it('ağdan oturumsuz gelen bildirim yazılmaz; oturum açmış telefonunki yazılır', async () => {
    received.length = 0
    expect((await viaHttp(anonymousCtx('phone', 'http'))).status).toBe(200)
    expect(received).toEqual([])
    expect((await viaHttp(roleCtx('reception', 'u-r', 'phone'))).status).toBe(200)
    expect(received).toEqual([{ transport: 'http', userId: 'u-r' }])
  })

  it('biçimi bozuk ya da çok uzun bildirim reddedilir', async () => {
    expect((await viaIpc(roleCtx('owner'), { ...report, kind: 'other' })).status).toBe(400)
    expect((await viaIpc(roleCtx('owner'), { ...report, message: 'x'.repeat(2001) })).status).toBe(400)
  })

  it('bir dakikada en çok 20 bildirim günlüğe gider; sonraki dakika yeniden açılır', async () => {
    clock.advance(5)
    received.length = 0
    for (let i = 0; i < REPORTS_PER_MINUTE + 5; i++) await viaIpc(roleCtx('owner'))
    expect(received).toHaveLength(REPORTS_PER_MINUTE)
    clock.advance(2)
    await viaIpc(roleCtx('owner'))
    expect(received).toHaveLength(REPORTS_PER_MINUTE + 1)
  })
})
