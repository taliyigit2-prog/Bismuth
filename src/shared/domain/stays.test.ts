import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import {
  blockDates,
  clockMinutes,
  findConflicts,
  findHourConflicts,
  hourRangesOverlap,
  isDayUse,
  isValidHourRange,
  splitForRoomChange,
  staySlots,
  turnoverWarnings
} from './stays'

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

describe('saatlik konaklama: saat aralığı çakışması (K-48)', () => {
  const r = (start: string | null, end: string | null, reservationId = 'X') => ({ start, end, reservationId })

  it('1. ayrık aralıklar aynı odada aynı gün birlikte durur', () => {
    expect(hourRangesOverlap(r('09:00', '12:00'), r('13:00', '16:00'))).toBe(false)
    expect(hourRangesOverlap(r('13:00', '16:00'), r('09:00', '12:00'))).toBe(false)
  })

  it('2. kısmen örtüşen aralıklar çakışır (iki yönde de)', () => {
    expect(hourRangesOverlap(r('09:00', '12:00'), r('11:00', '14:00'))).toBe(true)
    expect(hourRangesOverlap(r('11:00', '14:00'), r('09:00', '12:00'))).toBe(true)
  })

  it('3. biri ötekini içine alırsa çakışır', () => {
    expect(hourRangesOverlap(r('09:00', '18:00'), r('12:00', '13:00'))).toBe(true)
    expect(hourRangesOverlap(r('12:00', '13:00'), r('09:00', '18:00'))).toBe(true)
  })

  it('4. biri biterken öteki başlıyorsa çakışmaz ([başlangıç, bitiş) yarı açık)', () => {
    expect(hourRangesOverlap(r('09:00', '12:00'), r('12:00', '15:00'))).toBe(false)
    expect(hourRangesOverlap(r('12:00', '15:00'), r('09:00', '12:00'))).toBe(false)
  })

  it('5. aynı aralık çakışır', () => {
    expect(hourRangesOverlap(r('09:00', '12:00'), r('09:00', '12:00'))).toBe(true)
  })

  it('6. saatsiz (null) eski kayıt tüm günü tutar: her saat aralığıyla çakışır', () => {
    expect(hourRangesOverlap(r(null, null), r('22:00', '23:30'))).toBe(true)
    expect(hourRangesOverlap(r('00:00', '00:30'), r(null, null))).toBe(true)
    expect(hourRangesOverlap(r(null, null), r(null, null))).toBe(true)
  })

  it('7. geçersiz aralık reddedilir: bitiş başlangıçtan sonra olmalı, saat HH:MM olmalı', () => {
    expect(isValidHourRange('09:00', '12:00')).toBe(true)
    expect(isValidHourRange('12:00', '12:00')).toBe(false)
    expect(isValidHourRange('15:00', '09:00')).toBe(false)
    expect(isValidHourRange('9:00', '12:00')).toBe(false)
    expect(isValidHourRange('09:00', '24:00')).toBe(false)
    expect(() => clockMinutes('25:00')).toThrow(RangeError)
  })

  it('8. çakışma engeller; temizlik arası dolmadan satış yalnız uyarır (örtüşme uyarı değildir)', () => {
    const others = [r('09:00', '12:00', 'A'), r('15:00', '17:00', 'B'), r('20:00', '22:00', 'C')]
    // 12:30–14:30 fits between A and B, both gaps (30 min) under the 60-minute turnover.
    const range = r('12:30', '14:30', 'N')
    expect(findHourConflicts(range, others)).toEqual([])
    expect(turnoverWarnings(range, others, 60).map((w) => [w.other.reservationId, w.gapMinutes])).toEqual([
      ['A', 30],
      ['B', 30]
    ])
    // Back to back warns (gap 0); an exactly sufficient gap, a zero turnover and a whole-day range do not.
    expect(turnoverWarnings(r('12:00', '13:00'), others, 60).map((w) => w.gapMinutes)).toEqual([0])
    expect(turnoverWarnings(r('13:00', '14:00'), others, 60)).toEqual([])
    expect(turnoverWarnings(range, others, 0)).toEqual([])
    expect(turnoverWarnings(r(null, null), others, 60)).toEqual([])
    // An overlap is a conflict, not a turnover warning; an edited reservation ignores its own ranges.
    const clash = r('11:00', '13:00', 'N')
    expect(findHourConflicts(clash, others).map((o) => o.reservationId)).toEqual(['A'])
    expect(turnoverWarnings(clash, others, 60).map((w) => w.other.reservationId)).toEqual([])
    expect(findHourConflicts(clash, others, 'A')).toEqual([])
  })
})
