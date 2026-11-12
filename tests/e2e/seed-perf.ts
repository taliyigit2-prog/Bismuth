// Performance data (faz-15 madde 9, faz-16 "10 yıl × 20 oda"): run after `seed-calendar.ts <folder> --dense` —
//   npx tsx --tsconfig tsconfig.node.json tests/e2e/seed-perf.ts <userData folder>
// adds the 20th room with stays from 2026 to 2036 and fills this month's ledger with 1,300 rows (700 payments on
// booked reservations, 600 expenses). Invented names and amounts; nothing about a real hotel.
import { join, resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { addDays, localDateOf, type LocalDate } from '../../src/shared/date'
import { openDatabase } from '../../src/main/db/client'
import { expenseSections, paymentMethods, reservations, rooms, salesChannels } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import { systemCtx } from '../../src/main/services/context'

async function main(): Promise<void> {
  const dir = process.argv[2]
  if (!dir) throw new Error('usage: seed-perf.ts <userData folder seeded with seed-calendar --dense>')
  const handle = await openDatabase({
    file: join(dir, 'bismuth.db'),
    migrationsFolder: resolve(__dirname, '../../drizzle')
  })
  const services = createServices(handle, {
    name: 'Bismuth',
    version: 'e2e',
    packaged: false,
    dataDir: dir,
    electron: null,
    chrome: null
  })
  const ctx = systemCtx()
  const db = handle.db
  const channel = db.select().from(salesChannels).where(eq(salesChannels.active, true)).get()!.id
  const methods = db.select().from(paymentMethods).where(eq(paymentMethods.active, true)).all()
  const section = db.select().from(expenseSections).all()[0]!.id
  const typeId = db.select().from(rooms).where(eq(rooms.number, '101')).get()!.roomTypeId

  // The 20th room, booked back to back like the others.
  const room = services.rooms.createRoom(ctx, {
    number: '506',
    roomTypeId: typeId,
    beds: 2,
    validFrom: '2026-01-01'
  })
  let d = '2026-01-01' as LocalDate
  let n = 0
  while (d < '2037-01-01') {
    const out = addDays(d, 1 + (n % 5))
    services.reservations.create(ctx, {
      guest: { firstName: 'Deniz', lastName: `Örnek ${n % 50}` },
      channelId: channel,
      stays: [{ roomId: room.id, checkIn: d, checkOut: out, nightlyPriceMinor: 210_000 }]
    })
    d = addDays(out, n % 2)
    n++
  }

  // The dense seed takes every payment "today" (one day of 12,000 rows): each is moved to its stay's first day, so
  // a month holds what a busy hotel's month holds. Test data only (no audit row).
  db.run(sql`UPDATE payments SET date = (
    SELECT MIN(rr.check_in) FROM folios f JOIN reservation_rooms rr ON rr.reservation_id = f.reservation_id
    WHERE f.id = payments.folio_id) WHERE folio_id IN (SELECT id FROM folios WHERE reservation_id IS NOT NULL)`)

  // This month's ledger: 700 payments and 600 expenses spread over its days.
  const today = localDateOf(new Date())
  const first = `${today.slice(0, 7)}-01` as LocalDate
  const booked = db.select({ id: reservations.id }).from(reservations).limit(400).all()
  for (let i = 0; i < 700; i++) {
    services.payments.create(ctx, {
      reservationId: booked[i % booked.length]!.id,
      date: addDays(first, i % 28),
      kind: 'payment',
      methodId: methods[i % methods.length]!.id,
      amountMinor: 10_000 + (i % 20) * 1_000,
      currency: 'TRY'
    })
  }
  for (let i = 0; i < 600; i++)
    services.expenses.createExpense(ctx, {
      date: addDays(first, i % 28),
      sectionId: section,
      amountMinor: 5_000 + (i % 30) * 500,
      currency: 'TRY',
      description: ['Ekmek', 'Deterjan', 'Su', 'Ampul', 'Kahve'][i % 5]!,
      paidFromDrawer: i % 3 === 0
    })
  console.log(`perf: room 506 with ${n} stays, 700 payments and 600 expenses from ${first}`)
  handle.close()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
