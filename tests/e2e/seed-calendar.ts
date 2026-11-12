// E2E helper (Node, run with tsx before the app starts): sets a data folder up with the small e2e hotel and a few
// invented stays around today, for the calendar tests and screenshots —
//   npx tsx --tsconfig tsconfig.node.json tests/e2e/seed-calendar.ts <userData folder> [--dense]
// `--dense` (the performance profile, faz-05 kabul ölçütü): 19 rooms booked back to back from 2026 to 2036.
// Room 101: a guest in the house (one night paid, not reported to KBS); 102: arriving today; 103: a day-use and a
// night on the same day; 201: not for sale; 202: a long paid stay; 203: free. A note five days ahead.
import { join, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { addDays, diffDays, localDateOf, type LocalDate } from '../../src/shared/date'
import { openDatabase } from '../../src/main/db/client'
import { seedBaseData } from '../../src/main/db/seed/seed'
import { paymentMethods, rooms, salesChannels } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import { systemCtx } from '../../src/main/services/context'
import { draftFrom } from './setup-draft.mjs'

async function main(): Promise<void> {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: seed-calendar.ts <userData folder>')
  mkdirSync(dir, { recursive: true })
  const root = resolve(__dirname, '../..')
  const handle = await openDatabase({
    file: join(dir, 'bismuth.db'),
    migrationsFolder: resolve(root, 'drizzle')
  })
  seedBaseData(handle.db)
  const services = createServices(handle, {
    name: 'Bismuth',
    version: 'e2e',
    packaged: false,
    dataDir: dir,
    electron: null,
    chrome: null
  })
  const ctx = systemCtx()
  services.setup.finish(ctx, draftFrom(services.setup.options(ctx)))

  const today: LocalDate = localDateOf(new Date())
  const room = (n: string) => handle.db.select().from(rooms).where(eq(rooms.number, n)).get()!.id
  const channel = handle.db.select().from(salesChannels).where(eq(salesChannels.active, true)).get()!.id
  const method = handle.db.select().from(paymentMethods).where(eq(paymentMethods.active, true)).get()!.id
  const book = (
    roomNumber: string,
    from: number,
    to: number,
    firstName: string,
    lastName: string,
    price = 280_000,
    phone?: string
  ) =>
    services.reservations.create(ctx, {
      guest: { firstName, lastName, phone },
      channelId: channel,
      stays: [
        {
          roomId: room(roomNumber),
          checkIn: addDays(today, from),
          checkOut: addDays(today, to),
          nightlyPriceMinor: price
        }
      ]
    })
  const pay = (reservationId: string, amountMinor: number) =>
    services.payments.create(ctx, {
      reservationId,
      date: today,
      kind: 'payment',
      methodId: method,
      amountMinor,
      currency: 'TRY'
    })

  const inHouse = book('101', -1, 3, 'Ayşe', 'Kılıç', 280_000, '0532 111 22 33')
  pay(inHouse.reservation.id, 280_000)
  services.reservations.checkIn(ctx, inHouse.stays[0]!.id)
  book('102', 0, 2, 'Mehmet', 'Demir')
  book('103', 0, 0, 'Gündüz', 'Konuk', 150_000)
  book('103', 0, 1, 'Elif', 'Aydın')
  services.rooms.createBlock(ctx, {
    roomId: room('201'),
    dateFrom: addDays(today, 2),
    dateTo: addDays(today, 5),
    kind: 'oos',
    reason: 'Sahibin misafiri'
  })
  const long = book('202', -3, 10, 'Ivan', 'Petrov', 270_000)
  pay(long.reservation.id, 13 * 270_000)
  services.calendar.addNote(ctx, { title: 'Fuar', target: { mode: 'single', date: addDays(today, 5) } })
  if (process.argv.includes('--dense')) dense()
  handle.close()

  /** 13 more rooms (19 in all) and stays of 1–6 nights with 0–2 free days between them, 2026–2036. */
  function dense(): void {
    const typeId = handle.db.select().from(rooms).where(eq(rooms.number, '101')).get()!.roomTypeId
    for (const n of [
      '301',
      '302',
      '303',
      '304',
      '401',
      '402',
      '403',
      '404',
      '501',
      '502',
      '503',
      '504',
      '505'
    ])
      services.rooms.createRoom(ctx, { number: n, roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
    let x = 7
    const next = (max: number): number => {
      x = (x * 1103515245 + 12345) % 2147483648
      return x % (max + 1)
    }
    const names = ['Deniz', 'Ece', 'Mert', 'Selin', 'Anna', 'Lukas', 'Olga', 'Omar']
    const surnames = ['Arslan', 'Yıldız', 'Koç', 'Smith', 'Müller', 'Ivanova', 'Haddad']
    const end = '2037-01-01' as LocalDate
    const busy = (roomNumber: string, d: LocalDate) =>
      ['101', '102', '103', '202'].includes(roomNumber) && Math.abs(diffDays(today, d)) < 15
    let count = 0
    for (const r of handle.db.select().from(rooms).all()) {
      let d = '2026-01-01' as LocalDate
      while (d < end) {
        const nights = 1 + next(5)
        const out = addDays(d, nights)
        if (
          !busy(r.number, d) &&
          !busy(r.number, out) &&
          !(r.number === '201' && Math.abs(diffDays(today, d)) < 10)
        ) {
          const res = services.reservations.create(ctx, {
            guest: { firstName: names[next(7)]!, lastName: surnames[next(6)]! },
            channelId: channel,
            stays: [
              { roomId: r.id, checkIn: d, checkOut: out, nightlyPriceMinor: 200_000 + next(8) * 10_000 }
            ]
          })
          if (next(2) > 0) pay(res.reservation.id, 200_000)
          count++
        }
        d = addDays(out, next(2))
      }
    }
    console.log(`dense: ${count} reservations`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
