import { describe, expect, it } from 'vitest'
import { ownTaskSchema } from '@shared/contract/operations'
import { checkOwnTask, clearErrors, emptyOwnTask, ownTaskRule, type OwnTaskValues } from './own-task'

const values = (patch: Partial<OwnTaskValues>): OwnTaskValues => ({
  ...emptyOwnTask(),
  title: 'Lobideki çiçekleri sula',
  ...patch
})

describe('kendi göreviniz: cevaplar → tekrar kuralı', () => {
  it('her sıklık ortak kural biçimine döner; ayrı bir kural türü yok', () => {
    expect(ownTaskRule(values({ repeat: 'daily', time: '08:30' }))).toEqual({ kind: 'daily', time: '08:30' })
    // Days come Monday first whatever order they were picked in.
    expect(ownTaskRule(values({ repeat: 'weekly', weekdays: [0, 5, 1], time: '10:00' }))).toEqual({
      kind: 'weekly',
      weekdays: [1, 5, 0],
      time: '10:00'
    })
    expect(ownTaskRule(values({ repeat: 'monthly', monthDay: '15' }))).toEqual({
      kind: 'monthly',
      day: 15,
      time: '09:00'
    })
    // "Son gün" is day 31: short months fall on their last day (task-recurrence.ts).
    expect(ownTaskRule(values({ repeat: 'monthly', monthDay: 'last' }))).toEqual({
      kind: 'monthly',
      day: 31,
      time: '09:00'
    })
    expect(ownTaskRule(values({ repeat: 'months', everyMonths: '6', time: '11:00' }))).toEqual({
      kind: 'interval',
      unit: 'months',
      every: 6,
      time: '11:00'
    })
    expect(ownTaskRule(values({ repeat: 'yearly' }))).toEqual({
      kind: 'interval',
      unit: 'years',
      every: 1,
      time: '09:00'
    })
  })

  it('geçen her cevap sunucunun şemasından da geçer; başlık kırpılır', () => {
    const cases: Partial<OwnTaskValues>[] = [
      { repeat: 'daily' },
      { repeat: 'weekly', weekdays: [6] },
      { repeat: 'monthly', monthDay: '28' },
      { repeat: 'monthly', monthDay: 'last' },
      { repeat: 'months', everyMonths: '2' },
      { repeat: 'months', everyMonths: '24' },
      { repeat: 'yearly' }
    ]
    for (const patch of cases) {
      const checked = checkOwnTask(values({ ...patch, title: '  Kazanı kontrol et  ' }))
      expect(checked.errors).toBeNull()
      expect(checked.task?.title).toBe('Kazanı kontrol et')
      expect(ownTaskSchema.safeParse(checked.task).success).toBe(true)
    }
  })

  it('başlık boşsa, gün seçilmemişse, ay sayısı 2–24 dışındaysa ya da saat bozuksa ilgili alan uyarılır', () => {
    expect(checkOwnTask(values({ title: '   ' })).errors).toEqual({
      title: { key: 'tasks.own.titleRequired' }
    })
    expect(checkOwnTask(values({ title: 'x'.repeat(121) })).errors).toEqual({
      title: { key: 'tasks.own.titleTooLong', values: { max: 120 } }
    })
    expect(checkOwnTask(values({ repeat: 'weekly', weekdays: [] })).errors).toEqual({
      weekdays: { key: 'tasks.own.weekdaysRequired' }
    })
    for (const everyMonths of ['', '1', '25', '6a'])
      expect(checkOwnTask(values({ repeat: 'months', everyMonths })).errors).toEqual({
        everyMonths: { key: 'tasks.own.everyMonthsRange', values: { min: 2, max: 24 } }
      })
    expect(checkOwnTask(values({ time: '' })).errors).toEqual({ time: { key: 'tasks.own.timeInvalid' } })
    expect(checkOwnTask(values({ time: '24:00' })).errors).toEqual({ time: { key: 'tasks.own.timeInvalid' } })
    // Fields of another repeat are not checked.
    expect(checkOwnTask(values({ repeat: 'daily', weekdays: [], everyMonths: '' })).errors).toBeNull()
  })

  it('değişen alanın uyarısı kalkar; sıklık değişince günler ve ay sayısı uyarısı da gider', () => {
    const errors = {
      title: { key: 'tasks.own.titleRequired' as const },
      weekdays: { key: 'tasks.own.weekdaysRequired' as const },
      time: { key: 'tasks.own.timeInvalid' as const }
    }
    expect(clearErrors(errors, { title: 'a' })).toEqual({ weekdays: errors.weekdays, time: errors.time })
    expect(clearErrors(errors, { repeat: 'daily' })).toEqual({ title: errors.title, time: errors.time })
  })
})
