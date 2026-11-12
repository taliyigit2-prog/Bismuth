import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import { previousPeriod, tourismReminder, tourismStartDay } from './today'

const on = { active: true, startDay: 1, reported: false }

describe('turizm istatistiği hatırlatıcısı (G-93)', () => {
  it("ayın 1'inde geçen ayın bildirimini hatırlatır; son gün 10'u, 9 gün kalır", () => {
    expect(tourismReminder(localDate('2026-11-01'), on)).toEqual({
      kind: 'tourism',
      period: '2026-10',
      dueDate: '2026-11-10',
      daysLeft: 9
    })
  })

  it("10'unda son gün olarak durur, 11'inde kalkar", () => {
    expect(tourismReminder(localDate('2026-11-10'), on)?.daysLeft).toBe(0)
    expect(tourismReminder(localDate('2026-11-11'), on)).toBeNull()
  })

  it('bildirildi işaretlenince ya da hatırlatıcı kapatılınca görünmez', () => {
    expect(tourismReminder(localDate('2026-11-02'), { ...on, reported: true })).toBeNull()
    expect(tourismReminder(localDate('2026-11-02'), { ...on, active: false })).toBeNull()
  })

  it('şablonun günü değiştiyse o günden başlar', () => {
    expect(tourismReminder(localDate('2026-11-02'), { ...on, startDay: 3 })).toBeNull()
    expect(tourismReminder(localDate('2026-11-03'), { ...on, startDay: 3 })?.period).toBe('2026-10')
  })

  it("başlangıç günü şablondan: son tarih 10'u 23:59 ve 1'i 09:00'dan hatırlatma → 1'i; eski şablon da 1'i", () => {
    expect(tourismStartDay({ kind: 'monthly', day: 10, time: '23:59' }, 9 * 1440 + 899)).toBe(1)
    expect(tourismStartDay({ kind: 'monthly', day: 1, time: '09:00' }, null)).toBe(1)
    expect(tourismStartDay({ kind: 'monthly', day: 10, time: '09:00' }, 5 * 1440)).toBe(5)
    expect(tourismStartDay({ kind: 'daily', time: '09:00' }, null)).toBe(1)
  })

  it('ocak ayında geçen yılın aralığını ister', () => {
    expect(previousPeriod(localDate('2027-01-05'))).toBe('2026-12')
    expect(tourismReminder(localDate('2027-01-05'), on)?.period).toBe('2026-12')
  })
})
