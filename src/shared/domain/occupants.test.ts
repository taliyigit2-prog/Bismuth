import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import {
  inHouseStays,
  kbsMissing,
  occupantCount,
  overdueCheckouts,
  pendingArrivals,
  type OccupantLike,
  type StayRoomLike
} from './occupants'

const stay: StayRoomLike = {
  id: 's1',
  roomId: 'r501',
  reservationId: 'R1',
  checkIn: d('2026-10-01'),
  checkOut: d('2026-10-03'),
  checkedInAt: '2026-10-01T14:00:00.000Z'
}
const primary: OccupantLike = {
  id: 'o1',
  reservationRoomId: 's1',
  fullName: 'Örnek Misafir',
  isPrimary: true,
  arrivedAt: '2026-10-01T14:00:00.000Z',
  kbsReportedAt: '2026-10-01T14:05:00.000Z'
}

describe('odadaki kişiler ve KBS (§6.15, kabul ölçütü)', () => {
  it('sonradan eklenen kişi KBS işareti yoksa eksik döner; işaretlenince düşer', () => {
    const second: OccupantLike = {
      id: 'o2',
      reservationRoomId: 's1',
      fullName: 'İkinci Kişi',
      isPrimary: false,
      arrivedAt: '2026-10-01T22:30:00.000Z'
    }
    const at = '2026-10-01T23:00:00.000Z'
    expect(kbsMissing([stay], [primary, second], at)).toEqual([
      { occupantId: 'o2', reservationRoomId: 's1', roomId: 'r501', fullName: 'İkinci Kişi', kind: 'checkin' }
    ])
    expect(occupantCount(stay, [primary, second], at)).toBe(2)
    expect(kbsMissing([stay], [primary, { ...second, kbsReportedAt: at }], at)).toEqual([])
  })

  it('çıkışta KBS çıkışı yapılmamış kişi "KBS çıkışı" uyarısı verir', () => {
    const out = { ...stay, checkedOutAt: '2026-10-03T10:00:00.000Z' }
    const at = '2026-10-03T11:00:00.000Z'
    expect(kbsMissing([out], [primary], at).map((i) => i.kind)).toEqual(['checkout'])
    expect(kbsMissing([out], [{ ...primary, kbsCheckoutAt: at }], at)).toEqual([])
    expect(occupantCount(out, [primary], at)).toBe(0)
  })

  it('çok odalı rezervasyonda kimse yazılmamış ikinci oda "isim girilmedi" uyarısı verir', () => {
    const second: StayRoomLike = { ...stay, id: 's2', roomId: 'r502' }
    const at = '2026-10-01T23:00:00.000Z'
    expect(kbsMissing([stay, second], [primary], at)).toEqual([
      { occupantId: null, reservationRoomId: 's2', roomId: 'r502', fullName: null, kind: 'unnamed' }
    ])
    expect(kbsMissing([stay, { ...second, checkedInAt: null }], [primary], at)).toEqual([])
  })

  it('henüz gelmemiş kişi uyarı vermez; kişi listesi boşsa birincil misafir 1 kişi sayılır', () => {
    const future = { ...primary, id: 'o3', arrivedAt: '2026-10-02T12:00:00.000Z', kbsReportedAt: null }
    expect(kbsMissing([stay], [primary, future], '2026-10-01T23:00:00.000Z')).toEqual([])
    expect(occupantCount(stay, [], '2026-10-01T23:00:00.000Z')).toBe(1)
    expect(occupantCount({ ...stay, checkedInAt: null }, [], '2026-10-01T23:00:00.000Z')).toBe(0)
    expect(
      kbsMissing(
        [{ ...stay, cancelled: true }],
        [{ ...primary, kbsReportedAt: null }],
        '2026-10-02T00:00:00Z'
      )
    ).toEqual([])
  })
})

describe('günlük listeler (Bugün, vardiya devri)', () => {
  const stays: StayRoomLike[] = [
    stay,
    { id: 's2', roomId: 'r102', reservationId: 'R2', checkIn: d('2026-10-03'), checkOut: d('2026-10-05') },
    { ...stay, id: 's3', roomId: 'r203', checkOut: d('2026-10-02') },
    { ...stay, id: 's4', roomId: 'r204', checkOut: d('2026-10-03'), checkedOutAt: '2026-10-03T09:00:00Z' }
  ]
  it('bugün gelecekler, çıkışı geçmiş ama çıkmamışlar (12:00 ayarı), otelde kalanlar', () => {
    expect(pendingArrivals(stays, d('2026-10-03')).map((s) => s.id)).toEqual(['s2'])
    expect(overdueCheckouts(stays, d('2026-10-03'), '11:59', '12:00').map((s) => s.id)).toEqual(['s3'])
    expect(overdueCheckouts(stays, d('2026-10-03'), '12:00', '12:00').map((s) => s.id)).toEqual(['s1', 's3'])
    expect(inHouseStays(stays, '2026-10-03T10:00:00.000Z').map((s) => s.id)).toEqual(['s1', 's3'])
  })

  it('gece yarısından sonra dünün gelmemiş girişi çıkış saatine kadar gelecekler listesinde kalır', () => {
    const late: StayRoomLike[] = [
      { id: 'g1', roomId: 'r101', reservationId: 'R1', checkIn: d('2026-10-05'), checkOut: d('2026-10-07') },
      // Yesterday's day use is not awaited overnight.
      { id: 'g2', roomId: 'r102', reservationId: 'R2', checkIn: d('2026-10-05'), checkOut: d('2026-10-05') }
    ]
    const at0130 = { nowTime: '01:30', checkoutTime: '12:00' }
    expect(pendingArrivals(late, d('2026-10-06'), at0130).map((s) => s.id)).toEqual(['g1'])
    expect(pendingArrivals(late, d('2026-10-06'), { ...at0130, nowTime: '12:00' })).toEqual([])
    expect(pendingArrivals(late, d('2026-10-06'))).toEqual([])
  })
})
