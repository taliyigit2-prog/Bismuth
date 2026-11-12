import { describe, expect, it } from 'vitest'
import { localDate, type LocalDate } from '../date'
import { localDateTime, type LocalDateTime } from './local-datetime'
import {
  isOverdue,
  materializePlan,
  nextDue,
  nextDueAfterDone,
  occurrencesBetween,
  recurrenceRuleSchema,
  remindAt,
  roomsDueEveryNStays,
  shouldOpenEveryNStays,
  staysSinceLastDone,
  taskKey,
  type EveryNStaysRule,
  type IntervalRule,
  type RecurrenceRule,
  type RoomCheckout,
  type TaskTemplatePlanInput
} from './task-recurrence'

const dt = (s: string): LocalDateTime => localDateTime(s)
const rule = (input: unknown): RecurrenceRule => recurrenceRuleSchema.parse(input)

describe('Tekrar kuralı şeması', () => {
  it('geçerli kuralları kabul eder, her N konaklamada varsayılan 10 ve day-use sayılır', () => {
    expect(rule({ kind: 'daily', time: '12:00' })).toEqual({ kind: 'daily', time: '12:00' })
    expect(rule({ kind: 'everyNStays' })).toEqual({ kind: 'everyNStays', n: 10, countDayUse: true })
    expect(rule({ kind: 'interval', unit: 'months', every: 6, time: '09:00' }).kind).toBe('interval')
  })

  it('hatalı saati, boş ya da tekrarlı hafta gününü, 31 üstü ay gününü reddeder', () => {
    expect(recurrenceRuleSchema.safeParse({ kind: 'daily', time: '24:00' }).success).toBe(false)
    expect(recurrenceRuleSchema.safeParse({ kind: 'weekly', weekdays: [], time: '09:00' }).success).toBe(
      false
    )
    expect(recurrenceRuleSchema.safeParse({ kind: 'weekly', weekdays: [1, 1], time: '09:00' }).success).toBe(
      false
    )
    expect(recurrenceRuleSchema.safeParse({ kind: 'weekly', weekdays: [7], time: '09:00' }).success).toBe(
      false
    )
    expect(recurrenceRuleSchema.safeParse({ kind: 'monthly', day: 32, time: '09:00' }).success).toBe(false)
    expect(
      recurrenceRuleSchema.safeParse({ kind: 'interval', unit: 'weeks', every: 1, time: '09:00' }).success
    ).toBe(false)
    expect(recurrenceRuleSchema.safeParse({ kind: 'everyNStays', n: 0 }).success).toBe(false)
  })
})

describe('Her gün belirli saatte', () => {
  const daily = rule({ kind: 'daily', time: '12:00' })

  it('"her gün 12:00" bir hafta için günde bir görev üretir', () => {
    const due = occurrencesBetween(
      daily,
      dt('2026-10-01T00:00'),
      dt('2026-10-01T00:00'),
      dt('2026-10-08T00:00')
    )
    expect(due).toEqual([
      '2026-10-01T12:00',
      '2026-10-02T12:00',
      '2026-10-03T12:00',
      '2026-10-04T12:00',
      '2026-10-05T12:00',
      '2026-10-06T12:00',
      '2026-10-07T12:00'
    ])
  })

  it('ilk tarihten önceki ve saati geçmiş gün üretilmez; aralık sonu dahil değildir', () => {
    const due = occurrencesBetween(
      daily,
      dt('2026-10-02T13:00'),
      dt('2026-10-01T00:00'),
      dt('2026-10-04T12:00')
    )
    expect(due).toEqual(['2026-10-03T12:00'])
  })

  it('sonraki zaman: aynı gün saati gelmediyse bugün, geçtiyse yarın', () => {
    expect(nextDue(daily, dt('2026-10-02T11:59'))).toBe('2026-10-02T12:00')
    expect(nextDue(daily, dt('2026-10-02T12:00'))).toBe('2026-10-03T12:00')
    expect(nextDue(daily, dt('2026-12-31T18:00'))).toBe('2027-01-01T12:00')
  })
})

describe('Haftanın günleri', () => {
  const monWedFri = rule({ kind: 'weekly', weekdays: [5, 1, 3], time: '15:00' })

  it('pazartesi, çarşamba, cuma 15:00 iki haftada altı görev üretir', () => {
    // 5 Ekim 2026 pazartesi.
    const due = occurrencesBetween(
      monWedFri,
      dt('2026-10-01T00:00'),
      dt('2026-10-05T00:00'),
      dt('2026-10-19T00:00')
    )
    expect(due).toEqual([
      '2026-10-05T15:00',
      '2026-10-07T15:00',
      '2026-10-09T15:00',
      '2026-10-12T15:00',
      '2026-10-14T15:00',
      '2026-10-16T15:00'
    ])
  })

  it('cuma 15:00 sonrası sıradaki pazartesidir', () => {
    expect(nextDue(monWedFri, dt('2026-10-09T15:00'))).toBe('2026-10-12T15:00')
    expect(nextDue(monWedFri, dt('2026-10-09T14:59'))).toBe('2026-10-09T15:00')
  })

  it('tek gün seçiliyse aynı gün saat geçince bir hafta sonrasıdır', () => {
    const sunday = rule({ kind: 'weekly', weekdays: [0], time: '08:00' })
    expect(nextDue(sunday, dt('2026-10-04T08:00'))).toBe('2026-10-11T08:00')
  })
})

describe('Ayın günü', () => {
  const day31 = rule({ kind: 'monthly', day: 31, time: '10:00' })

  it('31 kısa aylarda ayın son gününe düşer (30 / 28 / artık yılda 29)', () => {
    const due = occurrencesBetween(
      day31,
      dt('2027-01-01T00:00'),
      dt('2027-01-01T00:00'),
      dt('2027-07-01T00:00')
    )
    expect(due).toEqual([
      '2027-01-31T10:00',
      '2027-02-28T10:00',
      '2027-03-31T10:00',
      '2027-04-30T10:00',
      '2027-05-31T10:00',
      '2027-06-30T10:00'
    ])
    const leap = occurrencesBetween(
      day31,
      dt('2028-02-01T00:00'),
      dt('2028-02-01T00:00'),
      dt('2028-04-01T00:00')
    )
    expect(leap).toEqual(['2028-02-29T10:00', '2028-03-31T10:00'])
  })

  it('"yapıldı" sonrası sonraki tarih: 28 Şubat → 31 Mart, 31 Mart → 30 Nisan', () => {
    expect(nextDue(day31, dt('2027-02-28T10:00'))).toBe('2027-03-31T10:00')
    expect(nextDue(day31, dt('2027-03-31T10:00'))).toBe('2027-04-30T10:00')
    expect(nextDue(day31, dt('2027-12-31T10:00'))).toBe('2028-01-31T10:00')
    expect(nextDue(rule({ kind: 'monthly', day: 30, time: '10:00' }), dt('2028-01-30T10:00'))).toBe(
      '2028-02-29T10:00'
    )
  })

  it('yasal hatırlatıcı: her ayın 1i, ay içinde açılırsa sonraki ayın 1i', () => {
    const first = rule({ kind: 'monthly', day: 1, time: '09:00' })
    expect(nextDue(first, dt('2026-10-02T08:00'))).toBe('2026-11-01T09:00')
    expect(nextDue(first, dt('2026-10-01T08:00'))).toBe('2026-10-01T09:00')
  })
})

describe('Bakım aralığı (her N gün / ay / yıl)', () => {
  const monthly = rule({ kind: 'interval', unit: 'months', every: 1, time: '09:00' }) as IntervalRule

  it('31 Ocaktan aylık: 28 Şubat, 31 Mart, 30 Nisan (asıl gün korunur)', () => {
    const anchor = dt('2027-01-31T09:00')
    const feb = nextDue(monthly, anchor, anchor)
    expect(feb).toBe('2027-02-28T09:00')
    const mar = nextDue(monthly, feb ?? anchor, anchor)
    expect(mar).toBe('2027-03-31T09:00')
    expect(nextDue(monthly, mar ?? anchor, anchor)).toBe('2027-04-30T09:00')
    // Without the anchor the series would drift to the 28th.
    expect(nextDue(monthly, dt('2027-02-28T09:00'))).toBe('2027-03-28T09:00')
  })

  it('aralık projeksiyonu ilk tarihten başlar ve asıl günü korur', () => {
    const due = occurrencesBetween(
      monthly,
      dt('2027-01-31T09:00'),
      dt('2027-01-01T00:00'),
      dt('2027-06-01T00:00')
    )
    expect(due).toEqual([
      '2027-01-31T09:00',
      '2027-02-28T09:00',
      '2027-03-31T09:00',
      '2027-04-30T09:00',
      '2027-05-31T09:00'
    ])
  })

  it('yıllık kontrol 29 Şubattan: artık olmayan yıllarda 28 Şubat, artık yılda yine 29', () => {
    const yearly = rule({ kind: 'interval', unit: 'years', every: 1, time: '09:00' })
    const due = occurrencesBetween(
      yearly,
      dt('2028-02-29T09:00'),
      dt('2028-01-01T00:00'),
      dt('2033-01-01T00:00')
    )
    expect(due).toEqual([
      '2028-02-29T09:00',
      '2029-02-28T09:00',
      '2030-02-28T09:00',
      '2031-02-28T09:00',
      '2032-02-29T09:00'
    ])
  })

  it('her 90 günde bir: gün sayarak ilerler', () => {
    const every90 = rule({ kind: 'interval', unit: 'days', every: 90, time: '10:00' })
    expect(nextDue(every90, dt('2026-10-02T15:00'))).toBe('2026-12-31T10:00')
  })

  it('zamanında yapılırsa seri bozulmaz; geç ya da erken yapılırsa yapıldığı günden sayılır', () => {
    const anchor = dt('2027-01-31T09:00')
    const done = (dueAt: string, doneAt: string): LocalDateTime =>
      nextDueAfterDone(monthly, { dueAt: dt(dueAt), doneAt: dt(doneAt) }, anchor)
    expect(done('2027-02-28T09:00', '2027-02-28T16:40')).toBe('2027-03-31T09:00')
    // Late: counted from 2 April, and the series then stays on the 2nd.
    expect(done('2027-03-31T09:00', '2027-04-02T11:00')).toBe('2027-05-02T09:00')
    expect(done('2027-05-02T09:00', '2027-05-02T10:00')).toBe('2027-06-02T09:00')
    // Early: counted from 30 May.
    expect(done('2027-06-02T09:00', '2027-05-30T10:00')).toBe('2027-06-30T09:00')
  })

  it('sonraki tarih kapanan görevin tarihinden sonradır: çok erken yapılan bakım seriyi durdurmaz', () => {
    const every30 = rule({ kind: 'interval', unit: 'days', every: 30, time: '10:00' }) as IntervalRule
    const every7 = rule({ kind: 'interval', unit: 'days', every: 7, time: '10:00' }) as IntervalRule
    const after = (r: IntervalRule, dueAt: string, doneAt: string, anchor: string): LocalDateTime =>
      nextDueAfterDone(r, { dueAt: dt(dueAt), doneAt: dt(doneAt) }, dt(anchor))
    // "Yapıldı" twice on 5 Oct: the second closes the 4 Nov task; the next one is 4 Dec, not 4 Nov again.
    expect(after(every30, '2026-11-04T10:00', '2026-10-05T11:00', '2026-10-05T10:00')).toBe(
      '2026-12-04T10:00'
    )
    // A weekly check done exactly 7 days early counts from its due.
    expect(after(every7, '2026-10-10T10:00', '2026-10-03T10:00', '2026-10-10T10:00')).toBe('2026-10-17T10:00')
    // Anchored on the 31st, done on 30 Nov for the 31 Dec task: 31 Jan.
    expect(after(monthly, '2026-12-31T09:00', '2026-11-30T12:00', '2026-10-31T09:00')).toBe(
      '2027-01-31T09:00'
    )
    // Moderately early still counts from the day it was done (K-34).
    expect(after(every30, '2026-11-04T10:00', '2026-10-30T10:00', '2026-10-05T10:00')).toBe(
      '2026-11-29T10:00'
    )
  })

  it('ayın son günü asıl günün yerine geçer: 30 Nisanda yapılan aylık bakım 31 Mayısa gider', () => {
    const anchor = dt('2027-01-31T09:00')
    expect(
      nextDueAfterDone(monthly, { dueAt: dt('2027-03-31T09:00'), doneAt: dt('2027-04-30T12:00') }, anchor)
    ).toBe('2027-05-31T09:00')
  })

  it('tekrarsız ve her N konaklama kuralının saatle sonraki zamanı yoktur', () => {
    expect(nextDue(rule({ kind: 'none' }), dt('2026-10-02T12:00'))).toBeNull()
    expect(nextDue(rule({ kind: 'everyNStays' }), dt('2026-10-02T12:00'))).toBeNull()
  })

  it('tekrarsız görev yalnız aralıktaysa listelenir', () => {
    const none = rule({ kind: 'none' })
    expect(
      occurrencesBetween(none, dt('2026-10-05T09:00'), dt('2026-10-01T00:00'), dt('2026-10-08T00:00'))
    ).toEqual(['2026-10-05T09:00'])
    expect(
      occurrencesBetween(none, dt('2026-10-08T00:00'), dt('2026-10-01T00:00'), dt('2026-10-08T00:00'))
    ).toEqual([])
    expect(
      occurrencesBetween(none, dt('2026-10-05T09:00'), dt('2026-10-08T00:00'), dt('2026-10-01T00:00'))
    ).toEqual([])
  })
})

describe('Hatırlatma ve gecikme', () => {
  it('3 gün önce hatırlatma: vade saatinden 4320 dakika önce', () => {
    expect(remindAt(dt('2027-01-31T09:00'), 3 * 24 * 60)).toBe('2027-01-28T09:00')
    expect(remindAt(dt('2027-03-01T09:00'), 3 * 24 * 60)).toBe('2027-02-26T09:00')
    expect(remindAt(dt('2027-01-31T09:00'), null)).toBe('2027-01-31T09:00')
    expect(() => remindAt(dt('2027-01-31T09:00'), -5)).toThrow(RangeError)
  })

  it('yalnız açık ve vadesi geçmiş görev gecikmiştir', () => {
    const now = dt('2026-10-02T12:30')
    expect(isOverdue({ status: 'open', dueAt: dt('2026-10-02T12:00') }, now)).toBe(true)
    expect(isOverdue({ status: 'open', dueAt: dt('2026-10-02T12:30') }, now)).toBe(false)
    expect(isOverdue({ status: 'done', dueAt: dt('2026-10-01T12:00') }, now)).toBe(false)
    expect(isOverdue({ status: 'cancelled', dueAt: dt('2026-10-01T12:00') }, now)).toBe(false)
    expect(isOverdue({ status: 'open', dueAt: null }, now)).toBe(false)
  })
})

describe('Her N konaklamada bir (derin temizlik)', () => {
  const deepClean = rule({ kind: 'everyNStays' }) as EveryNStaysRule
  const noDayUse = rule({ kind: 'everyNStays', n: 10, countDayUse: false }) as EveryNStaysRule
  const day = (n: number): LocalDate => localDate(`2026-10-${String(n).padStart(2, '0')}`)
  const stays = (roomId: string, count: number, kind: RoomCheckout['kind'] = 'overnight'): RoomCheckout[] =>
    Array.from({ length: count }, (_, i) => ({ roomId, checkOut: day(i + 2), kind }))

  it('son "yapıldı"dan sonra 10. çıkışta derin temizlik görevi açılır, 9 çıkışta açılmaz', () => {
    expect(shouldOpenEveryNStays(stays('501', 9), day(1), deepClean)).toBe(false)
    expect(shouldOpenEveryNStays(stays('501', 10), day(1), deepClean)).toBe(true)
    expect(staysSinceLastDone(stays('501', 10), day(1), deepClean)).toBe(10)
  })

  it('yapıldı günündeki ve önceki çıkışlar sayılmaz', () => {
    expect(staysSinceLastDone(stays('501', 10), day(4), deepClean)).toBe(7)
    expect(staysSinceLastDone(stays('501', 10), null, deepClean)).toBe(10)
  })

  it('day-use yalnız ayar açıksa sayılır', () => {
    const mixed = [...stays('501', 8), ...stays('501', 2, 'day_use')]
    expect(shouldOpenEveryNStays(mixed, day(1), deepClean)).toBe(true)
    expect(staysSinceLastDone(mixed, day(1), noDayUse)).toBe(8)
    expect(shouldOpenEveryNStays(mixed, day(1), noDayUse)).toBe(false)
  })

  it('oda bazında sayar: başka odanın çıkışları karışmaz', () => {
    const checkouts = [...stays('501', 10), ...stays('502', 4)]
    expect(staysSinceLastDone(checkouts, day(1), deepClean, '502')).toBe(4)
    const lastDone = new Map<string, LocalDate | null>([['502', day(1)]])
    expect(roomsDueEveryNStays(checkouts, lastDone, deepClean)).toEqual(['501'])
    // A template started on 5 October counts only later checkouts in rooms never done.
    expect(roomsDueEveryNStays(checkouts, lastDone, deepClean, day(5))).toEqual([])
  })
})

describe('Görev üretim planı (idempotent)', () => {
  const daily: TaskTemplatePlanInput = {
    id: 'T-DAILY',
    rule: rule({ kind: 'daily', time: '12:00' }),
    firstDue: dt('2026-10-01T00:00'),
    active: true
  }
  const from = dt('2026-10-01T00:00')
  const to = dt('2026-10-08T00:00')
  const keysOf = (plan: { templateId: string; dueAt: LocalDateTime }[]): Set<string> =>
    new Set(plan.map((p) => taskKey(p.templateId, p.dueAt)))

  it('"her gün 12:00" günde bir görev üretir; ikinci çalıştırma kopya üretmez', () => {
    const first = materializePlan([daily], new Set(), from, to)
    expect(first).toHaveLength(7)
    expect(first[0]).toEqual({ templateId: 'T-DAILY', dueAt: '2026-10-01T12:00' })
    expect(materializePlan([daily], keysOf(first), from, to)).toEqual([])
  })

  it('kayan pencere yalnız yeni günleri ekler', () => {
    const first = materializePlan([daily], new Set(), from, to)
    const next = materializePlan([daily], keysOf(first), dt('2026-10-02T00:00'), dt('2026-10-09T00:00'))
    expect(next).toEqual([{ templateId: 'T-DAILY', dueAt: '2026-10-08T12:00' }])
  })

  it('pasif şablon ve her N konaklama şablonu saatle görev üretmez', () => {
    const inactive = { ...daily, id: 'T-OFF', active: false }
    const stays: TaskTemplatePlanInput = {
      id: 'T-STAYS',
      rule: rule({ kind: 'everyNStays' }),
      firstDue: from,
      active: true
    }
    expect(materializePlan([inactive, stays], new Set(), from, to)).toEqual([])
  })

  it('daha önce üretilen aralık atlanır', () => {
    const plan = materializePlan(
      [{ ...daily, lastMaterializedUntil: dt('2026-10-06T00:00') }],
      new Set(),
      from,
      to
    )
    expect(plan.map((p) => p.dueAt)).toEqual(['2026-10-06T12:00', '2026-10-07T12:00'])
  })

  it('gecikmiş bakım görevi aralık başından önce olsa da bir kez planlanır', () => {
    const elevator: TaskTemplatePlanInput = {
      id: 'T-ELEVATOR',
      rule: rule({ kind: 'interval', unit: 'months', every: 1, time: '09:00' }),
      firstDue: dt('2026-09-30T09:00'),
      active: true,
      lastMaterializedUntil: dt('2026-10-08T00:00')
    }
    const plan = materializePlan([elevator], new Set(), from, to)
    expect(plan).toEqual([{ templateId: 'T-ELEVATOR', dueAt: '2026-09-30T09:00' }])
    expect(materializePlan([elevator], keysOf(plan), from, to)).toEqual([])
    expect(materializePlan([{ ...elevator, firstDue: dt('2026-10-31T09:00') }], new Set(), from, to)).toEqual(
      []
    )
  })

  it('bakım yapıldıktan sonra sıradaki vade son yapılan görevden hesaplanır', () => {
    const elevator: TaskTemplatePlanInput = {
      id: 'T-ELEVATOR',
      rule: rule({ kind: 'interval', unit: 'months', every: 1, time: '09:00' }),
      firstDue: dt('2026-08-31T09:00'),
      active: true,
      lastDone: { dueAt: dt('2026-09-30T09:00'), doneAt: dt('2026-09-30T15:00') }
    }
    expect(materializePlan([elevator], new Set(), from, to)).toEqual([])
    expect(materializePlan([elevator], new Set(), from, dt('2026-11-01T00:00'))).toEqual([
      { templateId: 'T-ELEVATOR', dueAt: '2026-10-31T09:00' }
    ])
    const late = { ...elevator, lastDone: { dueAt: dt('2026-09-30T09:00'), doneAt: dt('2026-10-03T10:00') } }
    expect(materializePlan([late], new Set(), from, dt('2026-11-04T00:00'))).toEqual([
      { templateId: 'T-ELEVATOR', dueAt: '2026-11-03T09:00' }
    ])
  })

  it('birden çok şablonun planı vade ve şablon sırasıyla döner', () => {
    const weekly: TaskTemplatePlanInput = {
      id: 'T-A',
      rule: rule({ kind: 'weekly', weekdays: [1], time: '12:00' }),
      firstDue: from,
      active: true
    }
    const plan = materializePlan([daily, weekly], new Set(), dt('2026-10-05T00:00'), dt('2026-10-06T00:00'))
    expect(plan).toEqual([
      { templateId: 'T-A', dueAt: '2026-10-05T12:00' },
      { templateId: 'T-DAILY', dueAt: '2026-10-05T12:00' }
    ])
  })
})
