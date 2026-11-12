import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { fieldLimits, limitsOf, maxLengthOf } from './limits'
import { contactInputSchema, laundryDeliveryItemSchema, productInputSchema } from './supply'
import { taskTemplateInputSchema } from './operations'
import { everyNStaysSchema, intervalEverySchema, recurrenceRuleInputSchema } from '../domain/task-recurrence'

describe('alan sınırları sözleşme şemasından okunur', () => {
  it('metin: optional / nullish / trim / dönüşüm katmanlarının altındaki en uzun boy', () => {
    expect(limitsOf(contactInputSchema)).toMatchObject({
      name: { maxLength: 120 },
      address: { maxLength: 500 },
      note: { maxLength: 1000 },
      customCategory: { maxLength: 60 }
    })
    expect(maxLengthOf(productInputSchema.shape.name)).toBe(120)
  })

  it('sayı: alt/üst sınır ve tam sayı', () => {
    expect(fieldLimits(laundryDeliveryItemSchema.shape.qty)).toEqual({ min: 0, max: 100_000, integer: true })
    expect(fieldLimits(taskTemplateInputSchema.shape.remindMinutesBefore)).toEqual({
      min: 0,
      max: 525_600,
      integer: true
    })
    expect(fieldLimits(z.number().optional())).toEqual({})
  })

  it('sınırı olmayan metinde maxLengthOf hata verir (formda unutulmuş sınır sessiz geçmez)', () => {
    expect(() => maxLengthOf(z.string())).toThrow()
  })

  it('"Her N konaklamada" Görevler ve Bakım için aynı: 1–500; sıklık 1–999', () => {
    expect(fieldLimits(everyNStaysSchema)).toEqual({ min: 1, max: 500, integer: true })
    expect(fieldLimits(intervalEverySchema)).toEqual({ min: 1, max: 999, integer: true })
    const n = (value: number) =>
      recurrenceRuleInputSchema.safeParse({ kind: 'everyNStays', n: value }).success
    expect([n(1), n(500), n(0), n(-1), n(501), n(1_000_000), n(1.5)]).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false
    ])
    const add = (every: number) =>
      taskTemplateInputSchema.safeParse({
        title: 'Klima filtresi',
        kind: 'maintenance',
        recurrence: { kind: 'interval', unit: 'months', every, time: '10:00' }
      }).success
    expect([add(999), add(1000)]).toEqual([true, false])
  })
})
