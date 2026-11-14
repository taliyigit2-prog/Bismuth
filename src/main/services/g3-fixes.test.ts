// Final wave G3: every-N-stays counters, deferred room blocks, Bugün camera card and tourism task, staff dates,
// duplicate names, closed laundry month.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  cameraEvents,
  contacts,
  guests,
  kbsImports,
  laundryItemTypes,
  roomBlocks,
  roomTypes,
  salesChannels,
  taskTemplates
} from '../db/schema'
import { createServices } from './index'
import type { TodaySummaryDto } from '@shared/contract/procedures/today'
import { todayHandlers } from '../api/handlers/today'

const todaySummaryOf = (svc: unknown, ctx: unknown): TodaySummaryDto =>
  (
    todayHandlers(svc as never)['today.summary'] as unknown as (
      c: unknown,
      i: unknown,
      e: unknown
    ) => TodaySummaryDto
  )(ctx, {}, {})

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-15T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(now)
  const svc = createServices(
    handle,
    { name: 'B', version: 't', packaged: false, dataDir: '/tmp/unused', electron: null, chrome: null },
    { clock: depsOf(handle, clock).clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const rooms = ['501', '502'].map((n) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  )
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  let n = 0
  const book = (roomId: string, ci: string, co: string) =>
    svc.reservations.create(reception, {
      guest: { firstName: `G${++n}`, lastName: 'Misafir', phone: `0532 000 00 ${10 + n}` },
      channelId: direct,
      status: 'confirmed',
      stays: [{ roomId, checkIn: ci, checkOut: co, nightlyPriceMinor: 100_000 }]
    } as never)
  return { svc, clock, rooms, book }
}

describe('every-N-stays template', () => {
  it('changing only N keeps the open task and the stay counter', async () => {
    const { svc, clock, rooms, book } = await setup()
    const t = svc.tasks.addTemplate(owner, {
      title: 'Derin temizlik',
      kind: 'maintenance',
      recurrence: { kind: 'everyNStays', n: 2 },
      active: true
    } as never)
    for (const [ci, co] of [
      ['2026-10-15', '2026-10-16'],
      ['2026-10-16', '2026-10-17']
    ] as const) {
      clock.set(`${ci}T10:00:00.000Z`)
      const r = book(rooms[0]!.id, ci, co)
      svc.reservations.checkIn(reception, r.stays[0]!.id)
      clock.set(`${co}T08:00:00.000Z`)
      svc.reservations.checkOut(reception, r.stays[0]!.id)
    }
    const mine = () => svc.tasks.listTasks(owner, { status: ['open'], templateId: t.id } as never)
    expect(mine()).toHaveLength(1)
    svc.tasks.editTemplate(owner, t.id, { recurrence: { kind: 'everyNStays', n: 3 } } as never)
    expect(mine()).toHaveLength(1)
    expect(svc.tasks.listTasks(owner, { status: ['cancelled'], templateId: t.id } as never)).toHaveLength(0)
    const room = svc.tasks
      .stayCounters(reception)
      .find((g) => g.templateId === t.id)!
      .rooms.find((r) => r.roomNumber === '501')!
    expect(room.count).toBe(2)
  })
})

describe('room closed while a guest is in it', () => {
  it('opens its block after check-out so the room cannot be sold again', async () => {
    const { svc, clock, rooms, book } = await setup()
    clock.set('2026-10-15T10:00:00.000Z')
    const r = book(rooms[0]!.id, '2026-10-15', '2026-10-17')
    svc.reservations.checkIn(reception, r.stays[0]!.id)
    svc.roomIssues.create(owner, { roomId: rooms[0]!.id, title: 'Klima bozuk', blocksRoom: true } as never)
    svc.rooms.setHousekeepingStatus(owner, rooms[0]!.id, 'maintenance')
    expect(handle.db.select().from(roomBlocks).where(eq(roomBlocks.roomId, rooms[0]!.id)).all()).toHaveLength(
      0
    )
    clock.set('2026-10-17T08:00:00.000Z')
    svc.reservations.checkOut(reception, r.stays[0]!.id)
    const blocks = handle.db.select().from(roomBlocks).where(eq(roomBlocks.roomId, rooms[0]!.id)).all()
    expect(blocks.length).toBeGreaterThan(0)
    expect(() => book(rooms[0]!.id, '2026-10-18', '2026-10-19')).toThrow()
  })
})

describe('Bugün', () => {
  it('camera card: null while the camera is off; counts recent unseen alarms; problem follows the live sidecar state', async () => {
    const { svc, clock } = await setup()
    const summary = (ctx: unknown) => todaySummaryOf(svc, ctx)
    expect(summary(owner).camera ?? null).toBeNull() // camera.enabled is off by default
    svc.settings.set(owner, { 'camera.enabled': true } as never)
    expect(summary(owner).camera).toEqual({ newAlerts: 0, problem: false })
    const now = new Date('2026-10-15T09:00:00.000Z').toISOString()
    const addEvent = (id: string, at: string) =>
      handle.db
        .insert(cameraEvents)
        .values({ id, kind: 'alarm', occurredAt: at, state: 'new', createdAt: at, updatedAt: at } as never)
        .run()
    addEvent('ev1', now)
    let snap = { state: 'running', crashes: 0 }
    svc.camera.attach({
      snapshot: () => snap,
      bridge: () => null,
      apply: () => Promise.resolve(),
      restart: () => Promise.resolve(),
      stop: () => Promise.resolve()
    } as never)
    expect(summary(owner).camera).toEqual({ newAlerts: 1, problem: false })
    snap = { state: 'gaveUp', crashes: 5 }
    expect(summary(owner).camera).toEqual({ newAlerts: 1, problem: true })
    clock.set('2026-10-30T09:00:00.000Z') // 15 days later: the alarm is past `camera.alertRetentionDays`
    expect(summary(owner).camera).toEqual({ newAlerts: 0, problem: true }) // still gave up: the card stays
    snap = { state: 'running', crashes: 0 }
    expect(summary(owner).camera).toEqual({ newAlerts: 0, problem: false })
    expect(summary(housekeeping).camera ?? null).toBeNull()
  })

  it('retention purge empties the sealed picture and the guest link of an alarm; the row stays', async () => {
    const { svc, rooms, book } = await setup()
    await book(rooms[0]!.id, '2026-10-15', '2026-10-16')
    const guest = handle.db.select().from(guests).get()!
    const old = '2026-10-10T09:00:00.000Z'
    handle.db
      .insert(cameraEvents)
      .values({
        id: 'ev-old',
        kind: 'alarm',
        occurredAt: old,
        state: 'seen',
        guestId: guest.id,
        cropEnc: Buffer.from('sealed'),
        expiresAt: '2026-10-13T09:00:00.000Z',
        createdAt: old,
        updatedAt: old
      } as never)
      .run()
    svc.camera.purge(owner)
    const row = handle.db.select().from(cameraEvents).where(eq(cameraEvents.id, 'ev-old')).get()!
    expect(row.cropEnc).toBeNull()
    expect(row.guestId).toBeNull()
  })

  it('ticking the monthly tourism task marks the table reported and clears the reminder', async () => {
    const { svc } = await setup('2026-11-10T09:00:00.000Z')
    svc.tasks.runSchedule(owner)
    const tpl = handle.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.code, 'legal_tourism_stats'))
      .get()!
    const summary = (ctx: unknown) => todaySummaryOf(svc, ctx)
    expect(summary(owner).reminders).toHaveLength(1)
    const now = '2026-11-10T09:00:00.000Z'
    handle.db
      .insert(kbsImports)
      .values({
        id: 'imp1',
        periodYear: 2026,
        periodMonth: 10,
        fileName: 'f',
        importedAt: now,
        rowCount: 0,
        sameDayCount: 0,
        activeCount: 0,
        createdAt: now,
        updatedAt: now
      } as never)
      .run()
    const task = svc.tasks.listTasks(owner, { templateId: tpl.id } as never)[0]!
    svc.tasks.done(owner, task.id)
    expect(handle.db.select().from(kbsImports).get()!.reportedAt).not.toBeNull()
    expect(summary(owner).reminders).toEqual([])
    svc.tasks.undoDone(owner, task.id)
    expect(handle.db.select().from(kbsImports).get()!.reportedAt).toBeNull()
  })
})

describe('staff dates', () => {
  const salary = { monthlyMinor: 3_000_000, currency: 'TRY' }
  it('rejects an end date before the start date on create and update', async () => {
    const { svc } = await setup()
    expect(() =>
      svc.staff.createEmployee(owner, {
        firstName: 'A',
        lastName: 'B',
        startDate: '2026-05-01',
        endDate: '2026-04-01'
      } as never)
    ).toThrow()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Demir',
      startDate: '2026-01-01',
      salary
    } as never)
    expect(() => svc.staff.updateEmployee(owner, e.id, { endDate: '2025-12-01' } as never)).toThrow()
  })

  it('rejects leave and hours on days outside employment', async () => {
    const { svc } = await setup()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Demir',
      startDate: '2026-01-01',
      endDate: '2026-10-10',
      salary
    } as never)
    expect(() =>
      svc.staff.addLeave(owner, { employeeId: e.id, date: '2025-06-01', kind: 'annual' } as never)
    ).toThrow()
    expect(() =>
      svc.staff.addLeave(owner, { employeeId: e.id, date: '2026-10-20', kind: 'annual' } as never)
    ).toThrow()
    expect(() =>
      svc.staff.recordWork(owner, {
        employeeId: e.id,
        date: '2026-10-20',
        startTime: '09:00',
        endTime: '18:00'
      } as never)
    ).toThrow()
    expect(
      svc.staff.addLeave(owner, { employeeId: e.id, date: '2026-10-05', kind: 'annual' } as never).date
    ).toBe('2026-10-05')
  })

  it("keeps an employee who left during the month on that month's salary table and panel", async () => {
    const { svc } = await setup()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Demir',
      startDate: '2026-01-01',
      salary
    } as never)
    svc.staff.updateEmployee(owner, e.id, { endDate: '2026-10-10', active: false } as never)
    expect(svc.staff.salaryTable(owner, 2026, 10).rows.map((r) => r.employeeId)).toContain(e.id)
    expect(svc.staff.staffPanel(owner, 2026, 10).map((r) => r.employeeId)).toContain(e.id)
    expect(svc.staff.staffPanel(owner, 2026, 11).map((r) => r.employeeId)).not.toContain(e.id)
  })

  it('rejects an advance booked to a month the person was not employed in', async () => {
    const { svc } = await setup()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Demir',
      startDate: '2026-01-01',
      salary
    } as never)
    expect(() =>
      svc.staff.addTransaction(owner, {
        employeeId: e.id,
        date: '2026-10-15',
        kind: 'advance',
        amountMinor: 500_000,
        periodYear: 2020,
        periodMonth: 1
      } as never)
    ).toThrow()
  })

  it('panel shows the carried-over leave like the salary table', async () => {
    const { svc } = await setup()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Demir',
      startDate: '2026-01-01',
      salary
    } as never)
    svc.staff.setPolicy(owner, { values: { leaveDaysPerMonth: 4, leaveCarryOver: true } } as never)
    const sp = svc.staff.salaryPeriod(owner, {
      employeeId: e.id,
      year: 2026,
      month: 10
    } as never) as unknown as { leaveLeft: number }
    const panel = svc.staff.staffPanel(owner, 2026, 10).find((r) => r.employeeId === e.id)!
    expect(panel.leaveLeft).toBe(sp.leaveLeft)
  })
})

describe('duplicate names and closed laundry month', () => {
  it('rejects a second product category, product, laundry item type, status tag and shift with the same name', async () => {
    const { svc } = await setup()
    const cat = svc.supply.listCategories(owner)[0]!
    expect(() => svc.supply.createCategory(owner, cat.name!)).toThrow()
    const p = svc.supply.createProduct(owner, {
      name: 'Su 0,5',
      categoryId: cat.id,
      unit: 'piece',
      trackStock: false
    } as never)
    expect(() =>
      svc.supply.createProduct(owner, {
        name: 'su 0,5',
        categoryId: cat.id,
        unit: 'piece',
        trackStock: false
      } as never)
    ).toThrow()
    expect(p.id).toBeTruthy()
    svc.laundry.createItemType(owner, 'Nevresim X')
    expect(() => svc.laundry.createItemType(owner, 'nevresim x ')).toThrow()
    svc.statusTags.createCustom(owner, { name: 'VIP', color: '#aa0000', priorityOverAuto: false } as never)
    expect(() =>
      svc.statusTags.createCustom(owner, { name: 'vip', color: '#aa0000', priorityOverAuto: false } as never)
    ).toThrow()
    svc.shifts.createShift(owner, { name: 'Ara', startTime: '10:00', endTime: '12:00' } as never)
    expect(() =>
      svc.shifts.createShift(owner, { name: 'ara', startTime: '10:00', endTime: '12:00' } as never)
    ).toThrow()
  })

  it('rejects an incoming slip for a month whose invoice is entered', async () => {
    const { svc } = await setup()
    const lc = svc.contacts.create(owner, { name: 'Camasirci', category: 'laundry' } as never)
    const t0 = handle.db.select().from(laundryItemTypes).all()[0]!.id
    void contacts
    svc.laundry.setPrice(owner, {
      contactId: lc.id,
      itemTypeId: t0,
      validFrom: '2026-01-01',
      unitPriceMinor: 1000
    } as never)
    const slip = (date: string) =>
      svc.laundry.recordDelivery(reception, {
        contactId: lc.id,
        date,
        direction: 'in',
        items: [{ itemTypeId: t0, qty: 10, stainedQty: 0 }]
      } as never)
    const first = slip('2026-10-10')
    svc.laundry.settle(owner, {
      contactId: lc.id,
      year: 2026,
      month: 10,
      invoicedTotalMinor: 10000,
      paid: false
    } as never)
    expect(() => slip('2026-10-12')).toThrow()
    expect(() => svc.laundry.voidDelivery(reception, first.id, 'yanlis')).toThrow()
    expect(slip('2026-11-02').id).toBeTruthy()
  })
})
