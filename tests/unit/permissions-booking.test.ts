// faz-05 kabul ölçütü "Rol: Resepsiyon oluşturur/düzenler; Muhasebeci yalnızca görür; yetkisiz işlem servis
// katmanında reddedilir": the reservation panel's procedures (booking.*) through the shared router with each
// system role's default rights. Also the router-level shape of a few answers (blacklist refusal, special-day price).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import type { DatabaseHandle } from '../../src/main/db/client'
import { paymentMethods, roomTypes, salesChannels } from '../../src/main/db/schema'
import type { SystemRoleCode } from '../../src/shared/permissions'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
let api: ReturnType<typeof createApiApp>
const ids = { room: '', room2: '', channel: '', cash: '', reservation: '', stay: '', occupant: '' }

const call = async (role: SystemRoleCode | Ctx, name: string, body: unknown) => {
  const ctx = typeof role === 'string' ? roleCtx(role) : role
  const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
  return {
    status: res.status,
    body: JSON.parse(res.body) as Record<string, unknown> & { error?: Record<string, unknown> }
  }
}

beforeAll(async () => {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
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
    { clock }
  )
  api = createApiApp({ handlers: createHandlers(services) })
  const owner = roleCtx('owner')
  const type = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  handle.db
    .update(roomTypes)
    .set({ basePriceMinor: 200_000, weekendPriceMinor: 260_000 })
    .where(eq(roomTypes.id, type.id))
    .run()
  ids.room = services.rooms.createRoom(owner, {
    number: '101',
    roomTypeId: type.id,
    beds: 2,
    validFrom: '2026-01-01'
  }).id
  ids.room2 = services.rooms.createRoom(owner, {
    number: '102',
    roomTypeId: type.id,
    beds: 2,
    validFrom: '2026-01-01'
  }).id
  ids.channel = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  ids.cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const created = await call('reception', 'booking.create', {
    guest: { firstName: 'Deneme', lastName: 'Misafir' },
    channelId: ids.channel,
    stays: [{ roomId: ids.room, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 200_000 }]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const view = created.body as unknown as {
    reservation: { id: string }
    stays: { id: string; occupants: { id: string }[] }[]
  }
  ids.reservation = view.reservation.id
  ids.stay = view.stays[0]!.id
  ids.occupant = view.stays[0]!.occupants[0]!.id
})
afterAll(() => handle.close())

/** Writes of the panel, each with a valid body: only the permission decides. */
const writes = (): [string, unknown][] => [
  [
    'booking.create',
    {
      guest: { firstName: 'Yeni', lastName: 'Kişi' },
      channelId: ids.channel,
      stays: [
        { roomId: ids.room2, checkIn: '2026-12-01', checkOut: '2026-12-02', nightlyPriceMinor: 100_000 }
      ]
    }
  ],
  ['booking.update', { id: ids.reservation, patch: { notes: 'not' } }],
  ['booking.setNightPrices', { stayId: ids.stay, prices: [{ date: '2026-10-01', priceMinor: 210_000 }] }],
  ['booking.changeDates', { stayId: ids.stay, dates: { checkIn: '2026-10-01', checkOut: '2026-10-04' } }],
  ['booking.moveDates', { stayId: ids.stay, move: { checkIn: '2026-10-01' } }],
  ['booking.addNote', { reservationId: ids.reservation, text: 'Not' }],
  ['booking.park', { id: ids.reservation, park: { reason: 'postponed' } }],
  ['booking.checkIn', { stayId: ids.stay }],
  ['booking.addOccupant', { stayId: ids.stay, occupant: { fullName: 'İkinci Kişi' } }],
  ['booking.markKbs', { occupantId: ids.occupant, mark: 'reported' }],
  ['booking.checkBlacklist', { name: 'Deneme Misafir' }]
]

describe('rezervasyon paneli yetkileri (servis katmanında)', () => {
  it('Muhasebe rezervasyonu, listeleri ve park alanını görür', async () => {
    for (const [name, body] of [
      ['booking.get', { id: ids.reservation }],
      ['booking.options', {}],
      ['booking.listParked', {}],
      ['booking.availability', { from: '2026-10-01', to: '2026-10-03' }]
    ] as const) {
      const res = await call('accountant', name, body)
      expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200)
    }
    const seen = await call('accountant', 'booking.get', { id: ids.reservation })
    // Accountant sees the money but not the people (in_house: none).
    expect(seen.body['occupantsVisible']).toBe(false)
    expect(Array.isArray(seen.body['payments'])).toBe(true)
  })

  it('Muhasebe rezervasyon yazamaz, değiştiremez, park edemez, giriş yapamaz, kişi ekleyemez: 403', async () => {
    for (const [name, body] of writes()) {
      const res = await call('accountant', name, body)
      expect(res.status, name).toBe(403)
      expect(res.body.error?.['code']).toBe('PERMISSION_DENIED')
    }
  })

  it('Temizlik rolü rezervasyonu göremez', async () => {
    expect((await call('housekeeping', 'booking.get', { id: ids.reservation })).status).toBe(403)
    expect((await call('housekeeping', 'booking.options', {})).status).toBe(403)
  })

  it('Resepsiyon ödeme alır ama iade giremez; Müdür iade girer', async () => {
    const payment = (kind: string) => ({
      reservationId: ids.reservation,
      date: '2026-10-01',
      kind,
      methodId: ids.cash,
      amountMinor: 50_000,
      currency: 'TRY'
    })
    const paid = await call('reception', 'booking.addPayment', payment('deposit'))
    expect(paid.status).toBe(200)
    expect((paid.body['folio'] as { creditedMinor: number }).creditedMinor).toBe(50_000)
    expect((await call('reception', 'booking.addPayment', payment('refund'))).status).toBe(403)
    expect((await call('manager', 'booking.addPayment', payment('refund'))).status).toBe(200)
  })

  it('Resepsiyon panelin bütün yazmalarını yapabilir', async () => {
    for (const [name, body] of writes().filter(([n]) => n !== 'booking.park')) {
      const res = await call('reception', name, body)
      expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200)
    }
  })
})

describe('yönlendirici üzerinden yanıtlar', () => {
  it('kara listedeki ad 409 + eşleşmeler döner; onayla yazılır; "engelle" kaydını yalnız Sahip/Müdür geçer', async () => {
    const owner = roleCtx('owner')
    const add = await call(owner, 'booking.checkBlacklist', { name: 'x' })
    expect(add.status).toBe(200)
    // Faz 6: the blacklist is written through its own procedure (Resepsiyon adds).
    const entry = await call('reception', 'blacklist.add', {
      name: 'Sorunlu Kişi',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Odaya zarar verdi'
    })
    expect(entry.status).toBe(200)
    const body = {
      guest: { firstName: 'Sorunlu', lastName: 'Kişi' },
      channelId: ids.channel,
      stays: [
        { roomId: ids.room2, checkIn: '2026-11-01', checkOut: '2026-11-02', nightlyPriceMinor: 100_000 }
      ]
    }
    const refused = await call('reception', 'booking.create', body)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({
      messageKey: 'errors.blacklistMatch',
      details: { hits: [{ name: 'Sorunlu Kişi', severity: 'block', reasons: ['name'] }] }
    })
    const blocked = await call('reception', 'booking.create', { ...body, blacklistConfirmed: true })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error).toMatchObject({ messageKey: 'errors.blacklistBlocked' })
    expect((await call('manager', 'booking.create', { ...body, blacklistConfirmed: true })).status).toBe(200)
  })

  it('29 Ekim (Cumhuriyet Bayramı) ve arifesi hafta içi olsa da özel gün fiyatıyla önerilir', async () => {
    const res = await call('reception', 'booking.suggestPrices', {
      roomId: ids.room,
      checkIn: '2026-10-27',
      checkOut: '2026-10-30'
    })
    expect(res.status).toBe(200)
    expect((res.body as unknown as { nights: { reason: string; priceMinor: number }[] }).nights).toEqual([
      { date: '2026-10-27', priceMinor: 200_000, reason: 'base' },
      { date: '2026-10-28', priceMinor: 260_000, reason: 'special' },
      { date: '2026-10-29', priceMinor: 260_000, reason: 'special' }
    ])
  })
})

describe('P5fix: gelmedi, tek oda iptali, oda eklerken "yine de"', () => {
  const fresh = async (checkIn: string, checkOut: string, room = ids.room2) => {
    const res = await call('reception', 'booking.create', {
      guest: { firstName: 'Park', lastName: 'Misafiri' },
      channelId: ids.channel,
      stays: [{ roomId: room, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const view = res.body as unknown as { reservation: { id: string }; stays: { id: string }[] }
    return { id: view.reservation.id, stayId: view.stays[0]!.id }
  }

  it('Muhasebe ve Temizlik "gelmedi" ve tek oda iptali yapamaz (403); Resepsiyon yapar', async () => {
    const a = await fresh('2027-01-10', '2027-01-12')
    for (const role of ['accountant', 'housekeeping'] as const) {
      expect((await call(role, 'booking.noShow', { id: a.id })).status).toBe(403)
      const stay = await call(role, 'booking.cancelStay', { stayId: a.stayId, reason: 'gerekmedi' })
      expect(stay.status).toBe(403)
    }
    const parked = await call('reception', 'booking.park', { id: a.id, park: { reason: 'no_show_paid' } })
    expect(parked.status).toBe(200)
    const noShow = await call('reception', 'booking.noShow', { id: a.id })
    expect(noShow.status).toBe(200)
    expect((noShow.body['reservation'] as { status: string }).status).toBe('no_show')
    const b = await fresh('2027-02-10', '2027-02-12')
    const cancelled = await call('reception', 'booking.cancelStay', { stayId: b.stayId, reason: 'gerekmedi' })
    expect(cancelled.status).toBe(200)
    expect((cancelled.body['reservation'] as { status: string }).status).toBe('cancelled')
  })

  it('oda eklerken blok gerekçesi işleyiciden servise gider: gerekçesiz 409, gerekçeyle 200', async () => {
    const block = await call(roleCtx('owner'), 'reservations.createBlock', {
      roomId: ids.room,
      dateFrom: '2027-03-01',
      dateTo: '2027-03-05',
      kind: 'oos',
      reason: 'boya'
    })
    expect(block.status, JSON.stringify(block.body)).toBe(200)
    const r = await fresh('2027-03-01', '2027-03-03')
    const stay = {
      roomId: ids.room,
      checkIn: '2027-03-01',
      checkOut: '2027-03-03',
      nightlyPriceMinor: 100_000
    }
    const refused = await call('manager', 'booking.addRoom', { reservationId: r.id, stay })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toMatchObject({ messageKey: 'errors.roomBlocked' })
    const ok = await call('manager', 'booking.addRoom', {
      reservationId: r.id,
      stay,
      overrideBlockReason: 'boya bitti'
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  })
})
