// Demo hotel for development and screenshots (faz-02 madde 5): a Pandora-like 19-room / 38-bed hotel with a year
// of reservations, payments, expenses, staff, laundry and daily operations — every name and amount invented.
// Everything is written through the services (permissions, transactions, audit rows) with a moving clock, so the
// data looks exactly like data typed by hand. Deterministic for a given seed (only ids differ between runs).
import { addDays, diffDays, localDate, localDateOf, weekday, type LocalDate } from '@shared/date'
import { money, multiplyRatio } from '@shared/money'
import type { DatabaseHandle } from '../client'
import {
  expenseSections,
  laundryItemTypes,
  paymentMethods,
  productCategories,
  roles,
  roomTypes,
  salesChannels,
  taskTemplates
} from '../schema'
import { eq } from 'drizzle-orm'
import { createServices, localOwnerCtx } from '../../services'

export interface DemoOptions {
  /** Last day of the generated history (default: today). */
  until?: LocalDate
  /** Days of history before `until` (default 365). */
  days?: number
  /** Days of future bookings after `until` (default 60). */
  aheadDays?: number
  /** PRNG seed: the same seed gives the same hotel. */
  seed?: number
  /** Folder for attachments/backups of the demo (default: none written). */
  dataDir?: string
}

export interface DemoSummary {
  rooms: number
  beds: number
  reservations: number
  payments: number
  expenses: number
  employees: number
  users: { username: string; role: string; password: string }[]
}

/** mulberry32: small, fast, good enough for demo data. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))
  const pick = <T>(list: readonly T[]): T => list[int(0, list.length - 1)] as T
  const chance = (p: number): boolean => next() < p
  return { next, int, pick, chance }
}

const FIRST = [
  'Deniz',
  'Ece',
  'Mert',
  'Selin',
  'Burak',
  'Derya',
  'Kerem',
  'Aslı',
  'Onur',
  'Pınar',
  'Anna',
  'Lukas',
  'Olga',
  'Ivan',
  'Sofia',
  'Jonas',
  'Leila',
  'Omar',
  'Mia',
  'Noah'
]
const LAST = [
  'Yıldız',
  'Kara',
  'Aydın',
  'Öztürk',
  'Arslan',
  'Doğan',
  'Kılıç',
  'Çetin',
  'Schmidt',
  'Müller',
  'Petrova',
  'Ivanov',
  'Rossi',
  'Novak',
  'Haddad',
  'Silva'
]
const DESCRIPTORS = ['kızıl saçlı', 'gözlüklü', 'uzun boylu', 'sakallı', 'çocuklu', null, null, null]
/** Nightly prices in kuruş (picked, never multiplied: tutar arithmetic stays in money.ts). */
const TRY_PRICES = [150_000, 175_000, 200_000, 225_000, 250_000, 300_000]
const EUR_PRICES = [4_500, 5_500, 6_500, 7_500]
const CHANNELS = [
  'direct',
  'direct',
  'direct',
  'booking',
  'booking',
  'airbnb',
  'airbnb',
  'walk_in',
  'phone',
  'expedia',
  'ostrovok'
]
const STAY_NIGHTS = [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 7]
const MARKET = [12_000, 18_500, 25_000, 32_000, 47_500, 64_000, 89_000]
const MONTHLY = [
  { text: 'Elektrik faturası', amounts: [850_000, 920_000, 1_040_000] },
  { text: 'Su faturası', amounts: [210_000, 245_000, 280_000] },
  { text: 'Doğalgaz faturası', amounts: [320_000, 610_000, 980_000] },
  { text: 'İnternet', amounts: [75_000] }
]
const STAFF = [
  { firstName: 'Deniz', lastName: 'Örnekoğlu', position: 'Resepsiyon', salary: 3_600_000 },
  { firstName: 'Ece', lastName: 'Demirtaş', position: 'Resepsiyon', salary: 3_600_000 },
  { firstName: 'Mert', lastName: 'Kayalı', position: 'Kat görevlisi', salary: 3_000_000 },
  { firstName: 'Selin', lastName: 'Toprak', position: 'Kat görevlisi', salary: 3_000_000 }
]
const ROOMS = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '201',
  '202',
  '203',
  '204',
  '205',
  '301',
  '302',
  '303',
  '304',
  '305',
  '401',
  '402',
  '403',
  '404'
]

/** Hotel wall-clock moment of a day (Istanbul is UTC+3 all year). */
const at = (day: LocalDate, hhmm: string): string => `${day}T${hhmm}:00+03:00`

export async function seedDemo(handle: DatabaseHandle, opts: DemoOptions = {}): Promise<DemoSummary> {
  const r = rng(opts.seed ?? 20_261_001)
  const until = opts.until ?? localDateOf(new Date())
  const start = addDays(until, -(opts.days ?? 365))
  const end = addDays(until, opts.aheadDays ?? 60)
  let now = new Date(at(start, '08:00'))
  const clock = (): Date => new Date(now)
  const setTime = (iso: string): void => {
    now = new Date(iso)
  }
  const dataDir = opts.dataDir ?? ''
  const svc = createServices(
    handle,
    { name: 'Bismuth', version: 'demo', packaged: false, dataDir, electron: null, chrome: null },
    { clock }
  )
  const owner = localOwnerCtx('demo')
  const db = handle.db
  const codeId = <
    T extends
      typeof salesChannels | typeof paymentMethods | typeof expenseSections | typeof roles | typeof roomTypes
  >(
    table: T,
    code: string
  ): string => {
    const row = db.select().from(table).where(eq(table.code, code)).get()
    if (!row) throw new Error(`demo: seed row ${code} missing`)
    return row.id
  }

  // Hotel settings and accounts.
  svc.settings.set(owner, { 'hotel.name': 'Demo Otel', 'staff.advanceFromDrawer': true })
  const users = [
    { username: 'sahip', role: 'owner', displayName: 'Otel Sahibi' },
    { username: 'mudur', role: 'manager', displayName: 'Müdür' },
    { username: 'resepsiyon', role: 'reception', displayName: 'Resepsiyon' },
    { username: 'muhasebe', role: 'accountant', displayName: 'Muhasebe' },
    { username: 'temizlik', role: 'housekeeping', displayName: 'Kat görevlisi' }
  ].map((u) => {
    svc.users.createUser(owner, {
      username: u.username,
      displayName: u.displayName,
      roleId: codeId(roles, u.role),
      password: 'demo-sifre-1'
    })
    return { username: u.username, role: u.role, password: 'demo-sifre-1' }
  })

  // The every-10-stays deep clean counts from the start of the demo history (not from today's seeding).
  const deepClean = db.select().from(taskTemplates).where(eq(taskTemplates.code, 'deep_clean_every_n')).get()
  if (deepClean) svc.tasks.updateTemplate(owner, deepClean.id, { firstDueAt: start })

  // 19 rooms × 2 beds = 38 real beds (Pandora-like).
  const types = ['double', 'twin', 'double', 'twin']
  const rooms = ROOMS.map((number, i) =>
    svc.rooms.createRoom(owner, {
      number,
      floor: number.slice(0, 1),
      roomTypeId: codeId(roomTypes, types[i % types.length] as string),
      beds: 2,
      sort: i,
      validFrom: start
    })
  )

  // A month-by-month hotel EUR rate (invented), recorded before the payments that use it.
  for (let d = start, k = 0; d <= end; d = addDays(d, 30), k++) {
    setTime(at(d, '08:00'))
    svc.currency.recordRate(owner, {
      base: 'EUR',
      quote: 'TRY',
      midRateMicro: 36_000_000 + k * 350_000,
      source: 'hotel'
    })
  }

  const cash = codeId(paymentMethods, 'cash')
  const card = codeId(paymentMethods, 'card')
  const bank = codeId(paymentMethods, 'bank')
  let reservations = 0
  let payments = 0
  let expenses = 0

  // Reservations, room by room, without overlaps; past ones checked in, out and paid.
  for (const room of rooms) {
    let day = addDays(start, r.int(0, 3))
    while (day < end) {
      const nights = r.pick(STAY_NIGHTS)
      const checkIn = day
      const checkOut = addDays(day, nights)
      if (checkOut > end) break
      const eur = r.chance(0.15)
      const currency = eur ? 'EUR' : 'TRY'
      const price = eur ? r.pick(EUR_PRICES) : r.pick(TRY_PRICES)
      const booked = addDays(checkIn, -r.int(0, 20))
      setTime(at(booked < start ? start : booked, '10:00'))
      const detail = svc.reservations.create(owner, {
        guest: {
          firstName: r.pick(FIRST),
          lastName: r.pick(LAST),
          phone: r.chance(0.6) ? `0532 000 ${r.int(10, 99)} ${r.int(10, 99)}` : null
        },
        channelId: codeId(salesChannels, r.pick(CHANNELS)),
        currency,
        adults: r.int(1, 2),
        stays: [{ roomId: room.id, checkIn, checkOut, nightlyPriceMinor: price }]
      })
      reservations++
      const total = multiplyRatio(money(price, currency), Math.max(1, nights)).amountMinor
      const stayId = detail.stays[0]?.id as string
      const pay = (date: LocalDate, amountMinor: number, kind: 'payment' | 'deposit' = 'payment') => {
        if (amountMinor <= 0) return
        svc.payments.create(owner, {
          reservationId: detail.reservation.id,
          date,
          kind,
          methodId: r.pick([cash, cash, card, card, bank]),
          amountMinor,
          currency
        })
        payments++
      }
      const deposit = r.chance(0.25) ? multiplyRatio(money(total, currency), 1, 2).amountMinor : 0
      if (deposit) pay(booked < start ? start : booked, deposit, 'deposit')

      if (checkIn > until) {
        // Future booking: some get cancelled.
        if (r.chance(0.05)) svc.reservations.cancel(owner, detail.reservation.id, 'misafir iptal etti')
      } else {
        setTime(at(checkIn, '14:30'))
        svc.reservations.checkIn(owner, stayId)
        const people = svc.occupants.list(owner, stayId)
        if (r.chance(0.35))
          people.push(
            svc.occupants.add(owner, stayId, {
              fullName: `${r.pick(FIRST)} ${r.pick(LAST)}`,
              descriptorNote: r.pick(DESCRIPTORS)
            })
          )
        // Almost everybody is reported to KBS at once; a few recent ones are left for the demo's warning list.
        const late = diffDays(checkIn, until) <= 2 && r.chance(0.3)
        for (const p of people) if (!late) svc.occupants.markKbsReported(owner, p.id)
        const rest = total - deposit
        const unpaidRest = r.chance(0.03)
        if (r.chance(0.6) && !unpaidRest) pay(checkIn, rest)
        if (checkOut <= until && (checkOut < until || r.chance(0.5))) {
          setTime(at(checkOut, nights === 0 ? '18:00' : '11:30'))
          const paidSoFar = svc.reservations.get(owner, detail.reservation.id).folio
          if (!unpaidRest && paidSoFar.balanceMinor > 0) pay(checkOut, paidSoFar.balanceMinor)
          svc.reservations.checkOut(owner, stayId)
          for (const p of svc.occupants.list(owner, stayId))
            if (p.kbsReportedAt) svc.occupants.markKbsCheckout(owner, p.id)
          // The deep clean opened every 10 stays is done the same afternoon.
          for (const t of svc.tasks.listTasks(owner, { roomId: room.id, status: ['open'] })) {
            setTime(at(checkOut, '15:00'))
            svc.tasks.done(owner, t.id)
          }
        }
      }
      day = addDays(checkOut, nights === 0 ? 1 : r.pick([0, 0, 0, 1, 1, 2, 3]))
    }
  }

  // Day by day: drawer expenses, weekly handover of collected money, monthly bills and the owner's rent.
  const general = codeId(expenseSections, 'general')
  const ownerSection = codeId(expenseSections, 'owner')
  const expense = (
    date: LocalDate,
    sectionId: string,
    description: string,
    amountMinor: number,
    drawer: boolean
  ) => {
    svc.expenses.createExpense(owner, {
      date,
      sectionId,
      amountMinor,
      currency: 'TRY',
      description,
      paidFromDrawer: drawer
    })
    expenses++
  }
  for (let d = start; d <= until; d = addDays(d, 1)) {
    setTime(at(d, '19:00'))
    if (r.chance(0.7))
      expense(
        d,
        general,
        r.pick(['Market', 'Ekmek ve kahvaltılık', 'Temizlik malzemesi', 'Kırtasiye']),
        r.pick(MARKET),
        true
      )
    if (Number(d.slice(8, 10)) === 5) {
      for (const bill of MONTHLY) expense(d, general, bill.text, r.pick(bill.amounts), false)
      expense(d, ownerSection, 'Kira', 9_000_000, false)
    }
    if (weekday(d) === 1) {
      setTime(at(d, '20:00'))
      svc.payments.handover(owner, { upToDate: addDays(d, -1) })
    }
  }

  // Staff: salary, rest days, advances from the drawer, the month paid out and locked.
  const employees = STAFF.map((s) =>
    svc.staff.createEmployee(owner, {
      firstName: s.firstName,
      lastName: s.lastName,
      position: s.position,
      startDate: start,
      salary: { monthlyMinor: s.salary, currency: 'TRY', validFrom: localDate(`${start.slice(0, 7)}-01`) }
    })
  )
  for (let m = localDate(`${start.slice(0, 7)}-01`); m <= until;) {
    const next = localDate(
      new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 10)
    )
    const year = Number(m.slice(0, 4))
    const month = Number(m.slice(5, 7))
    const monthDone = next <= until
    for (const e of employees) {
      const restDays = r.int(2, 4)
      const days = new Set<number>()
      while (days.size < restDays) days.add(r.int(1, 28))
      for (const dd of days) {
        const date = localDate(`${m.slice(0, 8)}${String(dd).padStart(2, '0')}`)
        if (date < start || date > until) continue
        setTime(at(date, '09:00'))
        svc.staff.addLeave(owner, { employeeId: e.id, date, kind: 'rest_day' })
      }
      const advanceDay = localDate(`${m.slice(0, 8)}15`)
      if (r.chance(0.5) && advanceDay >= start && advanceDay <= until) {
        setTime(at(advanceDay, '12:00'))
        svc.staff.addTransaction(owner, {
          employeeId: e.id,
          date: advanceDay,
          kind: 'advance',
          amountMinor: r.pick([500_000, 1_000_000, 1_250_000]),
          paidFromDrawer: true
        })
      }
      if (monthDone) {
        const payday = addDays(next, -1)
        setTime(at(payday, '18:00'))
        const period = svc.staff.salaryPeriod(owner, { employeeId: e.id, year, month })
        if (period.remaining > 0)
          svc.staff.addTransaction(owner, {
            employeeId: e.id,
            date: payday,
            kind: 'salary_payment',
            amountMinor: period.remaining,
            methodId: bank
          })
        svc.staff.lockPeriod(owner, { employeeId: e.id, year, month })
      }
    }
    m = next
  }

  // Laundry: dirty out every second day, clean back the next day; each month settled against the invoice.
  setTime(at(start, '09:00'))
  const laundry = svc.contacts.create(owner, {
    name: 'Demo Çamaşırhane',
    category: 'laundry',
    phones: [{ label: 'iş', number: '0216 000 00 00' }]
  })
  const item = (code: string) => {
    const row = db.select().from(laundryItemTypes).where(eq(laundryItemTypes.code, code)).get()
    if (!row) throw new Error(`demo: laundry type ${code} missing`)
    return row.id
  }
  const linen = [
    { id: item('sheet'), price: 1_500 },
    { id: item('duvet_cover'), price: 2_500 },
    { id: item('pillowcase'), price: 800 },
    { id: item('bath_towel'), price: 1_200 }
  ]
  for (const l of linen)
    svc.laundry.setPrice(owner, {
      contactId: laundry.id,
      itemTypeId: l.id,
      validFrom: start,
      unitPriceMinor: l.price
    })
  for (let d = start; d < until; d = addDays(d, 2)) {
    setTime(at(d, '15:00'))
    const items = linen.map((l) => ({ itemTypeId: l.id, qty: r.int(6, 24) }))
    svc.laundry.recordDelivery(owner, { date: d, direction: 'out', contactId: laundry.id, items })
    const back = addDays(d, 1)
    if (back > until) continue
    setTime(at(back, '11:00'))
    svc.laundry.recordDelivery(owner, {
      date: back,
      direction: 'in',
      contactId: laundry.id,
      items: items.map((i) => ({
        ...i,
        qty: r.chance(0.1) ? Math.max(0, i.qty - 1) : i.qty,
        stainedQty: r.chance(0.1) ? 1 : 0
      }))
    })
  }
  for (let m = localDate(`${start.slice(0, 7)}-01`); ;) {
    const next = localDate(
      new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 10)
    )
    if (next > until) break
    setTime(at(next, '10:00'))
    const month = svc.laundry.month(owner, laundry.id, Number(m.slice(0, 4)), Number(m.slice(5, 7)))
    const computed = month.totalAmountMinor ?? 0
    svc.laundry.settle(owner, {
      contactId: laundry.id,
      year: Number(m.slice(0, 4)),
      month: Number(m.slice(5, 7)),
      invoicedTotalMinor: r.chance(0.25) ? computed + r.pick([1_500, 2_500, 4_000]) : computed
    })
    expenses++
    m = next
  }

  // Supplies bought now and then, getting dearer.
  const cleaningCategory =
    db.select().from(productCategories).where(eq(productCategories.code, 'cleaning')).get()?.id ??
    db.select().from(productCategories).get()?.id
  if (cleaningCategory) {
    const detergent = svc.supply.createProduct(owner, {
      name: 'Çamaşır deterjanı',
      categoryId: cleaningCategory,
      unit: 'kg'
    })
    const prices = [9_000, 9_500, 10_000, 11_000, 12_500]
    for (let d = addDays(start, 3), k = 0; d <= until; d = addDays(d, 45), k++) {
      setTime(at(d, '13:00'))
      const unit = prices[Math.min(k, prices.length - 1)] as number
      svc.expenses.createExpense(owner, {
        date: d,
        sectionId: general,
        amountMinor: multiplyRatio(money(unit, 'TRY'), 10).amountMinor,
        currency: 'TRY',
        description: 'Toptancı',
        items: [{ productId: detergent.id, qtyMilli: 10_000, unitPriceMinor: unit }]
      })
      expenses++
    }
  }

  // Today: a few open things for the demo screens.
  setTime(at(until, '10:00'))
  const issueRoom = rooms[3]
  if (issueRoom) {
    svc.roomIssues.create(owner, { roomId: issueRoom.id, title: 'Duş başlığı damlatıyor', severity: 'low' })
    const fixed = svc.roomIssues.create(owner, {
      roomId: issueRoom.id,
      title: 'Kumanda pili bitmiş',
      severity: 'low'
    })
    svc.roomIssues.resolve(owner, fixed.id, { resolutionNote: 'Pil değişti' })
  }
  svc.lostItems.create(owner, {
    description: 'Siyah şarj aleti',
    locationText: 'Lobi',
    storageLocation: 'Resepsiyon çekmecesi'
  })
  svc.contacts.create(owner, {
    name: 'Demo Taksi',
    category: 'taxi',
    phones: [{ label: 'durak', number: '0216 111 11 11' }],
    favorite: true
  })
  svc.contacts.create(owner, {
    name: 'Demo Tesisatçı',
    category: 'plumber',
    phones: [{ label: 'cep', number: '0532 111 11 11' }]
  })
  svc.shifts.addNote(owner, { kind: 'board', text: 'Yarın 10:00 asansör bakımı var.' })
  svc.tasks.materialize(owner, until, addDays(until, 7))

  return {
    rooms: rooms.length,
    beds: rooms.length * 2,
    reservations,
    payments,
    expenses,
    employees: employees.length,
    users
  }
}
