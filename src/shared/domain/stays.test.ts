import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import { blockDates, findConflicts, isDayUse, splitForRoomChange, staySlots } from './stays'

describe('konaklama geceleri (§6.1)', () => {
  it('çıkış günü gece değildir; aynı gün giriş-çıkış tek "gündüz" dilimidir', () => {
    expect(staySlots(d('2026-10-01'), d('2026-10-04')).map((s) => `${s.date}/${s.slot}`)).toEqual([
      '2026-10-01/night',
      '2026-10-02/night',
      '2026-10-03/night'
    ])
    expect(staySlots(d('2026-10-05'), d('2026-10-05'))).toEqual([{ date: '2026-10-05', slot: 'day' }])
    expect(isDayUse(d('2026-10-05'), d('2026-10-05'))).toBe(true)
    expect(() => staySlots(d('2026-10-05'), d('2026-10-04'))).toThrow(RangeError)
  })
})

describe('oda çakışması', () => {
  const occupied = [
    { roomId: 'r501', reservationId: 'A', date: d('2026-10-01'), slot: 'night' as const },
    { roomId: 'r501', reservationId: 'A', date: d('2026-10-02'), slot: 'night' as const }
  ]
  const blocks = [
    { id: 'b1', roomId: 'r304', dateFrom: d('2026-01-01'), dateTo: d('2026-02-01'), kind: 'oos' as const }
  ]

  it('çıkış günü başka misafirin giriş günü olabilir; gündüz ve gece giriş ya da çıkış gününde birlikte durur', () => {
    expect(findConflicts('r501', staySlots(d('2026-10-03'), d('2026-10-05')), occupied, blocks)).toEqual([])
    // A (01–03): a day-use on its check-in day and on its check-out day.
    expect(findConflicts('r501', staySlots(d('2026-10-01'), d('2026-10-01')), occupied, blocks)).toEqual([])
    expect(findConflicts('r501', staySlots(d('2026-10-03'), d('2026-10-03')), occupied, blocks)).toEqual([])
  })

  it('süren konaklamanın ortasındaki güne aynı gün giriş-çıkış yazılamaz (G-37)', () => {
    expect(findConflicts('r501', staySlots(d('2026-10-02'), d('2026-10-02')), occupied, blocks)).toEqual([
      { roomId: 'r501', date: '2026-10-02', slot: 'day', reason: 'occupied', reservationId: 'A' }
    ])
    // Two stays back to back are not one stay going on: A leaves on 03, B comes on 03.
    const backToBack = [
      { roomId: 'r9', reservationId: 'A', stayId: 'a', date: d('2026-10-02'), slot: 'night' as const },
      { roomId: 'r9', reservationId: 'B', stayId: 'b', date: d('2026-10-03'), slot: 'night' as const }
    ]
    expect(findConflicts('r9', staySlots(d('2026-10-03'), d('2026-10-03')), backToBack, [])).toEqual([])
  })

  it('gündüz kullanımını kapsayan gece konaklaması yazılamaz; yalnız giriş ya da çıkış günüyse yazılır', () => {
    const dayUse = [{ roomId: 'r502', reservationId: 'D', date: d('2026-10-10'), slot: 'day' as const }]
    expect(findConflicts('r502', staySlots(d('2026-10-09'), d('2026-10-12')), dayUse, [])).toEqual([
      { roomId: 'r502', date: '2026-10-10', slot: 'day', reason: 'occupied', reservationId: 'D' }
    ])
    expect(findConflicts('r502', staySlots(d('2026-10-10'), d('2026-10-12')), dayUse, [])).toEqual([])
    expect(findConflicts('r502', staySlots(d('2026-10-08'), d('2026-10-10')), dayUse, [])).toEqual([])
    // Made longer: 08–10 to 08–11; only the new night (10) is checked, the kept night 09 counts in the span.
    expect(
      findConflicts('r502', staySlots(d('2026-10-10'), d('2026-10-11')), dayUse, [], undefined, [
        ...staySlots(d('2026-10-08'), d('2026-10-11'))
      ]).map((c) => `${c.date}:${c.slot}`)
    ).toEqual(['2026-10-10:day'])
  })

  it('dolu geceye ve satılmaz bloğa yazılamaz; aynı rezervasyon kendini engellemez', () => {
    const c = findConflicts('r501', staySlots(d('2026-09-30'), d('2026-10-02')), occupied, blocks)
    expect(c).toEqual([
      { roomId: 'r501', date: '2026-10-01', slot: 'night', reason: 'occupied', reservationId: 'A' }
    ])
    expect(findConflicts('r501', staySlots(d('2026-10-01'), d('2026-10-03')), occupied, blocks, 'A')).toEqual(
      []
    )
    const b = findConflicts('r304', staySlots(d('2026-01-31'), d('2026-02-02')), occupied, blocks)
    expect(b.map((x) => `${x.date}:${x.reason}`)).toEqual(['2026-01-31:blocked'])
  })

  it('blok günleri bitiş hariç listelenir; oda değişikliği kalan geceleri taşır', () => {
    expect(blockDates({ dateFrom: d('2026-03-30'), dateTo: d('2026-04-02') })).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01'
    ])
    const nights = [{ date: d('2026-10-01') }, { date: d('2026-10-02') }, { date: d('2026-10-03') }]
    const { stay, move } = splitForRoomChange(nights, d('2026-10-02'))
    expect(stay.map((n) => n.date)).toEqual(['2026-10-01'])
    expect(move.map((n) => n.date)).toEqual(['2026-10-02', '2026-10-03'])
  })
})
