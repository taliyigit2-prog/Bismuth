// G-31 (K-46 (1)): the grid's years come from the data — the start-year setting or the oldest stay, ten years on or
// the furthest record — and G-190 (K-46 (3)): a room number in the calendar search brings that room's stays.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { roomTypes, salesChannels } from '../../db/schema'
import { createCalendarService } from '../calendar-service'
import { createReservationsService } from '../reservations-service'
import { createRoomsService } from '../rooms-service'
import { createSettingsService } from '../settings-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-05T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService(deps)
  const cal = createCalendarService(deps)
  const settings = createSettingsService(handle.db, clock)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2020-01-01' })
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const book = (
    roomId: string,
    checkIn: string,
    checkOut: string,
    guest = { firstName: 'Örnek', lastName: 'Misafir' }
  ) =>
    res.create(reception, {
      guest,
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 200_000 }]
    })
  return { cal, res, roomsSvc, settings, room, book }
}

describe('takvim aralığı (calendar.bounds, G-31)', () => {
  it('kayıt ve ayar yoksa geçen yıldan on yıl sonrasına kadar', async () => {
    const { cal } = await setup()
    expect(cal.bounds(owner)).toEqual({ firstYear: 2025, lastYear: 2036 })
  })

  it('ayar ve en eski kayıttan hangisi erkense oradan başlar; en ileri kaydın ertesi yılına kadar uzar', async () => {
    const { cal, settings, room, book, roomsSvc } = await setup()
    const r101 = room('101')
    book(r101.id, '2023-03-10', '2023-03-12')
    expect(cal.bounds(owner)).toEqual({ firstYear: 2023, lastYear: 2036 })
    settings.set(owner, { 'calendar.startYear': 2018 })
    expect(cal.bounds(owner).firstYear).toBe(2018)
    // A later setting than the oldest stay does not hide the stay.
    settings.set(owner, { 'calendar.startYear': 2025 })
    expect(cal.bounds(owner).firstYear).toBe(2023)
    // A stay twelve years on, and a block beyond it, carry the end with them.
    book(r101.id, '2038-06-01', '2038-06-03')
    expect(cal.bounds(owner).lastYear).toBe(2039)
    roomsSvc.createBlock(owner, {
      roomId: r101.id,
      dateFrom: '2040-01-10',
      dateTo: '2040-01-12',
      kind: 'oos',
      reason: 'Tadilat'
    })
    expect(cal.bounds(owner).lastYear).toBe(2041)
  })

  it('yalnız takvimi görebilen rol okur', async () => {
    const { cal } = await setup()
    expect(() => cal.bounds(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
    expect(cal.bounds(roleCtx('accountant')).lastYear).toBe(2036)
  })
})

describe('takvim araması: oda numarası (G-190)', () => {
  it('"302" önce 302 numaralı odanın konaklamalarını getirir (bugüne en yakın önce), sonra koda uyanları', async () => {
    const { cal, room, book } = await setup()
    const r302 = room('302')
    const r101 = room('101')
    book(r302.id, '2023-03-10', '2023-03-12', { firstName: 'Eski', lastName: 'Misafir' })
    book(r302.id, '2026-10-04', '2026-10-07', { firstName: 'Şimdiki', lastName: 'Misafir' })
    book(r302.id, '2026-12-01', '2026-12-03', { firstName: 'Gelecek', lastName: 'Misafir' })
    book(r101.id, '2026-10-05', '2026-10-06', { firstName: 'Başka', lastName: 'Oda' })
    const found = cal.findStays(owner, { query: '302' })
    expect(found.slice(0, 3).map((s) => [s.roomNumber, s.guestName])).toEqual([
      ['302', 'Şimdiki Misafir'],
      ['302', 'Gelecek Misafir'],
      ['302', 'Eski Misafir']
    ])
    expect(found.filter((s) => s.roomNumber !== '302').every((s) => s.code.includes('302'))).toBe(true)
  })

  it('oda yoksa sayı rezervasyon kodu ve telefon gibi aranır; iptal edilen konaklama gelmez', async () => {
    const { cal, res, room, book } = await setup()
    const r101 = room('101')
    const kept = book(r101.id, '2026-11-01', '2026-11-03', { firstName: 'Kalan', lastName: 'Misafir' })
    const gone = book(r101.id, '2026-11-05', '2026-11-07', { firstName: 'Giden', lastName: 'Misafir' })
    res.cancel(owner, gone.reservation.id, 'misafir vazgeçti')
    expect(cal.findStays(owner, { query: '999' })).toEqual([])
    expect(cal.findStays(owner, { query: kept.reservation.code }).map((s) => s.guestName)).toEqual([
      'Kalan Misafir'
    ])
    expect(cal.findStays(owner, { query: '101' }).map((s) => s.guestName)).toEqual(['Kalan Misafir'])
  })
})
