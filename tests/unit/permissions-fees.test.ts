// P21d (G-23): fee lines, deposits and the night report through the shared router with each role's default rights.
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
let reservationId = ''
let methodId = ''

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
  const room = services.rooms.createRoom(owner, {
    number: '801',
    roomTypeId: type.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  methodId = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  reservationId = services.reservations.create(owner, {
    guest: { firstName: 'Örnek', lastName: 'Misafir' },
    channelId,
    status: 'confirmed',
    stays: [{ roomId: room.id, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }]
  }).reservation.id
})
afterAll(() => handle.close())

describe('ücret kalemleri, depozito ve gece raporu yetkileri', () => {
  it('kat hizmetleri depozito alamaz, gece raporunu ve kalemleri göremez', async () => {
    expect(
      (await call('housekeeping', 'booking.takeDeposit', { reservationId, amountMinor: 1000, methodId }))
        .status
    ).toBe(403)
    expect((await call('housekeeping', 'reports.nightReport', { date: '2026-10-01' })).status).toBe(403)
    expect((await call('housekeeping', 'booking.folioLines', { id: reservationId })).status).toBe(403)
  })

  it('muhasebeci gelmedi bedeli yazamaz (takvimde yalnız görüntüler)', async () => {
    expect((await call('accountant', 'booking.noShow', { id: reservationId, feeMinor: 1000 })).status).toBe(
      403
    )
  })

  it('resepsiyon depozito alır, kalemleri okur; gece raporunu müdür ve sahip alır', async () => {
    expect(
      (await call('reception', 'booking.takeDeposit', { reservationId, amountMinor: 50_000, methodId }))
        .status
    ).toBe(200)
    const lines = await call('reception', 'booking.folioLines', { id: reservationId })
    expect(lines.status).toBe(200)
    expect((lines.body as { deposits: unknown[] }).deposits).toHaveLength(1)
    expect((await call('manager', 'reports.nightReport', { date: '2026-10-01' })).status).toBe(200)
  })

  it('geçersiz tutar 400 döner', async () => {
    expect(
      (await call('reception', 'booking.takeDeposit', { reservationId, amountMinor: 0, methodId })).status
    ).toBe(400)
  })

  it('kat hizmetleri öneri, geç çıkış, kalem iptali ve depozito kapanışı yapamaz; resepsiyon öneri alır', async () => {
    const stayId = '01HZZZZZZZZZZZZZZZZZZZZZZZ'
    const fake = 'x'.repeat(26)
    for (const [name, body] of [
      ['booking.feeQuote', { kind: 'noShow', reservationId }],
      ['booking.addLateCheckout', { stayId, time: '15:00', amountMinor: 1000 }],
      ['booking.voidFee', { chargeId: fake, reason: 'yanlış girildi' }],
      ['booking.settleDeposit', { id: fake, action: 'refund' }]
    ] as const)
      expect((await call('housekeeping', name, body)).status, name).toBe(403)
    const quote = await call('reception', 'booking.feeQuote', { kind: 'noShow', reservationId })
    expect(quote.status).toBe(200)
    expect(quote.body).toMatchObject({ currency: 'TRY', nightlyMinor: 100_000 })
  })
})
