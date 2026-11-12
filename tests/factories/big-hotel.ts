// Synthetic large hotel (Faz 16 madde 2: "büyük veri testi, 10 yıl × 20 oda"): twenty rooms full of short stays from
// 2016 to the end of 2025 and a few into 2026 — about 15 000 reservations, 11 000 guests (a third come back), one or
// two people in each room, a night charge per night, one or two payments per stay and one to three expenses a day. The drawer
// was taken over regularly: only the last week's payments wait in it.
// Every name, phone and amount is invented (a fixed pseudo-random sequence, the same rows on every run). Rows go
// straight into the tables in one transaction; the services' own write paths are tested elsewhere.
import { eq } from 'drizzle-orm'
import { addDays, localDate } from '@shared/date'
import { normalizeName } from '@shared/domain/normalize'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { createServices } from '../../src/main/services'
import { roleCtx } from './ctx'
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
  salesChannels,
  stayOccupants
} from '../../src/main/db/schema'

export interface BigHotel {
  roomIds: string[]
  counts: {
    reservations: number
    guests: number
    nights: number
    payments: number
    expenses: number
    occupants: number
  }
  /** A guest who stayed many times (for the guest card and search). */
  regular: { id: string; lastName: string }
}

export const BIG_FROM = localDate('2016-01-01')
/** Stays start before this day; the last ones run a little into 2026 (the "current" weeks of the tests). */
export const BIG_TO = '2026-01-10'
/** Payments and drawer expenses before this day were taken over (x); the newer ones are in the drawer. */
const COLLECTED_BEFORE = '2025-12-28'

const FIRST = [
  'Ayla',
  'Bora',
  'Cem',
  'Derya',
  'Eren',
  'Filiz',
  'Gökay',
  'Hale',
  'İlkay',
  'Kaan',
  'Lale',
  'Mert'
]
const LAST = ['Akdağ', 'Bulut', 'Çınar', 'Demirtaş', 'Ekin', 'Fırat', 'Gündoğdu', 'Irmak', 'Kaya', 'Lodos']

/** A small fixed pseudo-random sequence (mulberry32): the same data on every run. */
function sequence(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedBigHotel(handle: DatabaseHandle, services: ReturnType<typeof createServices>): BigHotel {
  const db = handle.db
  const rnd = sequence(16)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] as T
  const ts = { createdAt: '2016-01-01T00:00:00.000Z', updatedAt: '2016-01-01T00:00:00.000Z' }
  const typeId = db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const channels = db
    .select()
    .from(salesChannels)
    .all()
    .map((c) => c.id)
  const methods = db
    .select()
    .from(paymentMethods)
    .all()
    .map((m) => m.id)
  const section = db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!.id

  // Rooms through the service: their capacity history (sellable nights) is what the reports count.
  const roomRows = Array.from({ length: 20 }, (_, i) =>
    services.rooms.createRoom(roleCtx('owner'), {
      number: String(101 + (i % 10) + Math.floor(i / 10) * 100),
      roomTypeId: typeId,
      beds: 2,
      validFrom: BIG_FROM
    })
  )

  const guestRows: (typeof guests.$inferInsert)[] = []
  const newGuest = (): string => {
    const n = guestRows.length
    const firstName = pick(FIRST)
    const lastName = `${pick(LAST)}${n % 7 === 0 ? '' : ` ${n}`}`
    guestRows.push({
      id: `g${n}`,
      firstName,
      lastName,
      nameNormalized: normalizeName(`${firstName} ${lastName}`),
      phone: n % 3 === 0 ? `+90 555 ${String(1_000_000 + n).slice(1)}` : null,
      phoneNormalized: n % 3 === 0 ? `90555${String(1_000_000 + n).slice(1)}` : null,
      vip: n % 97 === 0,
      standingNote: n % 53 === 0 ? 'Yüksek kat ister' : null,
      ...ts
    })
    return `g${n}`
  }
  const regular = newGuest()

  const resRows: (typeof reservations.$inferInsert)[] = []
  const stayRows: (typeof reservationRooms.$inferInsert)[] = []
  const nightRows: (typeof roomNights.$inferInsert)[] = []
  const occRows: (typeof stayOccupants.$inferInsert)[] = []
  const folioRows: (typeof folios.$inferInsert)[] = []
  const chargeRows: (typeof charges.$inferInsert)[] = []
  const payRows: (typeof payments.$inferInsert)[] = []

  for (const room of roomRows) {
    let day = addDays(BIG_FROM, Math.floor(rnd() * 3))
    while (day < BIG_TO) {
      const nights = 1 + Math.floor(rnd() * 5)
      const checkOut = addDays(day, nights)
      const n = resRows.length
      const back = guestRows.length > 50 && rnd() < 0.33
      const guestId = n % 40 === 0 ? regular : back ? `g${Math.floor(rnd() * guestRows.length)}` : newGuest()
      const done = checkOut <= '2026-01-05'
      const id = `r${n}`
      const price = 150_000 + Math.floor(rnd() * 20) * 10_000
      resRows.push({
        id,
        code: `B-${n}`,
        primaryGuestId: guestId,
        channelId: pick(channels),
        status: done ? 'checked_out' : 'confirmed',
        kind: 'overnight',
        ...ts
      })
      stayRows.push({
        id: `s${n}`,
        reservationId: id,
        roomId: room.id,
        checkIn: day,
        checkOut,
        status: done ? 'done' : 'planned',
        ...ts
      })
      const guest = guestRows[Number(guestId.slice(1))]!
      occRows.push({
        id: `o${n}a`,
        reservationRoomId: `s${n}`,
        guestId,
        fullName: `${guest.firstName} ${guest.lastName}`,
        isPrimary: true,
        ...ts
      })
      if (rnd() < 0.5) {
        const other = newGuest()
        const g = guestRows[guestRows.length - 1]!
        occRows.push({
          id: `o${n}b`,
          reservationRoomId: `s${n}`,
          guestId: other,
          fullName: `${g.firstName} ${g.lastName}`,
          ...ts
        })
      }
      folioRows.push({ id: `f${n}`, kind: 'reservation', reservationId: id, currency: 'TRY', ...ts })
      for (let d = 0; d < nights; d++) {
        const date = addDays(day, d)
        nightRows.push({
          id: `n${n}-${d}`,
          reservationRoomId: `s${n}`,
          roomId: room.id,
          date,
          slot: 'night',
          priceMinor: price,
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
          unitMinor: price,
          amountMinor: price,
          currency: 'TRY',
          ...ts
        })
      }
      const total = price * nights
      // Most stays are paid in full at arrival; some leave a deposit first and the rest at departure.
      const deposit = rnd() < 0.3 ? price : 0
      const pay = (suffix: string, date: string, amount: number, kind: 'payment' | 'deposit') =>
        payRows.push({
          id: `p${n}${suffix}`,
          folioId: `f${n}`,
          date,
          kind,
          methodId: pick(methods),
          amountMinor: amount,
          currency: 'TRY',
          amountFolioMinor: amount,
          amountBaseMinor: amount,
          // The owner takes the drawer over every few days (x, G-64): only the last week waits.
          collectedAt: date < COLLECTED_BEFORE ? `${date}T20:00:00.000Z` : null,
          ...ts
        })
      if (deposit) pay('d', addDays(day, -3), deposit, 'deposit')
      if (done) pay('p', day, total - deposit, 'payment')
      day = addDays(checkOut, Math.floor(rnd() * 3))
    }
  }

  const expRows: (typeof expenses.$inferInsert)[] = []
  for (let d = BIG_FROM; d < BIG_TO; d = addDays(d, 1)) {
    const count = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < count; i++) {
      const item = Math.floor(rnd() * 40)
      expRows.push({
        id: `e${expRows.length}`,
        date: d,
        sectionId: section,
        amountMinor: 5_000 + Math.floor(rnd() * 100) * 1_000,
        currency: 'TRY',
        amountBaseMinor: 5_000,
        paidFromDrawer: item % 4 === 0,
        settledAt: item % 4 === 0 && d < COLLECTED_BEFORE ? `${d}T20:00:00.000Z` : null,
        description: `Gider ${item}`,
        descriptionKey: `gider ${item}`,
        ...ts
      })
    }
  }

  const chunk = <T>(rows: T[], write: (part: T[]) => void) => {
    for (let i = 0; i < rows.length; i += 500) write(rows.slice(i, i + 500))
  }
  db.transaction((tx) => {
    chunk(guestRows, (p) => tx.insert(guests).values(p).run())
    chunk(resRows, (p) => tx.insert(reservations).values(p).run())
    chunk(stayRows, (p) => tx.insert(reservationRooms).values(p).run())
    chunk(nightRows, (p) => tx.insert(roomNights).values(p).run())
    chunk(occRows, (p) => tx.insert(stayOccupants).values(p).run())
    chunk(folioRows, (p) => tx.insert(folios).values(p).run())
    chunk(chargeRows, (p) => tx.insert(charges).values(p).run())
    chunk(payRows, (p) => tx.insert(payments).values(p).run())
    chunk(expRows, (p) => tx.insert(expenses).values(p).run())
  })
  handle.sqlite.pragma('optimize')

  return {
    roomIds: roomRows.map((r) => r.id),
    counts: {
      reservations: resRows.length,
      guests: guestRows.length,
      nights: nightRows.length,
      payments: payRows.length,
      expenses: expRows.length,
      occupants: occRows.length
    },
    regular: { id: regular, lastName: guestRows[0]!.lastName }
  }
}
