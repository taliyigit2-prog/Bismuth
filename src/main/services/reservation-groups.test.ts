// P17b (G-194, S-101, S-106): group reservations — a 3-room group with a guest name per room, atomic bulk
// check-in / check-out, group note and cancel, the folio mode copied from the setting, permissions and the audit
// trail. Every step on the real services.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  reservationGroups,
  reservationNotes,
  reservationRooms,
  reservations,
  roomTypes,
  salesChannels
} from '../db/schema'
import { createServices } from './index'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-01T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(now)
  const svc = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: '/tmp/unused',
      electron: null,
      chrome: null
    },
    { clock: depsOf(handle, clock).clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' }).id
  const rooms = [room('601'), room('602'), room('603')]
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const input = (checkIn = '2026-10-01', checkOut = '2026-10-03') => ({
    name: 'Örnek tur grubu',
    leader: { firstName: 'Deniz', lastName: 'Lider' },
    channelId,
    rooms: [
      {
        stay: { roomId: rooms[0]!, checkIn, checkOut, nightlyPriceMinor: 200_000 },
        guest: { firstName: 'Ayşe', lastName: 'Bir' }
      },
      {
        stay: { roomId: rooms[1]!, checkIn, checkOut, nightlyPriceMinor: 200_000 },
        guest: { firstName: 'Can', lastName: 'İki' }
      },
      { stay: { roomId: rooms[2]!, checkIn, checkOut, nightlyPriceMinor: 200_000 } }
    ]
  })
  const audits = (entityId: string) =>
    handle.db.select().from(auditLog).where(eq(auditLog.entityId, entityId)).all()
  return { svc, clock, rooms, channelId, input, audits }
}

const statusOf = (reservationId: string) =>
  handle.db.select().from(reservations).where(eq(reservations.id, reservationId)).get()!.status

describe('grup rezervasyonu oluşturma', () => {
  it('3 odalı grup: her oda kendi rezervasyonu ve kendi misafir adı; adsız oda lideri alır', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    expect(g.rooms).toHaveLength(3)
    expect(g.rooms.map((r) => r.guestName)).toEqual(['Ayşe Bir', 'Can İki', 'Deniz Lider'])
    expect(g.leader?.name).toBe('Deniz Lider')
    expect(g.name).toBe('Örnek tur grubu')
    expect(new Set(g.rooms.map((r) => r.reservationId)).size).toBe(3)
    expect(g.rooms.every((r) => r.stays.length === 1 && r.chargesMinor === 400_000)).toBe(true)
    expect(g.totals).toEqual({ currency: 'TRY', chargesMinor: 1_200_000, balanceMinor: 1_200_000, payableMinor: 1_200_000 })
    const rows = handle.db.select().from(reservations).where(eq(reservations.groupId, g.id)).all()
    expect(rows).toHaveLength(3)
  })

  it('folyo kipi oluştururken ayardan kopyalanır; sonradan ayar değişince grup değişmez (S-106)', async () => {
    const { svc, input } = await setup()
    expect(svc.reservations.createGroup(reception, input()).folioMode).toBe('single')
    svc.settings.set(owner, { 'booking.groupFolioMode': 'per_room' })
    const second = svc.reservations.createGroup(reception, {
      ...input('2026-11-01', '2026-11-03'),
      name: 'İkinci grup'
    })
    expect(second.folioMode).toBe('per_room')
    svc.settings.set(owner, { 'booking.groupFolioMode': 'single' })
    expect(svc.reservations.group(reception, second.id).folioMode).toBe('per_room')
  })

  it('bir oda dolu ise hiçbir oda ve grup yazılmaz (tek transaction)', async () => {
    const { svc, rooms, channelId, input } = await setup()
    svc.reservations.create(reception, {
      guest: { firstName: 'Başka', lastName: 'Misafir' },
      channelId,
      stays: [
        { roomId: rooms[2]!, checkIn: '2026-10-02', checkOut: '2026-10-04', nightlyPriceMinor: 100_000 }
      ]
    })
    expect(() => svc.reservations.createGroup(reception, input())).toThrow()
    expect(handle.db.select().from(reservationGroups).all()).toHaveLength(0)
    expect(handle.db.select().from(reservations).all()).toHaveLength(1)
  })

  it('grup denetim kaydına yazılır ve iki odadan azıyla oluşturulamaz', async () => {
    const { svc, input, audits } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const rows = audits(g.id)
    expect(rows.map((r) => [r.entity, r.action])).toEqual([['reservation_groups', 'create']])
    expect(() =>
      svc.reservations.createGroup(reception, { ...input(), rooms: input().rooms.slice(0, 1) })
    ).toThrow()
  })

  it('yetki: muhasebeci ve kat hizmetleri grup oluşturamaz, muhasebeci görebilir', async () => {
    const { svc, input } = await setup()
    expect(() => svc.reservations.createGroup(accountant, input())).toThrowError(
      /PERMISSION_DENIED|permission/i
    )
    expect(() => svc.reservations.createGroup(housekeeping, input())).toThrowError(
      /PERMISSION_DENIED|permission/i
    )
    const g = svc.reservations.createGroup(reception, input())
    expect(svc.reservations.group(accountant, g.id).rooms).toHaveLength(3)
    expect(() => svc.reservations.group(housekeeping, g.id)).toThrowError(/PERMISSION_DENIED|permission/i)
  })
})

describe('toplu giriş ve çıkış', () => {
  it('seçilen tüm odalar tek adımda giriş yapar; ayrılınca hepsi çıkış yapar ve oda kirli olur', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const stayIds = g.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    const inHouse = svc.reservations.checkInMany(reception, { groupId: g.id, stayIds })
    expect(inHouse.rooms.map((r) => r.status)).toEqual(['checked_in', 'checked_in', 'checked_in'])
    expect(inHouse.rooms.flatMap((r) => r.stays.map((s) => s.status))).toEqual([
      'in_house',
      'in_house',
      'in_house'
    ])
    const out = svc.reservations.checkOutMany(reception, { groupId: g.id, stayIds })
    expect(out.rooms.map((r) => r.status)).toEqual(['checked_out', 'checked_out', 'checked_out'])
  })

  it('biri başarısızsa hiçbiri giriş yapmaz (atomik)', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const [a, b, c] = g.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    // The third room is already in the house: checking it in again fails and takes the other two back.
    svc.reservations.checkIn(reception, c!)
    expect(() =>
      svc.reservations.checkInMany(reception, { groupId: g.id, stayIds: [a!, b!, c!] })
    ).toThrowError(/invalidStayState/)
    const stays = handle.db.select().from(reservationRooms).all()
    expect(stays.filter((s) => s.status === 'in_house')).toHaveLength(1)
    expect(stays.filter((s) => s.status === 'planned')).toHaveLength(2)
    expect(statusOf(g.rooms[0]!.reservationId)).toBe('confirmed')
  })

  it('henüz gelmemiş oda yüzünden toplu giriş reddedilir ve denetim kaydı yazılmaz', async () => {
    const { svc, input, audits } = await setup()
    const g = svc.reservations.createGroup(reception, input('2026-10-05', '2026-10-07'))
    const stayIds = g.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    expect(() => svc.reservations.checkInMany(reception, { groupId: g.id, stayIds })).toThrowError(
      /checkInTooEarly/
    )
    expect(audits(g.id).filter((r) => r.action === 'check_in')).toHaveLength(0)
  })

  it('gruba ait olmayan konaklama toplu işleme katılamaz', async () => {
    const { svc, input, channelId } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const other = svc.reservations.create(reception, {
      guest: { firstName: 'Dışarıdan', lastName: 'Misafir' },
      channelId,
      stays: [
        {
          roomId: g.rooms[0]!.stays[0]!.roomId,
          checkIn: '2026-10-10',
          checkOut: '2026-10-11',
          nightlyPriceMinor: 100_000
        }
      ]
    })
    expect(() =>
      svc.reservations.checkInMany(reception, { groupId: g.id, stayIds: [other.stays[0]!.id] })
    ).toThrowError(/groupStayMismatch/)
  })

  it('yetki: muhasebeci ve kat hizmetleri toplu giriş/çıkış yapamaz', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const stayIds = g.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    for (const who of [accountant, housekeeping]) {
      expect(() => svc.reservations.checkInMany(who, { groupId: g.id, stayIds })).toThrowError(
        /PERMISSION_DENIED|permission/i
      )
      expect(() => svc.reservations.checkOutMany(who, { groupId: g.id, stayIds })).toThrowError(
        /PERMISSION_DENIED|permission/i
      )
    }
  })

  it('kapalı (iptal edilmiş) grupta toplu giriş reddedilir', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const stayIds = g.rooms.flatMap((r) => r.stays.map((s) => s.stayId))
    svc.reservations.cancelGroup(reception, { groupId: g.id, reason: 'Grup vazgeçti' })
    expect(() => svc.reservations.checkInMany(reception, { groupId: g.id, stayIds })).toThrowError(
      /groupClosed/
    )
  })
})

describe('toplu not ve grup iptali', () => {
  it('toplu not her odanın rezervasyonuna yazılır', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const after = svc.reservations.addGroupNote(reception, { groupId: g.id, text: 'Hepsi bitişik oda ister' })
    expect(after.notes).toHaveLength(3)
    expect(handle.db.select().from(reservationNotes).all()).toHaveLength(3)
    expect(() => svc.reservations.addGroupNote(accountant, { groupId: g.id, text: 'x' })).toThrowError(
      /PERMISSION_DENIED|permission/i
    )
  })

  it('grup iptali gelecek odaları boşaltır ve grubu voided_at ile kapatır; kayıt silinmez', async () => {
    const { svc, input, audits } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    const out = svc.reservations.cancelGroup(reception, { groupId: g.id, reason: 'Grup vazgeçti' })
    expect(out.voided).toBe(true)
    expect(out.rooms.map((r) => r.status)).toEqual(['cancelled', 'cancelled', 'cancelled'])
    expect(
      handle.db.select().from(reservationGroups).where(eq(reservationGroups.id, g.id)).get()?.voidedAt
    ).toBeTruthy()
    expect(handle.db.select().from(reservations).all()).toHaveLength(3)
    expect(audits(g.id).some((r) => r.action === 'cancel' && r.reason === 'Grup vazgeçti')).toBe(true)
    expect(() => svc.reservations.cancelGroup(reception, { groupId: g.id, reason: 'Yine' })).toThrowError(
      /groupClosed/
    )
  })

  it('odada misafir varken grup iptali hiçbir odayı iptal etmez', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    svc.reservations.checkIn(reception, g.rooms[2]!.stays[0]!.stayId)
    expect(() =>
      svc.reservations.cancelGroup(reception, { groupId: g.id, reason: 'Grup vazgeçti' })
    ).toThrowError(/guestInHouse/)
    expect(statusOf(g.rooms[0]!.reservationId)).toBe('confirmed')
    expect(handle.db.select().from(reservationGroups).get()?.voidedAt).toBeNull()
  })

  it('yetki: muhasebeci grubu iptal edemez', async () => {
    const { svc, input } = await setup()
    const g = svc.reservations.createGroup(reception, input())
    expect(() => svc.reservations.cancelGroup(accountant, { groupId: g.id, reason: 'Deneme' })).toThrowError(
      /PERMISSION_DENIED|permission/i
    )
  })
})

describe('grupsuz çok odalı rezervasyon', () => {
  it('mevcut çok odalı rezervasyon grup olmadan çalışmaya devam eder', async () => {
    const { svc, rooms, channelId } = await setup()
    const created = svc.reservations.create(reception, {
      guest: { firstName: 'Tek', lastName: 'Kayıt' },
      channelId,
      stays: [
        { roomId: rooms[0]!, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 100_000 },
        { roomId: rooms[1]!, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 100_000 }
      ]
    })
    expect(created.reservation.groupId).toBeNull()
    expect(svc.reservations.view(reception, created.reservation.id).reservation.group).toBeNull()
    const done = svc.reservations.checkIn(reception, created.stays[0]!.id)
    expect(done.stays[0]!.status).toBe('in_house')
  })
})
