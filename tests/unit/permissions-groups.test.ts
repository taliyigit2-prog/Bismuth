// P17b (G-194, G-23): the group reservation procedures through the shared router with each system role's default
// rights — reception books and checks in a group, the accountant only sees it, housekeeping has no calendar.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { DatabaseHandle } from '../../src/main/db/client'
import { paymentMethods, roomTypes, salesChannels } from '../../src/main/db/schema'
import type { SystemRoleCode } from '../../src/shared/permissions'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
let api: ReturnType<typeof createApiApp>
let groupId = ''
let stayIds: string[] = []
let groupInput: Record<string, unknown>

const call = async (role: SystemRoleCode, name: string, body: unknown) => {
  const res = await handleIpcRequest(api, roleCtx(role), { path: `/api/${name}`, body: JSON.stringify(body) })
  return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> }
}

beforeAll(async () => {
  handle = await seededDatabase()
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: '/tmp/unused',
      electron: null,
      chrome: null
    },
    { clock: testClock('2026-10-01T09:00:00.000Z') }
  )
  api = createApiApp({ handlers: createHandlers(services) })
  const owner = roleCtx('owner')
  const type = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const rooms = ['701', '702'].map(
    (number) =>
      services.rooms.createRoom(owner, { number, roomTypeId: type.id, beds: 2, validFrom: '2026-01-01' }).id
  )
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  groupInput = {
    name: 'Örnek grup',
    leader: { firstName: 'Deniz', lastName: 'Lider' },
    channelId,
    rooms: rooms.map((roomId, i) => ({
      stay: { roomId, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 100_000 },
      guest: { firstName: `Misafir${i}`, lastName: 'Örnek' }
    }))
  }
})
afterAll(() => handle.close())

describe('grup rezervasyonu yordamları ve roller', () => {
  it('createGroup: resepsiyon oluşturur; muhasebeci ve kat hizmetleri reddedilir (403)', async () => {
    expect((await call('accountant', 'booking.createGroup', groupInput)).status).toBe(403)
    expect((await call('housekeeping', 'booking.createGroup', groupInput)).status).toBe(403)
    const ok = await call('reception', 'booking.createGroup', groupInput)
    expect(ok.status).toBe(200)
    const view = ok.body as { id: string; rooms: { stays: { stayId: string }[] }[] }
    groupId = view.id
    stayIds = view.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    expect(stayIds).toHaveLength(2)
  })

  it('group: muhasebeci görür, kat hizmetleri göremez', async () => {
    expect((await call('accountant', 'booking.group', { id: groupId })).status).toBe(200)
    expect((await call('housekeeping', 'booking.group', { id: groupId })).status).toBe(403)
  })

  it('addGroupNote ve cancelGroup: yalnız düzenleme yetkisi olan rol (muhasebeci reddedilir)', async () => {
    expect((await call('accountant', 'booking.addGroupNote', { groupId, text: 'Not' })).status).toBe(403)
    expect((await call('accountant', 'booking.cancelGroup', { groupId, reason: 'Deneme' })).status).toBe(403)
    expect((await call('reception', 'booking.addGroupNote', { groupId, text: 'Not' })).status).toBe(200)
  })

  it('checkInMany ve checkOutMany: muhasebeci ve kat hizmetleri reddedilir, resepsiyon yapar', async () => {
    for (const role of ['accountant', 'housekeeping'] as const) {
      expect((await call(role, 'booking.checkInMany', { groupId, stayIds })).status).toBe(403)
      expect((await call(role, 'booking.checkOutMany', { groupId, stayIds })).status).toBe(403)
    }
    expect((await call('reception', 'booking.checkInMany', { groupId, stayIds })).status).toBe(200)
    expect((await call('reception', 'booking.checkOutMany', { groupId, stayIds })).status).toBe(200)
  })

  it('bozuk girdi: boş oda listesi ve tek odalı grup 400 döner', async () => {
    expect((await call('reception', 'booking.checkInMany', { groupId, stayIds: [] })).status).toBe(400)
    const one = { ...groupInput, rooms: (groupInput['rooms'] as unknown[]).slice(0, 1) }
    expect((await call('reception', 'booking.createGroup', one)).status).toBe(400)
  })
})

describe('grup ödemesi, gruba bağlama ve son iptaller (P17c)', () => {
  it('payGroup: kat hizmetleri reddedilir (403), resepsiyon öder; aşan tutar 400 döner', async () => {
    const later = (groupInput['rooms'] as { stay: Record<string, unknown>; guest: unknown }[]).map((r) => ({
      ...r,
      stay: { ...r.stay, checkIn: '2026-11-01', checkOut: '2026-11-02' }
    }))
    const made = await call('reception', 'booking.createGroup', {
      ...groupInput,
      name: 'Ödeme grubu',
      rooms: later
    })
    const id = made.body['id'] as string
    const methodId = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
    const pay = (amountMinor: number) => ({
      groupId: id,
      methodId,
      amountMinor,
      currency: 'TRY',
      date: '2026-10-01'
    })
    expect((await call('housekeeping', 'booking.payGroup', pay(100_000))).status).toBe(403)
    expect((await call('reception', 'booking.payGroup', pay(999_999_999))).status).toBe(400)
    const ok = await call('reception', 'booking.payGroup', pay(100_000))
    expect(ok.status).toBe(200)
  })

  it('attachToGroup: muhasebeci ve kat hizmetleri reddedilir; bozuk girdi 400 döner', async () => {
    const body = { name: 'Yeni grup', reservationIds: ['x', 'y'] }
    expect((await call('accountant', 'booking.attachToGroup', body)).status).toBe(403)
    expect((await call('housekeeping', 'booking.attachToGroup', body)).status).toBe(403)
    expect((await call('reception', 'booking.attachToGroup', { reservationIds: ['x'] })).status).toBe(400)
  })

  it('reservations.recentEnded: kat hizmetleri reddedilir, muhasebeci ve resepsiyon görür', async () => {
    expect((await call('housekeeping', 'reservations.recentEnded', { days: 7 })).status).toBe(403)
    expect((await call('accountant', 'reservations.recentEnded', { days: 7 })).status).toBe(200)
    expect((await call('reception', 'reservations.recentEnded', { days: 0 })).status).toBe(400)
  })
})
