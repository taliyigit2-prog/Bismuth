// P4fix: the procedures added by the Faz 4 bug-hunt fixes, through the one router as a window calls them — a room's
// capacity history (any room-related view right reads it, only `settings.rooms` edit withdraws a plan) and the role
// names of the account form (`settings.users`, without the role editor's right).
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roomTypes } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import { ctxFromPermissions } from '../../src/main/services/context'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: '', electron: null, chrome: null },
    { clock: testClock('2026-10-05T09:00:00.000Z') }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const call = async (ctx: Ctx, name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
    return { status: res.status, body: JSON.parse(res.body) as unknown }
  }
  const owner = roleCtx('owner')
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = services.rooms.createRoom(owner, {
    number: '101',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  services.rooms.updateRoom(owner, room.id, { beds: 3, validFrom: '2026-12-01' })
  const planned = services.rooms.capacityHistory(owner, room.id)[0]!
  return { services, call, room, planned }
}

describe('oda kapasite geçmişi yordamları', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: planlı değişikliği yalnız "Odalar" düzenleme yetkisiyle geri alır',
    async (role) => {
      const { call, planned } = await setup()
      const allowed = levelAllows(defaultPermissions(role)['settings.rooms'], 'edit')
      const res = await call(roleCtx(role), 'rooms.cancelCapacityChange', { id: planned.id })
      expect(res.status).toBe(allowed ? 200 : 403)
    }
  )

  it('geçmişi odayla ilgili bir görme yetkisi okur; hiçbiri yoksa reddedilir', async () => {
    const { call, room } = await setup()
    expect((await call(roleCtx('housekeeping'), 'rooms.capacityHistory', { roomId: room.id })).status).toBe(
      200
    )
    const none = ctxFromPermissions('u-none', 'dev', 'ipc', { staff: 'view' })
    expect((await call(none, 'rooms.capacityHistory', { roomId: room.id })).status).toBe(403)
  })
})

describe('hesap formunun rol listesi', () => {
  it.each(SYSTEM_ROLE_CODES)('%s: rol adlarını yalnız kullanıcı yetkisiyle okur', async (role) => {
    const { call } = await setup()
    const allowed = levelAllows(defaultPermissions(role)['settings.users'], 'view')
    expect((await call(roleCtx(role), 'users.roleChoices')).status).toBe(allowed ? 200 : 403)
  })
})
