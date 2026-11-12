// Faz 10 turizm istatistiği hata avı düzeltmeleri (P10fix #4, #5, #10, #11) with synthetic KBS files only
// (tests/factories/kbs.ts): rows without a nationality are assigned one by one, a re-import keeps the
// "bildirildi" mark, and the comparison with Bismuth counts real stays the way KBS does.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { localDate } from '@shared/date'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import { kbsWorkbookBuffer } from '../../../tests/factories/kbs'
import type { DatabaseHandle } from '../db/client'
import { countryMap, kbsStayRows, reservations, roomTypes, salesChannels, stayOccupants } from '../db/schema'
import { createServices } from '.'
import { AppError } from './errors'
import type { KbsRow } from './tourism/kbs-reader'

const owner = roleCtx('owner')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const FILE = 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const row = (arrival: string, departure: string | null, room: string, nationalityRaw: string): KbsRow => ({
  arrival: localDate(arrival),
  departure: departure ? localDate(departure) : null,
  room,
  nationalityRaw,
  status: 'Pasif'
})

async function hotel(start: string) {
  handle = await seededDatabase()
  const clock = testClock(start)
  const s = createServices(handle, runtime, { clock })
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const rooms = ['101', '102', '103'].map((number) =>
    s.rooms.createRoom(owner, { number, roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
  )
  const book = (room: number, checkIn: string, checkOut: string, nationality: string) => {
    const id = s.reservations.create(owner, {
      guest: { firstName: 'Örnek', lastName: `Misafir ${room}` },
      channelId: direct,
      stays: [{ roomId: rooms[room]!.id, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    }).reservation.id
    const view = s.reservations.get(owner, id)
    s.guests.update(owner, view.reservation.primaryGuestId, { nationality })
    return view
  }
  const importRows = async (rows: KbsRow[]) =>
    s.tourism.importKbs(owner, { fileName: FILE, bytes: new Uint8Array(await kbsWorkbookBuffer(rows)) })
  return { s, clock, rooms, book, importRows }
}

describe('çıkışı girişten önce olan KBS satırı (QA3c2)', () => {
  it('otelde kalan sayılmaz, geceye ve tabloya katılmaz; hatalı tarih olarak listelenir', async () => {
    const h = await hotel('2026-10-04T09:00:00.000Z')
    const t = await h.importRows([
      row('2026-09-12', '2026-09-10', '205', 'GERMANY (Deutschland)'),
      row('2026-09-10', '2026-09-12', '101', 'TÜRKİYE')
    ])
    expect(t.inHouse).toEqual([])
    expect(t.issues).toMatchObject({ invalidDates: 1, missingDeparture: 0 })
    expect(t.invalidDates.map((r) => [r.room, r.arrival, r.departure])).toEqual([
      ['205', '2026-09-12', '2026-09-10']
    ])
    expect(t.totals).toEqual({ arrivals: 1, nights: 2 })
    expect(t.clipboard).toBe('Türkiye\t1\t2')
  })
})

describe('uyruğu boş KBS satırı (P10fix #4)', () => {
  it('boş ya da "-" satırlar yazım onayına düşmez; satır bazında ülkeye atanır ve hatırlanmaz', async () => {
    const h = await hotel('2026-10-04T09:00:00.000Z')
    const rows = [
      row('2026-09-30', '2026-10-02', '101', 'GERMANY (Deutschland)'),
      row('2026-09-10', '2026-09-10', '102', 'TÜRKİYE'),
      row('2026-09-11', '2026-09-12', '103', ''),
      row('2026-09-12', '2026-09-13', '103', '-')
    ]
    const t = await h.importRows(rows)
    expect(t.review).toEqual([])
    expect(t.blankNationality.map((r) => [r.room, r.arrival, r.country])).toEqual([
      ['103', '2026-09-11', null],
      ['103', '2026-09-12', null]
    ])
    expect(t.totals).toEqual({ arrivals: 4, nights: 5 })
    // One line "Uyruk eksik" (empty name) until the rows are assigned; the copy stays closed.
    expect(t.table.find((r) => !r.iso2)).toMatchObject({
      country: '',
      arrivals: 2,
      nights: 2,
      needsReview: true
    })
    const [first, second] = t.blankNationality
    const one = h.s.tourism.assignRow(owner, { importId: t.import.id, rowId: first!.rowId!, iso2: 'TR' })
    expect(one.table.find((r) => r.iso2 === 'TR')).toMatchObject({
      country: 'Türkiye',
      arrivals: 2,
      nights: 2
    })
    expect(one.blankNationality.filter((r) => !r.country)).toHaveLength(1)
    const both = h.s.tourism.assignRow(owner, { importId: t.import.id, rowId: second!.rowId!, iso2: 'DE' })
    expect(both.blankNationality.every((r) => r.country)).toBe(true)
    expect(both.table.map((r) => [r.country, r.arrivals, r.nights])).toEqual([
      ['Almanya', 2, 3],
      ['Türkiye', 2, 2]
    ])
    expect(both.totals).toEqual({ arrivals: 4, nights: 5 })
    expect(both.clipboard).toBe('Almanya\t2\t3\nTürkiye\t2\t2')
    // Taken back, and nothing went into the spelling memory.
    const back = h.s.tourism.assignRow(owner, { importId: t.import.id, rowId: second!.rowId!, iso2: null })
    expect(back.blankNationality.filter((r) => !r.country)).toHaveLength(1)
    expect(handle.db.select().from(countryMap).where(eq(countryMap.keyNormalized, '')).get()).toBeUndefined()
    const again = await h.importRows(rows)
    expect(again.blankNationality.every((r) => r.country === null)).toBe(true)
  })

  it('uyruğu yazılı satır atanamaz; yetkisiz rol reddedilir', async () => {
    const h = await hotel('2026-10-04T09:00:00.000Z')
    const t = await h.importRows([
      row('2026-09-10', '2026-09-11', '101', 'TÜRKİYE'),
      row('2026-09-11', '2026-09-12', '102', '')
    ])
    const stored = handle.db.select().from(kbsStayRows).all()
    const written = stored.find((r) => r.nationalityRaw === 'TÜRKİYE')!
    expect(() =>
      h.s.tourism.assignRow(owner, { importId: t.import.id, rowId: written.id, iso2: 'DE' })
    ).toThrowError(expect.objectContaining({ messageKey: 'errors.kbsRowHasNationality' }))
    const blank = t.blankNationality[0]!
    for (const role of ['manager', 'accountant'] as const)
      expect(
        h.s.tourism.assignRow(roleCtx(role), { importId: t.import.id, rowId: blank.rowId!, iso2: 'TR' })
          .blankNationality[0]!.country
      ).toMatchObject({ iso2: 'TR' })
    expect(() =>
      h.s.tourism.assignRow(roleCtx('reception'), { importId: t.import.id, rowId: blank.rowId!, iso2: 'TR' })
    ).toThrowError(AppError)
  })
})

describe('bildirildi işareti yeniden içe almada korunur (P10fix #10)', () => {
  it('aynı ay yeniden alınınca yeni dosya bildirilmiş sayılır; ekran ve ay sonu aynı şeyi söyler', async () => {
    const h = await hotel('2026-10-04T09:00:00.000Z')
    const rows = [row('2026-09-10', '2026-09-12', '101', 'TÜRKİYE')]
    const first = await h.importRows(rows)
    const marked = h.s.tourism.markReported(owner, first.import.id, true)
    h.clock.set('2026-10-05T09:00:00.000Z')
    const again = await h.importRows(rows)
    expect(again.import.reportedAt).toBe(marked.reportedAt)
    expect(h.s.tourism.listImports(owner, '2026-09')[0]).toMatchObject({
      id: again.import.id,
      reportedAt: marked.reportedAt
    })
    expect(h.s.reports.monthEnd(owner, { year: 2026, month: 9 }).tourism?.reportedAt).toBe(marked.reportedAt)
    // Undone on the newest import: the month-end check follows it (an older import's mark does not count).
    h.s.tourism.markReported(owner, again.import.id, false)
    expect(h.s.reports.monthEnd(owner, { year: 2026, month: 9 }).tourism?.reportedAt).toBeNull()
  })
})

describe('Bismuth kayıtlarıyla karşılaştırma (P10fix #5, #11)', () => {
  it('konaklama içinde oda değişikliği tek kalıştır: fark yok', async () => {
    const h = await hotel('2026-09-01T09:00:00.000Z')
    const a = h.book(0, '2026-09-05', '2026-09-10', 'DE')
    h.clock.set('2026-09-05T12:00:00.000Z')
    h.s.reservations.checkIn(owner, a.stays[0]!.id)
    h.clock.set('2026-09-07T12:00:00.000Z')
    h.s.reservations.changeRoom(owner, a.stays[0]!.id, { newRoomId: h.rooms[1]!.id, fromDate: '2026-09-07' })
    h.clock.set('2026-10-03T09:00:00.000Z')
    const t = await h.importRows([row('2026-09-05', '2026-09-10', '101', 'GERMANY')])
    const c = h.s.tourism.compareWithProgram(owner, t.import.id)
    expect(c.programTotals).toEqual({ arrivals: 1, nights: 5 })
    expect(c.differences).toEqual([])
    expect(c.onlyInKbs).toEqual([])
    expect(c.onlyInProgram).toEqual([])
    expect(c.matched).toBe(1)
  })

  it('giriş yapılmamış geçmiş kalış sayılmaz; sonradan gelen kişi kendi giriş gününden sayılır', async () => {
    const h = await hotel('2026-09-01T09:00:00.000Z')
    const a = h.book(0, '2026-09-05', '2026-09-10', 'DE')
    h.clock.set('2026-09-05T12:00:00.000Z')
    h.s.reservations.checkIn(owner, a.stays[0]!.id)
    h.clock.set('2026-09-08T12:00:00.000Z')
    h.s.occupants.add(owner, a.stays[0]!.id, { fullName: 'Sonradan Gelen' })
    h.book(1, '2026-09-12', '2026-09-14', 'DE')
    h.clock.set('2026-10-03T09:00:00.000Z')
    const t = await h.importRows([
      row('2026-09-05', '2026-09-10', '101', 'GERMANY'),
      row('2026-09-08', '2026-09-10', '101', 'GERMANY')
    ])
    const c = h.s.tourism.compareWithProgram(owner, t.import.id)
    expect(c.programTotals).toEqual(t.totals)
    expect(c.programTotals).toEqual({ arrivals: 2, nights: 7 })
    expect(c.missingNationality).toEqual([
      { reservationCode: a.reservation.code, room: '101', arrival: '2026-09-08', name: 'Sonradan Gelen' }
    ])
    expect(c.onlyInProgram).toEqual([])
    expect(c.onlyInKbs).toEqual([])
  })
})

describe('kişi listesi olmayan konaklama (K-29: çocuk ayrı giriş değil)', () => {
  it('kişi kaydı yoksa yetişkin sayısı kadar giriş sayılır, çocuk sayılmaz; ekran için konaklama sayısı döner', async () => {
    const h = await hotel('2026-09-01T09:00:00.000Z')
    const a = h.book(0, '2026-09-05', '2026-09-08', 'DE')
    h.clock.set('2026-09-05T12:00:00.000Z')
    h.s.reservations.checkIn(owner, a.stays[0]!.id)
    // An imported stay: the head count only (2 adults + 1 child), no person rows (S-22).
    handle.db
      .update(reservations)
      .set({ adults: 2, children: 1 })
      .where(eq(reservations.id, a.reservation.id))
      .run()
    handle.db.delete(stayOccupants).where(eq(stayOccupants.reservationRoomId, a.stays[0]!.id)).run()
    const b = h.book(1, '2026-09-10', '2026-09-12', 'DE')
    h.clock.set('2026-09-10T12:00:00.000Z')
    h.s.reservations.checkIn(owner, b.stays[0]!.id)
    h.clock.set('2026-10-03T09:00:00.000Z')
    const t = await h.importRows([
      row('2026-09-05', '2026-09-08', '101', 'GERMANY'),
      row('2026-09-05', '2026-09-08', '101', 'GERMANY'),
      row('2026-09-10', '2026-09-12', '102', 'GERMANY')
    ])
    const c = h.s.tourism.compareWithProgram(owner, t.import.id)
    expect(c.programTotals).toEqual({ arrivals: 3, nights: 3 + 3 + 2 })
    expect(c.programTotals).toEqual(t.totals)
    expect(c.differences).toEqual([])
    expect(c.headCountStays).toBe(1)
  })
})
