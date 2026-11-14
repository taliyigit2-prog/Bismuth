import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import {
  blockDates,
  clockMinutes,
  findConflicts,
  findHourConflicts,
  hourlyAmountMinor,
  hourRangesOverlap,
  isDayUse,
  isValidHourRange,
  splitForRoomChange,
  staySlots,
  turnoverWarnings,
  usedHours,
  largestFreeRange
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

describe('saatli gündüz yuvaları ve çakışma (K-48)', () => {
  const day = d('2026-10-05')
  const taken = (reservationId: string, startTime: string | null, endTime: string | null) => ({
    roomId: 'r1',
    reservationId,
    date: day,
    slot: 'day' as const,
    startTime,
    endTime
  })
  const want = (startTime: string, endTime: string) => staySlots(day, day, { start: startTime, end: endTime })

  it('saatli yuva saatleriyle gelir; saat yalnız gündüz kullanımına uyar', () => {
    expect(want('09:00', '12:00')).toEqual([{ date: day, slot: 'day', startTime: '09:00', endTime: '12:00' }])
    expect(() => staySlots(day, d('2026-10-06'), { start: '09:00', end: '12:00' })).toThrow(RangeError)
  })

  it('aynı gün saat çakışmayan yuvalar bir arada olur; çakışan, çakışan saatleri söyler', () => {
    const occupied = [taken('A', '09:00', '12:00')]
    expect(findConflicts('r1', want('12:00', '15:00'), occupied, [])).toEqual([])
    expect(findConflicts('r1', want('11:00', '13:00'), occupied, [])).toEqual([
      {
        roomId: 'r1',
        date: day,
        slot: 'day',
        reason: 'occupied',
        reservationId: 'A',
        startTime: '09:00',
        endTime: '12:00'
      }
    ])
  })

  it('tüm gün gündüz yuvası her saatli yuvayla çakışır, iki yönde', () => {
    expect(findConflicts('r1', want('09:00', '10:00'), [taken('W', null, null)], [])).toHaveLength(1)
    expect(findConflicts('r1', staySlots(day, day), [taken('A', '09:00', '10:00')], [])).toHaveLength(1)
  })

  it('gündüz yuvası gece konaklamasıyla çakışmaz; süren konaklamanın içinde çakışır (G-37)', () => {
    const night = { roomId: 'r1', reservationId: 'N', date: day, slot: 'night' as const }
    expect(findConflicts('r1', want('09:00', '10:00'), [night], [])).toEqual([])
    const through = [night, { ...night, date: d('2026-10-04') }]
    expect(findConflicts('r1', want('09:00', '10:00'), through, [])).toHaveLength(1)
  })

  it('uzatma, saatli yuvası olan günü kapsayamaz', () => {
    const nights = staySlots(d('2026-10-04'), d('2026-10-06'))
    expect(findConflicts('r1', nights, [taken('A', '09:00', '10:00')], [])).toHaveLength(1)
  })
})

describe('gerçekten kullanılan saatler (hata C) ve saat ücreti', () => {
  const day = d('2026-10-05')
  const at = (hhmm: string) => new Date(`2026-10-05T${hhmm}:00`)

  it('girişten şimdiye kadar; boş aralık bir dakikaya uzar; gün dışına taşan başka güne ait sayılır', () => {
    expect(usedHours(at('10:15'), day, at('15:30'))).toEqual({ start: '10:15', end: '15:30' })
    expect(usedHours(at('10:15'), day, at('10:15'))).toEqual({ start: '10:15', end: '10:16' })
    expect(usedHours(new Date('2026-10-04T22:00:00'), day, at('15:30'))).toEqual({
      start: '00:00',
      end: '15:30'
    })
    expect(usedHours(at('23:59'), day, at('23:59'))).toBeNull()
  })

  it('saat ücreti × süre dakika oranıyla, kuruşa yuvarlanır', () => {
    expect(hourlyAmountMinor(30_000, 'TRY', '10:00', '12:30')).toBe(75_000)
    expect(hourlyAmountMinor(10_000, 'TRY', '10:00', '10:20')).toBe(3_333)
  })
})

describe('largestFreeRange (hata C: kullanılan saatlerin boş kalan en uzun parçası)', () => {
  const r = (start: string | null, end: string | null) => ({ start, end })
  const wanted = { start: '12:00', end: '17:00' }

  it('yolda kimse yoksa istenen aralığın tamamı; saatler dışındakiler karışmaz', () => {
    expect(largestFreeRange(wanted, [])).toEqual(wanted)
    expect(largestFreeRange(wanted, [r('08:00', '12:00'), r('17:00', '19:00')])).toEqual(wanted)
  })

  it('ortadaki satış aralığı ikiye böler: uzun olan parça, eşitse öncesi', () => {
    expect(largestFreeRange(wanted, [r('14:00', '16:00')])).toEqual({ start: '12:00', end: '14:00' })
    expect(largestFreeRange(wanted, [r('13:00', '14:00')])).toEqual({ start: '14:00', end: '17:00' })
    expect(largestFreeRange(wanted, [r('14:30', '15:30')])).toEqual({ start: '12:00', end: '14:30' })
  })

  it('örtüşen ve sırasız aralıklar birleşir; hepsi kapsarsa ya da tüm gün kaydı varsa null', () => {
    expect(largestFreeRange(wanted, [r('15:00', '16:30'), r('13:00', '15:30')])).toEqual({
      start: '12:00',
      end: '13:00'
    })
    expect(largestFreeRange(wanted, [r('11:00', '18:00')])).toBeNull()
    expect(largestFreeRange(wanted, [r(null, null)])).toBeNull()
  })
})
