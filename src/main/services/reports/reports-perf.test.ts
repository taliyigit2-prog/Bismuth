// Faz 16 target, checked here (faz-10: "SQL'de toplanarak"): ten years × twenty rooms — 73 060 room-nights and
// charges, 2 400 stays and payments, 3 653 expenses — and every report over the whole ten years answers in well
// under the limit. Rows are written straight into the tables (the services' own paths are tested elsewhere).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import { addDays, diffDays, localDate } from '@shared/date'
import { addMonths, firstOfMonth } from '@shared/domain/reports-period'
import type { DatabaseHandle } from '../../db/client'
import {
  charges,
  expenseSections,
  expenses,
  folios,
  guests,
  paymentMethods,
  payments,
  reservationRooms,
  reservations,
  roomNights,
  roomTypes,
  salesChannels
} from '../../db/schema'
import { createServices } from '..'

const owner = roleCtx('owner')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const TEN_YEARS = { from: '2016-01-01', to: '2026-01-01' }
/** Generous for a loaded CI machine; a desktop answers in a fraction of it. */
const LIMIT_MS = 4000

let handle: DatabaseHandle
let services: ReturnType<typeof createServices>

beforeAll(async () => {
  handle = await seededDatabase()
  services = createServices(handle, runtime, { clock: testClock('2026-01-05T09:00:00.000Z') })
  const db = handle.db
  const typeId = db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const rooms = Array.from({ length: 20 }, (_, i) =>
    services.rooms.createRoom(owner, {
      number: String(101 + i),
      roomTypeId: typeId,
      beds: 2,
      validFrom: '2016-01-01'
    })
  )
  const channel = db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const method = db.select().from(paymentMethods).where(eq(paymentMethods.code, 'card')).get()!.id
  const section = db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!.id
  const ts = { createdAt: '2016-01-01T00:00:00.000Z', updatedAt: '2016-01-01T00:00:00.000Z' }
  const chunk = <T>(rows: T[], write: (part: T[]) => void) => {
    for (let i = 0; i < rows.length; i += 500) write(rows.slice(i, i + 500))
  }
  db.transaction((tx) => {
    tx.insert(guests)
      .values({ id: 'g1', firstName: 'Örnek', lastName: 'Misafir', nameNormalized: 'ornek misafir', ...ts })
      .run()
    let n = 0
    const resRows: (typeof reservations.$inferInsert)[] = []
    const stayRows: (typeof reservationRooms.$inferInsert)[] = []
    const nightRows: (typeof roomNights.$inferInsert)[] = []
    const folioRows: (typeof folios.$inferInsert)[] = []
    const chargeRows: (typeof charges.$inferInsert)[] = []
    const payRows: (typeof payments.$inferInsert)[] = []
    for (let m = '2016-01'; m < '2026-01'; m = addMonths(m, 1)) {
      const from = firstOfMonth(m)
      const to = firstOfMonth(addMonths(m, 1))
      for (const room of rooms) {
        n++
        const id = `r${n}`
        resRows.push({
          id,
          code: `R-${n}`,
          primaryGuestId: 'g1',
          channelId: channel,
          status: 'checked_out',
          kind: 'overnight',
          ...ts
        })
        stayRows.push({
          id: `s${n}`,
          reservationId: id,
          roomId: room.id,
          checkIn: from,
          checkOut: to,
          status: 'done',
          ...ts
        })
        folioRows.push({ id: `f${n}`, kind: 'reservation', reservationId: id, currency: 'TRY', ...ts })
        const nights = diffDays(from, to)
        for (let d = 0; d < nights; d++) {
          const date = addDays(from, d)
          nightRows.push({
            id: `n${n}-${d}`,
            reservationRoomId: `s${n}`,
            roomId: room.id,
            date,
            slot: 'night',
            priceMinor: 200_000,
            currency: 'TRY',
            ...ts
          })
          chargeRows.push({
            id: `c${n}-${d}`,
            folioId: `f${n}`,
            date,
            kind: 'room_night',
            roomNightId: `n${n}-${d}`,
            description: date,
            unitMinor: 200_000,
            amountMinor: 200_000,
            currency: 'TRY',
            ...ts
          })
        }
        payRows.push({
          id: `p${n}`,
          folioId: `f${n}`,
          date: from,
          kind: 'payment',
          methodId: method,
          amountMinor: 200_000 * nights,
          currency: 'TRY',
          amountFolioMinor: 200_000 * nights,
          amountBaseMinor: 200_000 * nights,
          ...ts
        })
      }
    }
    chunk(resRows, (p) => tx.insert(reservations).values(p).run())
    chunk(stayRows, (p) => tx.insert(reservationRooms).values(p).run())
    chunk(nightRows, (p) => tx.insert(roomNights).values(p).run())
    chunk(folioRows, (p) => tx.insert(folios).values(p).run())
    chunk(chargeRows, (p) => tx.insert(charges).values(p).run())
    chunk(payRows, (p) => tx.insert(payments).values(p).run())
    const expRows: (typeof expenses.$inferInsert)[] = []
    for (let d = localDate('2016-01-01'), i = 0; d < '2026-01-01'; d = addDays(d, 1), i++)
      expRows.push({
        id: `e${i}`,
        date: d,
        sectionId: section,
        amountMinor: 10_000,
        currency: 'TRY',
        amountBaseMinor: 10_000,
        description: `Gider ${i % 40}`,
        descriptionKey: `gider ${i % 40}`,
        ...ts
      })
    chunk(expRows, (p) => tx.insert(expenses).values(p).run())
  })
}, 120_000)
afterAll(() => handle?.close())

const timed = <T>(run: () => T): { value: T; ms: number } => {
  const start = performance.now()
  const value = run()
  return { value, ms: performance.now() - start }
}

describe('10 yıl × 20 oda (Faz 16 hedefi)', () => {
  it('özet, doluluk, aylık, gider ve yıllık raporlar 10 yılı sınırın altında hesaplar', () => {
    const summary = timed(() => services.reports.summary(owner, TEN_YEARS))
    expect(summary.value.occupancy).toMatchObject({
      soldNights: 73_060,
      sellableNights: 73_060,
      occupancyBp: 10_000
    })
    expect(summary.value.finance?.revenueMinor).toBe(73_060 * 200_000)
    expect(summary.value.finance?.adrMinor).toBe(200_000)
    const occupancy = timed(() => services.reports.occupancy(owner, TEN_YEARS))
    expect(occupancy.value.months).toHaveLength(120)
    const monthly = timed(() => services.reports.monthly(owner, TEN_YEARS))
    expect(monthly.value.daily).toHaveLength(3653)
    const exps = timed(() => services.reports.expenses(owner, TEN_YEARS))
    expect(exps.value.totalMinor).toBe(3653 * 10_000)
    const yearly = timed(() => services.reports.yearly(owner, { years: [2024, 2025] }))
    expect(yearly.value.years[1]!.months[0]!.revenueMinor).toBe(20 * 31 * 200_000)
    for (const t of [summary, occupancy, monthly, exps, yearly]) expect(t.ms).toBeLessThan(LIMIT_MS)
  })
})
