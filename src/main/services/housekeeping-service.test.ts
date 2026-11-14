import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { localDate } from '@shared/date'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, roles, roomBlocks, rooms, roomTypes, salesChannels, users } from '../db/schema'
import { ctxFromPermissions } from './context'
import { createHousekeepingService } from './housekeeping-service'
import { inTransaction } from './kit'
import { createReservationsService } from './reservations-service'
import { createRoomIssuesService } from './room-issues-service'
import { createRoomsService, markRoomDirtyAfterCheckout } from './rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping', 'user-hk')
const accountant = roleCtx('accountant')
const employee = roleCtx('employee')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-04T07:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string, floor = '5') =>
    roomsSvc.createRoom(owner, {
      number: n,
      floor,
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
  const r501 = room('501')
  const r502 = room('502')
  const r301 = room('301', '3')
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const res = createReservationsService(deps)
  const book = (roomId: string, checkIn: string, checkOut: string, lastName = 'Misafir') =>
    res.create(reception, {
      guest: { firstName: 'Örnek', lastName, phone: '0532 000 00 00' },
      channelId: direct,
      stays: [
        {
          roomId,
          checkIn,
          checkOut,
          nightlyPriceMinor: 200_000,
          ...(checkIn === checkOut ? { startTime: '10:00', endTime: '11:00' } : {})
        }
      ]
    })
  return {
    clock,
    deps,
    roomsSvc,
    res,
    book,
    r501,
    r502,
    r301,
    hk: createHousekeepingService(deps),
    issues: createRoomIssuesService(deps)
  }
}

const blocksOf = (roomId: string) =>
  handle.db.select().from(roomBlocks).where(eq(roomBlocks.roomId, roomId)).all()

describe('oda durumu (G-90)', () => {
  it('tek tıkla durum değişir; kim ve ne zaman yazılır; not durumla birlikte değişir', async () => {
    const { roomsSvc, r501, clock, hk } = await setup()
    handle.db
      .insert(users)
      .values({
        id: 'user-hk',
        username: 'ayse',
        displayName: 'Ayşe Kaya',
        roleId: handle.db.select().from(roles).where(eq(roles.code, 'housekeeping')).get()!.id,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
    const dirty = roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'dirty', 'Çarşaf eksik')
    expect(dirty).toMatchObject({ hkStatus: 'dirty', hkNote: 'Çarşaf eksik', hkStatusBy: 'user-hk' })
    expect(dirty.hkStatusAt).toBe('2026-10-04T07:00:00.000Z')
    clock.advance(45)
    const clean = roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'clean')
    expect(clean).toMatchObject({ hkStatus: 'clean', hkNote: null, hkStatusAt: '2026-10-04T07:45:00.000Z' })
    expect(roomsSvc.setHousekeepingNote(housekeeping, r501.id, '  Minibar eksik ').hkNote).toBe(
      'Minibar eksik'
    )
    expect(roomsSvc.setHousekeepingNote(housekeeping, r501.id, '').hkNote).toBeNull()
    const row = hk.board(reception).rooms.find((r) => r.id === r501.id)!
    expect(row).toMatchObject({ hk: 'clean', hkByName: 'Ayşe Kaya', hkAt: '2026-10-04T07:45:00.000Z' })
    const changes = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'room'), eq(auditLog.entityId, r501.id)))
      .all()
    expect(changes.length).toBeGreaterThanOrEqual(4)
    expect(() => roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'sparkly')).toThrow(/VALIDATION/)
  })

  it('bakımda / kullanım dışı takvimde blok açar; tür değişince blok da değişir; temiz olunca blok o gün biter', async () => {
    const { roomsSvc, r501, clock } = await setup()
    const m = roomsSvc.setHousekeepingStatus(reception, r501.id, 'maintenance', 'Klima değişiyor')
    expect(m.block).toMatchObject({
      kind: 'oos',
      dateFrom: '2026-10-04',
      dateTo: '2027-10-04',
      reason: 'Klima değişiyor',
      source: 'hk_status'
    })
    const ooo = roomsSvc.setHousekeepingStatus(reception, r501.id, 'out_of_order')
    expect(ooo.block).toMatchObject({ id: m.block!.id, kind: 'ooo' })
    expect(blocksOf(r501.id)).toHaveLength(1)
    clock.set('2026-10-06T08:00:00.000Z')
    const back = roomsSvc.setHousekeepingStatus(reception, r501.id, 'dirty')
    expect(back.block).toBeNull()
    // Past days stay blocked (occupancy history); the room is for sale again from today.
    expect(blocksOf(r501.id)[0]).toMatchObject({
      dateFrom: '2026-10-04',
      dateTo: '2026-10-06',
      cancelledAt: null
    })
    expect(roomsSvc.listBlocks(reception, localDate('2026-10-06'), localDate('2026-10-30'))).toHaveLength(0)
  })

  it('aynı gün geri alınan bakım bloğu iptal edilir; satılmış gecesi olan odaya blok konmaz', async () => {
    const { roomsSvc, r501, r502, book } = await setup()
    roomsSvc.setHousekeepingStatus(reception, r501.id, 'maintenance')
    roomsSvc.setHousekeepingStatus(reception, r501.id, 'clean')
    expect(blocksOf(r501.id)[0]?.cancelledAt).not.toBeNull()
    book(r502.id, '2026-10-04', '2026-10-06')
    const sold = roomsSvc.setHousekeepingStatus(reception, r502.id, 'out_of_order')
    expect(sold.hkStatus).toBe('out_of_order')
    expect(sold.block).toBeNull()
  })

  it('temizlik rolü temiz/kirli/kontrol edildi yapar; bakıma alma ve geri alma blok yetkisi ister', async () => {
    const { roomsSvc, r501 } = await setup()
    expect(roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'inspected').hkStatus).toBe('inspected')
    expect(() => roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'maintenance')).toThrow(
      /PERMISSION_DENIED/
    )
    roomsSvc.setHousekeepingStatus(reception, r501.id, 'maintenance')
    expect(() => roomsSvc.setHousekeepingStatus(housekeeping, r501.id, 'clean')).toThrow(/PERMISSION_DENIED/)
    expect(() => roomsSvc.setHousekeepingStatus(accountant, r501.id, 'clean')).toThrow(/PERMISSION_DENIED/)
  })
})

describe('çıkışta otomatik kirli (S-14)', () => {
  it('çıkış işlenince oda kirli olur; aynı gün giriş‑çıkışta da', async () => {
    const { res, book, r501, r502, roomsSvc, clock } = await setup()
    roomsSvc.setHousekeepingStatus(reception, r501.id, 'inspected')
    clock.set('2026-10-02T09:00:00.000Z')
    const r = book(r501.id, '2026-10-02', '2026-10-04')
    res.checkIn(reception, r.stays[0]!.id)
    clock.set('2026-10-04T09:30:00.000Z')
    res.checkOut(reception, r.stays[0]!.id)
    expect(roomsSvc.getRoom(reception, r501.id).hkStatus).toBe('dirty')
    const dayUse = book(r502.id, '2026-10-04', '2026-10-04')
    res.checkIn(reception, dayUse.stays[0]!.id)
    clock.set('2026-10-04T15:00:00.000Z')
    res.checkOut(reception, dayUse.stays[0]!.id)
    expect(roomsSvc.getRoom(reception, r502.id).hkStatus).toBe('dirty')
  })

  it('çıkış olayı: kirli yapar, notu siler, denetim kaydına "check_out" yazar; bakımdaki oda bakımda kalır', async () => {
    const { deps, roomsSvc, r501, r502 } = await setup()
    roomsSvc.setHousekeepingStatus(reception, r501.id, 'clean', 'Kontrol edildi')
    roomsSvc.setHousekeepingStatus(reception, r502.id, 'maintenance')
    const [a, b] = inTransaction(deps, reception, (tx, audit, now) => [
      markRoomDirtyAfterCheckout(tx, audit, reception, r501.id, now),
      markRoomDirtyAfterCheckout(tx, audit, reception, r502.id, now)
    ])
    expect(a).toMatchObject({ hkStatus: 'dirty', hkNote: null, hkStatusBy: 'user-reception' })
    expect(b?.hkStatus).toBe('maintenance')
    const row = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, r501.id), eq(auditLog.reason, 'check_out')))
      .get()
    expect(row).toBeDefined()
  })
})

describe('oda durumu panosu', () => {
  it('kim kalıyor, bugün gelen/giden, açık arıza ve blok; misafir adı yalnız rezervasyonu gören role', async () => {
    const { res, book, r501, r502, r301, hk, issues, clock } = await setup()
    clock.set('2026-10-02T09:00:00.000Z')
    const stay = book(r501.id, '2026-10-02', '2026-10-04', 'Yılmaz')
    res.checkIn(reception, stay.stays[0]!.id)
    clock.set('2026-10-04T07:00:00.000Z')
    book(r502.id, '2026-10-04', '2026-10-07', 'Demir')
    issues.create(housekeeping, { roomId: r301.id, title: 'Musluk damlatıyor', severity: 'low' })
    issues.create(reception, { roomId: r301.id, title: 'Kapı kilidi', severity: 'urgent', blocksRoom: true })
    issues.create(housekeeping, { title: 'Lobi lambası', area: 'Lobi' })

    const board = hk.board(reception)
    expect(board).toMatchObject({ today: '2026-10-04', showGuests: true, showIssues: true })
    const by = (n: string) => board.rooms.find((r) => r.number === n)!
    expect(by('501')).toMatchObject({
      guest: 'Örnek Yılmaz',
      occupied: true,
      departing: true,
      arriving: false
    })
    expect(by('502')).toMatchObject({ guest: null, occupied: false, arriving: true })
    expect(by('301')).toMatchObject({
      openIssues: 2,
      block: { kind: 'oos', active: true, fromStatus: false }
    })

    const hkBoard = hk.board(housekeeping)
    expect(hkBoard.showGuests).toBe(false)
    expect(hkBoard.rooms.find((r) => r.number === '501')).toMatchObject({ guest: null, occupied: true })
    expect(hk.board(accountant).showIssues).toBe(false)
    expect(hk.board(accountant).rooms[0]?.openIssues).toBeNull()
    expect(() => hk.board(employee)).toThrow(/PERMISSION_DENIED/)
  })

  it('odaya göre açık arızalar: en ciddi önem, en eski bildirim; genel alan ve çözülenler dışarıda', async () => {
    const { r301, r501, hk, issues, clock } = await setup()
    const old = issues.create(housekeeping, { roomId: r301.id, title: 'Musluk', severity: 'low' })
    clock.advance(60)
    issues.create(reception, { roomId: r301.id, title: 'Su kaçağı', severity: 'urgent' })
    const solved = issues.create(reception, { roomId: r501.id, title: 'Ampul', severity: 'medium' })
    issues.resolve(reception, solved.id)
    issues.create(housekeeping, { title: 'Asansör sesi', area: 'Asansör' })
    const summary = hk.openIssuesByRoom(roleCtx('accountant'))
    expect(summary).toHaveLength(1)
    expect(summary[0]).toMatchObject({
      roomId: r301.id,
      roomNumber: '301',
      count: 2,
      severity: 'urgent',
      oldestReportedAt: old.reportedAt
    })
    // The accountant sees the marker, not what the issues are (no room_issues right); reception reads them.
    expect(summary[0]!.issues).toEqual([])
    expect(hk.openIssuesByRoom(reception)[0]!.issues.map((i) => i.title)).toEqual(['Su kaçağı', 'Musluk'])
    const nobody = ctxFromPermissions('user-x', 'test-device', 'ipc', { staff: 'view' })
    expect(() => hk.openIssuesByRoom(nobody)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('arıza "odayı satışa kapat" (G-180, G-38)', () => {
  it('arıza açılınca blok, çözülünce blok kalkar; genel alan adı saklanır', async () => {
    const { r501, issues, roomsSvc, clock } = await setup()
    const issue = issues.create(reception, {
      roomId: r501.id,
      title: 'Tavandan su damlıyor',
      severity: 'urgent',
      blocksRoom: true
    })
    expect(roomsSvc.listBlocks(reception, localDate('2026-10-04'), localDate('2026-10-05'))).toHaveLength(1)
    clock.set('2026-10-05T10:00:00.000Z')
    issues.resolve(housekeeping, issue.id, { resolutionNote: 'Tesisatçı tamir etti' })
    expect(roomsSvc.listBlocks(reception, localDate('2026-10-05'), localDate('2026-10-30'))).toHaveLength(0)
    const lobby = issues.create(housekeeping, { roomId: null, area: ' Lobi ', title: 'Kapı gıcırdıyor' })
    expect(lobby).toMatchObject({ area: 'Lobi', roomNumber: null, photos: 0 })
    const inRoom = issues.create(housekeeping, { roomId: r501.id, area: 'Lobi', title: 'Ampul' })
    expect(inRoom.area).toBeNull()
    expect(handle.db.select().from(rooms).where(eq(rooms.id, r501.id)).get()?.hkStatus).toBe('clean')
  })
})
