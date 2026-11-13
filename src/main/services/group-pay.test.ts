// P17c (S-106, G-194): one payment on a group's single account is spread over the rooms' open balances in one
// transaction; existing reservations are linked into a group.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, payments, paymentMethods, reservations, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
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
    { clock: depsOf(handle, testClock('2026-10-01T09:00:00.000Z')).clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const rooms = ['611', '612', '613'].map(
    (n) =>
      svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' }).id
  )
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const methodId = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const group = svc.reservations.createGroup(reception, {
    name: 'Örnek grup',
    leader: { firstName: 'Deniz', lastName: 'Lider' },
    channelId,
    rooms: rooms.map((roomId, i) => ({
      stay: { roomId, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: (i + 1) * 100_000 },
      guest: { firstName: `Misafir${i}`, lastName: 'Örnek' }
    }))
  })
  return { svc, rooms, channelId, methodId, group }
}

const pay = (groupId: string, methodId: string, amountMinor: number) => ({
  groupId,
  methodId,
  amountMinor,
  currency: 'TRY',
  date: '2026-10-01'
})

describe('grup tek ödeme', () => {
  it('tutar odaların açık bakiyelerine sırayla dağıtılır ve her oda için bir ödeme satırı yazılır', async () => {
    const { svc, methodId, group } = await setup()
    // Open balances 1.000 / 2.000 / 3.000 TL: 2.500 TL clears the first room and 1.500 of the second.
    const out = svc.reservations.payGroup(reception, pay(group.id, methodId, 250_000))
    expect(out.rooms.map((r) => r.balanceMinor)).toEqual([0, 50_000, 300_000])
    expect(out.totals?.balanceMinor).toBe(350_000)
    expect(handle.db.select().from(payments).all()).toHaveLength(2)
  })

  it('bakiyeden fazla tutar reddedilir ve hiçbir satır yazılmaz', async () => {
    const { svc, methodId, group } = await setup()
    expect(() => svc.reservations.payGroup(reception, pay(group.id, methodId, 600_001))).toThrowError(
      /groupPayExceeds/
    )
    expect(handle.db.select().from(payments).all()).toHaveLength(0)
  })

  it('tam bakiye tek adımda ödenir ve denetim kaydına yazılır', async () => {
    const { svc, methodId, group } = await setup()
    const out = svc.reservations.payGroup(reception, pay(group.id, methodId, 600_000))
    expect(out.totals?.balanceMinor).toBe(0)
    const rows = handle.db.select().from(auditLog).where(eq(auditLog.entityId, group.id)).all()
    expect(rows.some((r) => r.entity === 'reservation_groups' && r.action === 'update')).toBe(true)
  })

  it('farklı para birimi reddedilir', async () => {
    const { svc, methodId, group } = await setup()
    expect(() =>
      svc.reservations.payGroup(reception, { ...pay(group.id, methodId, 100_000), currency: 'EUR' })
    ).toThrowError(/groupPayCurrency/)
  })

  it('yetki: kat hizmetleri grup ödemesi alamaz', async () => {
    const { svc, methodId, group } = await setup()
    expect(() => svc.reservations.payGroup(housekeeping, pay(group.id, methodId, 100_000))).toThrowError(
      /permission/i
    )
    expect(handle.db.select().from(payments).all()).toHaveLength(0)
  })
})

describe('mevcut rezervasyonları gruba bağlama', () => {
  async function singles() {
    const ctx = await setup()
    const make = (roomIdx: number, name: string) =>
      ctx.svc.reservations.create(reception, {
        guest: { firstName: name, lastName: 'Tek' },
        channelId: ctx.channelId,
        stays: [
          {
            roomId: ctx.rooms[roomIdx]!,
            checkIn: '2026-10-05',
            checkOut: '2026-10-06',
            nightlyPriceMinor: 100_000
          }
        ]
      }).reservation.id
    return { ...ctx, a: make(0, 'Ali'), b: make(1, 'Veli') }
  }

  it('iki ayrı rezervasyon yeni bir gruba bağlanır; lider ilk rezervasyonun misafiridir', async () => {
    const { svc, a, b } = await singles()
    const out = svc.reservations.attachToGroup(reception, { name: 'Birleşik grup', reservationIds: [a, b] })
    expect(out.rooms).toHaveLength(2)
    expect(out.leader?.name).toBe('Ali Tek')
    expect(handle.db.select().from(reservations).where(eq(reservations.id, a)).get()?.groupId).toBe(out.id)
  })

  it('mevcut gruba eklenir', async () => {
    const { svc, a, group } = await singles()
    const out = svc.reservations.attachToGroup(reception, { groupId: group.id, reservationIds: [a] })
    expect(out.rooms).toHaveLength(4)
  })

  it('zaten bir grupta olan rezervasyon taşınmaz; yetkisiz rol reddedilir', async () => {
    const { svc, group, a } = await singles()
    const inGroup = group.rooms[0]!.reservationId
    expect(() =>
      svc.reservations.attachToGroup(reception, { groupId: group.id, reservationIds: [inGroup] })
    ).toThrowError(/groupAttachTaken/)
    expect(() =>
      svc.reservations.attachToGroup(accountant, { name: 'x', reservationIds: [a, inGroup] })
    ).toThrowError(/permission/i)
  })
})

describe('grup iptali denetim kaydı ve son iptaller', () => {
  it('grup iptali denetim kaydına önceki durumu da yazar', async () => {
    const { svc, group } = await setup()
    svc.reservations.cancelGroup(reception, { groupId: group.id, reason: 'Grup vazgeçti' })
    const row = handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, group.id))
      .all()
      .find((r) => r.action === 'cancel')!
    expect(row.beforeJson).toContain('statuses')
  })

  it('son 7 günde iptal edilen ve gelmedi işaretlenen rezervasyonlar listelenir; kayıt silinmez', async () => {
    const { svc, group } = await setup()
    const [a, b] = group.rooms
    svc.reservations.cancel(reception, a!.reservationId, 'Misafir vazgeçti')
    svc.reservations.noShow(reception, b!.reservationId)
    const list = svc.calendar.recentEnded(reception, { days: 7 })
    expect(list.map((r) => r.status).sort()).toEqual(['cancelled', 'no_show'])
    expect(list.find((r) => r.status === 'cancelled')?.reason).toBe('Misafir vazgeçti')
    expect(list[0]?.rooms.length).toBe(1)
    expect(handle.db.select().from(reservations).all()).toHaveLength(3)
  })

  it('son iptaller: kat hizmetleri takvimi göremez', async () => {
    const { svc } = await setup()
    expect(() => svc.calendar.recentEnded(housekeeping, { days: 7 })).toThrowError(/permission/i)
  })
})
