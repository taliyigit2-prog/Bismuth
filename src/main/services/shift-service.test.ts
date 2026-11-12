import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  paymentMethods,
  roomIssues,
  roomTypes,
  salesChannels,
  shiftDefinitions
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createOccupantsService } from './occupants-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createShiftService, inShift } from './shift-service'
import { createTasksService } from './tasks-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception', 'u-ayse')
const nightReception = roleCtx('reception', 'u-mehmet')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T10:00:00.000Z') // 13:00 in Istanbul, after the 12:00 check-out time
  const deps = depsOf(handle, clock)
  const shift = createShiftService(deps)
  return { clock, deps, shift }
}

/** 501 in house since yesterday (one person not reported to KBS), 502 arrives today, 503 should have left. */
async function hotelDay() {
  const ctx = await setup()
  const { deps } = ctx
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService(deps)
  const occ = createOccupantsService(deps)
  const pay = createPaymentsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const [r501, r502, r503] = [room('501'), room('502'), room('503')]
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const book = (roomId: string, checkIn: string, checkOut: string, firstName: string) =>
    res.create(owner, {
      guest: { firstName, lastName: 'Misafir' },
      channelId,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
  const a = book(r501!.id, '2026-09-30', '2026-10-03', 'Ali')
  res.checkIn(owner, a.stays[0]!.id)
  const primary = occ.list(owner, a.stays[0]!.id)[0]!
  occ.markKbsReported(owner, primary.id)
  occ.add(owner, a.stays[0]!.id, { fullName: 'Ayşe Misafir', descriptorNote: 'kızıl saçlı' })
  const b = book(r502!.id, '2026-10-01', '2026-10-02', 'Banu')
  const c = book(r503!.id, '2026-09-29', '2026-10-01', 'Cem')
  res.checkIn(owner, c.stays[0]!.id)
  occ.markKbsReported(owner, occ.list(owner, c.stays[0]!.id)[0]!.id)
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  pay.create(owner, {
    reservationId: a.reservation.id,
    date: '2026-10-01',
    methodId: cash,
    amountMinor: 100_000,
    currency: 'TRY'
  })
  createTasksService(deps).createTask(owner, { title: 'Klimayı kontrol et', roomId: r501!.id })
  handle.db
    .insert(roomIssues)
    .values({
      id: 'issue-1',
      roomId: r502!.id,
      title: 'Tuvalet kapağı kırık',
      severity: 'medium',
      status: 'open',
      reportedAt: '2026-10-01T08:00:00.000Z',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z'
    })
    .run()
  return { ...ctx, a, b, c }
}

describe('vardiya devri özeti (§6.16, G-95)', () => {
  it('gelmemiş giriş, çıkması gereken oda, KBS eksiği, bakiye, açık görev ve arıza, kasa — elle yazılmadan', async () => {
    const { shift, a, b, c } = await hotelDay()
    const s = shift.handoverSummary(reception)
    expect(s.businessDate).toBe('2026-10-01')
    expect(s.arrivalsPending?.map((x) => [x.roomNumber, x.reservationId])).toEqual([
      ['502', b.reservation.id]
    ])
    expect(s.overdueCheckouts?.map((x) => [x.roomNumber, x.reservationId])).toEqual([
      ['503', c.reservation.id]
    ])
    expect(s.inHouse).toEqual({ rooms: 2, people: 3 })
    expect(s.kbsMissing?.map((k) => [k.roomNumber, k.fullName, k.kind])).toEqual([
      ['501', 'Ayşe Misafir', 'checkin']
    ])
    // 501: 3 nights × 1.000 − 1.000 paid; 503: 2 nights unpaid.
    expect(s.unpaid?.map((u) => [u.roomNumbers.join(','), u.balanceMinor]).sort()).toEqual([
      ['501', 200_000],
      ['503', 200_000]
    ])
    expect(s.unpaid?.find((u) => u.reservationId === a.reservation.id)?.guestName).toBe('Ali Misafir')
    expect(s.openTasks?.map((t) => t.title)).toEqual(['Klimayı kontrol et'])
    expect(s.openIssues?.map((i) => [i.roomNumber, i.title])).toEqual([['502', 'Tuvalet kapağı kırık']])
    expect(s.cash?.pending).toEqual({ TRY: { cash: 100_000 } })
  })

  it('özetin her parçası okuyanın yetkisine uyar; yetkisiz parça boş değil "yok" (null) döner', async () => {
    const { shift } = await hotelDay()
    const onlyNotes = ctxFromPermissions('u-x', 'd', 'ipc', { shift_notes: 'view' })
    expect(shift.handoverSummary(onlyNotes)).toMatchObject({
      arrivalsPending: null,
      overdueCheckouts: null,
      inHouse: null,
      kbsMissing: null,
      unpaid: null,
      openTasks: null,
      openIssues: null,
      cash: null
    })
    expect(() => shift.handoverSummary(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
    expect(() => shift.handoverSummary(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
  })

  it('devir yazılınca özet anlık görüntü olarak saklanır; gelen vardiya okudum der, yazan diyemez', async () => {
    const { shift, clock } = await hotelDay()
    const shifts = handle.db.select().from(shiftDefinitions).all()
    const day = shifts.find((s) => s.code === 'day')!
    const night = shifts.find((s) => s.code === 'night')!
    clock.set('2026-10-01T17:55:00.000Z') // 20:55
    const h = shift.saveHandover(reception, {
      fromShiftId: day.id,
      toShiftId: night.id,
      text: '503 hâlâ çıkmadı'
    })
    expect(h.summary.overdueCheckouts?.map((x) => x.roomNumber)).toEqual(['503'])
    expect(h).toMatchObject({ writtenBy: 'u-ayse', businessDate: '2026-10-01', text: '503 hâlâ çıkmadı' })
    expect(shift.unreadHandovers(reception)).toEqual([])
    expect(shift.unreadHandovers(nightReception).map((x) => x.id)).toEqual([h.id])
    expect(() => shift.acknowledge(reception, h.id)).toThrow(/errors.ownHandover/)
    clock.set('2026-10-01T18:05:00.000Z')
    const read = shift.acknowledge(nightReception, h.id)
    expect(read).toMatchObject({ acknowledgedBy: 'u-mehmet', acknowledgedAt: '2026-10-01T18:05:00.000Z' })
    expect(shift.acknowledge(owner, h.id).acknowledgedBy).toBe('u-mehmet') // once
    expect(shift.unreadHandovers(nightReception)).toEqual([])
    expect(shift.listHandovers(owner, '2026-10-01', '2026-10-01')).toHaveLength(1)
    expect(() => shift.saveHandover(roleCtx('housekeeping'), { text: 'x' })).toThrow(/PERMISSION_DENIED/)
  })

  it('kaydedilmiş devir okuyanın yetkisiyle süzülür: kasa ve bakiye yetkisi olmayana gitmez', async () => {
    const { shift } = await hotelDay()
    const h = shift.saveHandover(owner, { text: 'Kasa sayıldı' })
    expect(h.summary.cash).not.toBeNull()
    expect(h.summary.unpaid).not.toBeNull()
    const onlyNotes = ctxFromPermissions('u-x', 'd', 'ipc', { shift_notes: 'view' })
    const [seen] = shift.listHandovers(onlyNotes, '2026-10-01', '2026-10-01')
    expect(seen?.text).toBe('Kasa sayıldı')
    expect(seen?.summary).toMatchObject({
      arrivalsPending: null,
      overdueCheckouts: null,
      inHouse: null,
      kbsMissing: null,
      unpaid: null,
      openTasks: null,
      openIssues: null,
      cash: null
    })
    expect(shift.unreadHandovers(onlyNotes)[0]?.summary.cash).toBeNull()
    expect(shift.acknowledge(onlyNotes, h.id).summary.unpaid).toBeNull()
    // Reception sees the drawer (cash view) and the balances (payments).
    expect(shift.listHandovers(reception, '2026-10-01', '2026-10-01')[0]?.summary.cash).not.toBeNull()
  })
})

describe('notlar (G-95 b, c)', () => {
  it('kişisel not yalnız yazana döner — Sahip dahil kimse göremez; metni denetim kaydına da girmez', async () => {
    const { shift } = await setup()
    const mine = shift.addNote(reception, {
      kind: 'personal',
      text: 'Banka şifresini değiştir',
      remindAt: '2026-10-01T12:30'
    })
    const board = shift.addNote(reception, { kind: 'board', text: 'Asansör bakımı yarın 10:00' })
    expect(
      shift
        .listNotes(reception)
        .map((n) => n.id)
        .sort()
    ).toEqual([mine.id, board.id].sort())
    const otherOwner = roleCtx('owner', 'u-sahip')
    expect(shift.listNotes(otherOwner).map((n) => n.id)).toEqual([board.id])
    expect(shift.listNotes(nightReception).map((n) => n.id)).toEqual([board.id])
    expect(() => shift.updateNote(otherOwner, mine.id, { text: 'x' })).toThrow(/NOT_FOUND/)
    expect(() => shift.setNoteState(otherOwner, mine.id, { done: true })).toThrow(/NOT_FOUND/)
    const logged = handle.db.select().from(auditLog).where(eq(auditLog.entityId, mine.id)).all()
    expect(logged).toHaveLength(1)
    expect(JSON.stringify(logged)).not.toContain('Banka')
    expect(shift.dueReminders(reception).map((n) => n.id)).toEqual([mine.id])
    expect(shift.dueReminders(otherOwner)).toEqual([])
  })

  it('pano notu vardiya notu yetkisi ister; tamamlanan ve arşivlenen not listeden düşer', async () => {
    const { shift } = await setup()
    expect(() => shift.addNote(roleCtx('housekeeping'), { kind: 'board', text: 'x' })).toThrow(
      /PERMISSION_DENIED/
    )
    // Housekeeping has no shift notes, but personal notes are independent of the permission matrix.
    const own = shift.addNote(roleCtx('housekeeping', 'u-temiz'), { kind: 'personal', text: 'Deterjan iste' })
    expect(shift.listNotes(roleCtx('housekeeping', 'u-temiz')).map((n) => n.id)).toEqual([own.id])
    const n = shift.addNote(owner, { kind: 'board', text: 'Kahvaltı 07:30', pinned: true })
    expect(shift.updateNote(reception, n.id, { text: 'Kahvaltı 08:00' }).text).toBe('Kahvaltı 08:00')
    shift.setNoteState(reception, n.id, { done: true })
    expect(shift.listNotes(reception)).toEqual([])
    expect(shift.listNotes(reception, { includeDone: true }).map((x) => x.id)).toEqual([n.id])
    shift.setNoteState(reception, n.id, { done: false, archived: true })
    expect(shift.listNotes(reception, { includeDone: true })).toEqual([])
    expect(() => shift.listNotes({ ...owner, userId: null, can: () => false })).toThrow(/PERMISSION_DENIED/)
  })
})

describe('vardiya tanımları (ayar)', () => {
  it('gece vardiyası gece yarısını aşar; şu anki vardiya saate göre bulunur; ad değişince çeviri bırakılır', async () => {
    const { shift, clock } = await setup()
    expect(inShift({ startTime: '21:00', endTime: '09:00' }, '23:30')).toBe(true)
    expect(inShift({ startTime: '21:00', endTime: '09:00' }, '08:59')).toBe(true)
    expect(inShift({ startTime: '21:00', endTime: '09:00' }, '09:00')).toBe(false)
    expect(inShift({ startTime: '09:00', endTime: '21:00' }, '09:00')).toBe(true)
    expect(shift.currentShift(reception)?.code).toBe('day')
    clock.set('2026-10-01T19:00:00.000Z') // 22:00
    const night = shift.currentShift(reception)!
    expect(night.code).toBe('night')
    expect(night.displayName?.tr).toBe('Gece')
    const renamed = shift.updateShift(owner, night.id, { name: 'Gece resepsiyonu' })
    expect(renamed).toMatchObject({ name: 'Gece resepsiyonu', nameI18n: null, displayName: null })
    expect(() => shift.updateShift(reception, night.id, { name: 'x' })).toThrow(/PERMISSION_DENIED/)
    const extra = shift.createShift(owner, { name: 'Ara', startTime: '12:00', endTime: '16:00', sort: 5 })
    expect(shift.listShifts(reception).map((s) => s.id)).toContain(extra.id)
    shift.updateShift(owner, extra.id, { active: false })
    expect(shift.listShifts(reception).map((s) => s.id)).not.toContain(extra.id)
    expect(shift.listShifts(owner, { includeInactive: true })).toHaveLength(3)
  })
})
