import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { expenseSections, paymentMethods, roomTypes, salesChannels } from '../../db/schema'
import { createServices } from '..'
import { revenueBase } from '../revenue-base'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const accountant = roleCtx('accountant')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const OCTOBER = { from: '2026-10-01', to: '2026-11-01' }

let handle: DatabaseHandle
afterEach(() => handle?.close())

/**
 * Three rooms and the Excel October (02-excel-analizi §1.1): card 26.300 (10 nights × 2.630), IBAN 1.000 through
 * Airbnb (1 night), cash 10.000 taken by the owner (4 nights × 2.500) → 37.300.
 */
async function hotel() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const s = createServices(handle, runtime, { clock })
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const rooms = ['101', '102', '103'].map((number) =>
    s.rooms.createRoom(owner, { number, roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
  )
  const book = (room: number, checkIn: string, checkOut: string, price: number, channel = 'direct') =>
    s.reservations.create(owner, {
      guest: { firstName: 'Örnek', lastName: `Misafir ${room}` },
      channelId: code(salesChannels, channel),
      stays: [
        {
          roomId: rooms[room]!.id,
          checkIn,
          checkOut,
          nightlyPriceMinor: price,
          ...(checkIn === checkOut ? { startTime: '10:00', endTime: '11:00' } : {})
        }
      ]
    }).reservation.id
  const pay = (reservationId: string, amountMinor: number, method: string, date: string, channel?: string) =>
    s.payments.create(owner, {
      reservationId,
      date,
      methodId: code(paymentMethods, method),
      amountMinor,
      currency: 'TRY',
      kind: 'payment',
      ...(channel ? { channelId: code(salesChannels, channel) } : {})
    })
  return { s, clock, code, rooms, book, pay }
}

async function october() {
  const h = await hotel()
  const r1 = h.book(0, '2026-10-02', '2026-10-12', 263_000)
  h.pay(r1, 2_630_000, 'card', '2026-10-02')
  const r2 = h.book(1, '2026-10-15', '2026-10-16', 100_000, 'airbnb')
  h.pay(r2, 100_000, 'bank', '2026-10-15', 'airbnb')
  const r3 = h.book(2, '2026-10-20', '2026-10-24', 250_000)
  const cash = h.pay(r3, 1_000_000, 'cash', '2026-10-20')
  h.s.payments.handover(owner, { paymentIds: [cash.id] })
  return h
}

describe('aylık ciro tek kaynaktan (§6.10 tutarlılık testi; kabul ölçütü)', () => {
  it('Ekim cirosu 37.300: rapor = defter toplamı = takvimden türetilen ödenmiş geceler', async () => {
    const { s } = await october()
    const report = s.reports.monthly(owner, OCTOBER)
    const ledger = s.ledger.monthSummary(owner, 2026, 10)
    const grid = s.calendar.grid(owner, OCTOBER)
    const paidNights = grid.stays
      .flatMap((st) => st.nights)
      .filter((n) => n.pay === 'paid')
      .reduce((sum, n) => sum + n.priceMinor, 0)
    expect(report.revenueMinor).toBe(3_730_000)
    expect(ledger.revenueBaseMinor).toBe(3_730_000)
    expect(paidNights).toBe(3_730_000)
    expect(s.reports.summary(owner, OCTOBER).finance?.revenueMinor).toBe(3_730_000)
    expect(s.reports.yearly(owner, { years: [2026] }).years[0]!.months[9]!.revenueMinor).toBe(3_730_000)
  })

  it('gelir detayı yöntem × para birimi, kanal dağılımı ciroya ikinci kez eklenmez', async () => {
    const { s } = await october()
    const r = s.reports.monthly(owner, OCTOBER)
    expect(r.income).toEqual(
      expect.arrayContaining([
        { methodGroup: 'card', currency: 'TRY', amountMinor: 2_630_000, baseMinor: 2_630_000 },
        { methodGroup: 'bank', currency: 'TRY', amountMinor: 100_000, baseMinor: 100_000 },
        { methodGroup: 'cash', currency: 'TRY', amountMinor: 1_000_000, baseMinor: 1_000_000 }
      ])
    )
    expect(Object.fromEntries(r.channels.map((c) => [c.code, c.baseMinor]))).toEqual({
      direct: 3_630_000,
      airbnb: 100_000
    })
    expect(r.channels.reduce((sum, c) => sum + c.baseMinor, 0)).toBe(r.revenueMinor)
    expect(r.daily.find((d) => d.date === '2026-10-02')).toMatchObject({
      revenueMinor: 2_630_000,
      byMethod: { card: 2_630_000 }
    })
  })

  it('ay sonu: kart ve IBAN bekleyen, nakit teslim alındı; ciro, gider, kâr ve önceki ay', async () => {
    const { s, code } = await october()
    s.expenses.createExpense(owner, {
      date: '2026-10-05',
      sectionId: code(expenseSections, 'general'),
      amountMinor: 50_000,
      currency: 'TRY',
      description: 'Deterjan'
    })
    const m = s.reports.monthEnd(owner, { year: 2026, month: 10 })
    expect(m.methods).toEqual([
      { group: 'card', totalMinor: 2_630_000, receivedMinor: 0, pendingMinor: 2_630_000, pendingRows: 1 },
      { group: 'bank', totalMinor: 100_000, receivedMinor: 0, pendingMinor: 100_000, pendingRows: 1 },
      { group: 'cash', totalMinor: 1_000_000, receivedMinor: 1_000_000, pendingMinor: 0, pendingRows: 0 }
    ])
    expect(m.bankByChannel.map((b) => [b.code, b.baseMinor])).toEqual([['airbnb', 100_000]])
    expect(m).toMatchObject({ revenueMinor: 3_730_000, expensesMinor: 50_000, profitMinor: 3_680_000 })
    expect(m.previous).toEqual({ revenueMinor: 0, expensesMinor: 0, profitMinor: 0 })
    expect(m.topExpenses[0]).toMatchObject({ kind: 'description', label: 'Deterjan', totalMinor: 50_000 })
    expect(m.salaries).toEqual({ rows: [], withoutSalary: 0 })
    expect(m.tourism).toMatchObject({ imported: false, reportedAt: null, due: '2026-11-10' })
    // The manager sees the month without salaries (no staff.salary) and without the owner's section.
    const forManager = s.reports.monthEnd(manager, { year: 2026, month: 10 })
    expect(forManager.salaries).toBeNull()
    expect(forManager.partial).toBe(true)
  })
})

describe('doluluk (§6.10; kabul ölçütü: satılmaz blok paydadan düşer, aynı gün giriş‑çıkış ayarı)', () => {
  it('3 oda × 31 gün − 4 gün satılmaz = 89 satılabilir gece; 15 satılan gece', async () => {
    const h = await october()
    h.s.rooms.createBlock(owner, {
      roomId: h.rooms[2]!.id,
      dateFrom: '2026-10-28',
      dateTo: '2026-11-03',
      kind: 'oos',
      reason: 'Boya'
    })
    const sum = h.s.reports.summary(owner, OCTOBER)
    expect(sum.occupancy).toMatchObject({ soldNights: 15, sellableNights: 89, dayUseNights: 0 })
    expect(sum.occupancy.occupancyBp).toBe(1685)
    // ADR = room revenue ÷ sold nights; RevPAR = room revenue ÷ sellable nights.
    expect(sum.finance).toMatchObject({ roomRevenueMinor: 3_730_000, adrMinor: 248_667, revparMinor: 41_910 })
    expect(sum.occupancy).toMatchObject({ stays: 3, alosHundredths: 500 })
  })

  it('aynı gün ve saatlik satışlar her zaman dolulukta sayılır; aynı oda-gün bir kez, satış sayısı ayrı', async () => {
    const h = await october()
    const day = h.book(1, '2026-10-25', '2026-10-25', 150_000)
    h.pay(day, 150_000, 'cash', '2026-10-25')
    const first = h.s.reports.summary(owner, OCTOBER).occupancy
    expect(first).toMatchObject({ soldNights: 16, dayUseNights: 1, sellableNights: 93, dayUseIncluded: true })
    expect(first.occupancyBp).toBe(1720)
    // Two hourly sales of one room and day: two sales, one sold room-day.
    const hourly = (startTime: string, endTime: string) =>
      h.s.reservations.create(owner, {
        guest: { firstName: 'Saatlik', lastName: 'Misafir' },
        channelId: h.code(salesChannels, 'direct'),
        stays: [
          {
            roomId: h.rooms[0]!.id,
            checkIn: '2026-10-26',
            checkOut: '2026-10-26',
            startTime,
            endTime,
            nightlyPriceMinor: 90_000
          }
        ]
      })
    hourly('09:00', '12:00')
    hourly('13:00', '16:00')
    const all = h.s.reports.summary(owner, OCTOBER).occupancy
    expect(all).toMatchObject({ soldNights: 17, dayUseNights: 3 })
    expect(h.s.reports.context(owner).dayUseIncluded).toBe(true)
    expect(h.s.reports.occupancy(owner, OCTOBER).months[0]).toMatchObject({ dayUseNights: 3 })
  })

  it('sabah saatlik + akşam gece aynı oda-günü bir kez sayar; ADR yalnız gecelik gelir, saatlik gelir ayrı', async () => {
    const h = await hotel()
    h.book(0, '2026-10-10', '2026-10-11', 200_000)
    h.s.reservations.create(owner, {
      guest: { firstName: 'Saatlik', lastName: 'Misafir' },
      channelId: h.code(salesChannels, 'direct'),
      stays: [
        {
          roomId: h.rooms[0]!.id,
          checkIn: '2026-10-10',
          checkOut: '2026-10-10',
          startTime: '09:00',
          endTime: '12:00',
          nightlyPriceMinor: 90_000
        }
      ]
    })
    const sum = h.s.reports.summary(owner, OCTOBER)
    // One room, one day: a night and a morning sale fill it once (never above 100%); the sale itself still counts.
    expect(sum.occupancy).toMatchObject({ soldNights: 1, dayUseNights: 1, sellableNights: 93 })
    expect(h.s.reports.occupancy(owner, OCTOBER).months[0]).toMatchObject({ soldNights: 1, dayUseNights: 1 })
    expect(h.s.reports.occupancy(owner, OCTOBER).rooms.find((r) => r.number === '101')).toMatchObject({
      soldNights: 1
    })
    expect(sum.finance).toMatchObject({
      roomRevenueMinor: 290_000,
      adrMinor: 200_000,
      hourlyRevenueMinor: 90_000
    })
    // A day with only the sale (no night) is still a sold room-day.
    h.s.reservations.create(owner, {
      guest: { firstName: 'Saatlik', lastName: 'İki' },
      channelId: h.code(salesChannels, 'direct'),
      stays: [
        {
          roomId: h.rooms[1]!.id,
          checkIn: '2026-10-10',
          checkOut: '2026-10-10',
          startTime: '09:00',
          endTime: '12:00',
          nightlyPriceMinor: 90_000
        }
      ]
    })
    expect(h.s.reports.summary(owner, OCTOBER).occupancy).toMatchObject({ soldNights: 2, dayUseNights: 2 })
  })

  it('konaklama türü süzgeci: gecelik yalnız geceleri, saatlik yalnız gündüz yuvalarını ve gelirini sayar', async () => {
    const h = await october()
    const day = h.book(1, '2026-10-25', '2026-10-25', 150_000)
    h.pay(day, 150_000, 'cash', '2026-10-25')
    h.s.reservations.create(owner, {
      guest: { firstName: 'Saatlik', lastName: 'Misafir' },
      channelId: h.code(salesChannels, 'direct'),
      stays: [
        {
          roomId: h.rooms[0]!.id,
          checkIn: '2026-10-26',
          checkOut: '2026-10-26',
          startTime: '09:00',
          endTime: '12:00',
          nightlyPriceMinor: 90_000
        }
      ]
    })
    const kind = (stayKind: 'all' | 'overnight' | 'hourly') =>
      h.s.reports.summary(owner, { ...OCTOBER, stayKind })
    expect(kind('overnight').occupancy).toMatchObject({ soldNights: 15, dayUseNights: 0, sellableNights: 93 })
    expect(kind('overnight').finance?.roomRevenueMinor).toBe(3_730_000)
    expect(kind('hourly').occupancy).toMatchObject({ soldNights: 2, dayUseNights: 2, sellableNights: 93 })
    expect(kind('hourly').finance?.roomRevenueMinor).toBe(240_000)
    expect(kind('all').finance?.roomRevenueMinor).toBe(3_970_000)
    expect(h.s.reports.occupancy(owner, { ...OCTOBER, stayKind: 'hourly' }).months[0]).toMatchObject({
      soldNights: 2,
      dayUseNights: 2
    })
    expect(() => h.s.reports.summary(owner, { ...OCTOBER, stayKind: 'weekly' })).toThrow()
  })

  it('kapasite geçmişi: satıştan kaldırılan oda o günden sonra paydaya girmez', async () => {
    const h = await hotel()
    h.s.rooms.updateRoom(owner, h.rooms[0]!.id, { sellable: false, validFrom: '2026-10-11' })
    const occ = h.s.reports.occupancy(owner, OCTOBER)
    expect(occ.months).toEqual([
      { month: '2026-10', soldNights: 0, dayUseNights: 0, sellableNights: 31 * 2 + 10 }
    ])
    expect(occ.rooms.find((r) => r.number === '101')?.sellableNights).toBe(10)
  })

  it('ısı haritası, oda/oda tipi geliri ve tekrar gelen misafir', async () => {
    const h = await october()
    const occ = h.s.reports.occupancy(owner, OCTOBER)
    // 2026-10-03 is a Saturday: room 101 sold it.
    const saturday = occ.heatmap.find((c) => c.month === '2026-10' && c.weekday === 6)
    expect(saturday).toMatchObject({ sellableNights: 3 * 5 })
    expect(saturday!.soldNights).toBeGreaterThanOrEqual(2)
    expect(occ.rooms.map((r) => [r.number, r.soldNights, r.revenueMinor])).toEqual([
      ['101', 10, 2_630_000],
      ['102', 1, 100_000],
      ['103', 4, 1_000_000]
    ])
    expect(occ.roomTypes).toHaveLength(1)
    expect(occ.roomTypes[0]).toMatchObject({ soldNights: 15, sellableNights: 93, revenueMinor: 3_730_000 })
    expect(occ.guests).toEqual({ total: 3, repeat: 0, repeatBp: 0 })
    expect(occ.topGuests?.[0]).toMatchObject({ name: 'Örnek Misafir 0', revenueMinor: 2_630_000 })
    // Without reports.finance the room revenue is not sent at all.
    const ops = h.s.reports.occupancy(
      { ...accountant, can: (k, l) => k !== 'reports.finance' && accountant.can(k, l) },
      OCTOBER
    )
    expect(ops.rooms.every((r) => r.revenueMinor === null)).toBe(true)
    expect(ops.topGuests).toBeNull()
  })

  it('oda geliri personel komisyon tabanıyla aynı rakamdır (revenue-base)', async () => {
    const h = await october()
    const occ = h.s.reports.occupancy(owner, OCTOBER)
    const total = occ.rooms.reduce((s, r) => s + (r.revenueMinor ?? 0), 0)
    expect(total).toBe(revenueBase(handle.db, { base: 'room_revenue_all', ...OCTOBER, currency: 'TRY' }))
  })
})

describe('kasa, gider ve personel raporları', () => {
  it("kasa raporu: yöntem toplamları, teslim alma geçmişi, x'lenmemiş kart/IBAN, bekleyen yaş", async () => {
    const h = await october()
    h.clock.set('2026-11-20T09:00:00.000Z')
    const c = h.s.reports.cash(owner, OCTOBER)
    expect(c.methods.map((m) => [m.code, m.baseMinor, m.pendingMinor])).toEqual([
      ['card', 2_630_000, 2_630_000],
      ['cash', 1_000_000, 0],
      ['bank', 100_000, 100_000]
    ])
    expect(c.handovers).toHaveLength(1)
    expect(c.handovers[0]).toMatchObject({
      paymentCount: 1,
      totals: [{ currency: 'TRY', amountMinor: 1_000_000 }]
    })
    expect(c.unchecked.map((u) => u.amountMinor)).toEqual([100_000, 2_630_000])
    expect(c.uncheckedTotal).toBe(2)
    // Reference day: the period's last day (31 Oct): 2 Oct is 29 days old, 15 Oct 16 days.
    expect(c.aging.find((a) => a.bucket === 'd8_30')).toEqual({
      bucket: 'd8_30',
      baseMinor: 2_730_000,
      rows: 2
    })
    expect(c.drawer).toEqual([])
  })

  it('gider raporu: personel maliyeti oranı (personel gideri ÷ ciro) ve aylık eğilim', async () => {
    const h = await october()
    const general = h.code(expenseSections, 'general')
    const emp = h.s.staff.createEmployee(owner, {
      firstName: 'Deniz',
      lastName: 'Yıldız',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 4_000_000, currency: 'TRY', validFrom: '2026-01-01' }
    })
    h.s.staff.addTransaction(owner, {
      employeeId: emp.id,
      date: '2026-10-05',
      kind: 'advance',
      amountMinor: 373_000,
      currency: 'TRY',
      periodYear: 2026,
      periodMonth: 10
    })
    h.s.expenses.createExpense(owner, {
      date: '2026-10-06',
      sectionId: general,
      amountMinor: 27_000,
      currency: 'TRY',
      description: 'Çamaşır suyu'
    })
    const e = h.s.reports.expenses(owner, OCTOBER)
    expect(e).toMatchObject({
      totalMinor: 400_000,
      staffMinor: 373_000,
      revenueMinor: 3_730_000,
      laborRatioBp: 1000
    })
    expect(e.months).toEqual([{ month: '2026-10', totalMinor: 400_000, staffMinor: 373_000 }])
    expect(e.topExpenses[0]).toMatchObject({ kind: 'staff', totalMinor: 373_000 })
    const st = h.s.reports.staff(owner, { year: 2026 })
    expect(st.employees).toEqual([
      expect.objectContaining({ name: 'Deniz Yıldız', costMinor: 373_000, byKind: { advance: 373_000 } })
    ])
    expect(st.months[9]).toEqual({ month: 10, costMinor: 373_000 })
    expect(st.laborRatioBp).toBe(1000)
  })
})

describe('yetki (G-105): resepsiyon para raporlarını göremez', () => {
  it('resepsiyonun doğrudan çağrısı serviste reddedilir', async () => {
    const { s } = await hotel()
    const reception = roleCtx('reception')
    for (const run of [
      () => s.reports.monthly(reception, OCTOBER),
      () => s.reports.summary(reception, OCTOBER),
      () => s.reports.monthEnd(reception, { year: 2026, month: 10 }),
      () => s.reports.expenses(reception, OCTOBER)
    ])
      expect(run).toThrow(/PERMISSION_DENIED/)
  })
})
