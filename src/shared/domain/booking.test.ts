import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import { checkoutKbsGaps, checkoutPlan, splitFullName, suggestNightPrice, suggestStayPrices } from './booking'

const d = localDate
const PRICES = { baseMinor: 280_000, weekendMinor: 320_000 }
const WEEKEND = [6, 0]

describe('öneri fiyat (§6.2, G-48)', () => {
  it('hafta içi oda tipi fiyatı, cumartesi ve pazar hafta sonu fiyatı gelir', () => {
    // 2026-10-02 Friday, 03 Saturday, 04 Sunday, 05 Monday
    const nights = suggestStayPrices(d('2026-10-02'), d('2026-10-05'), PRICES, WEEKEND, new Set())
    expect(nights.map((n) => [n.date, n.priceMinor, n.reason])).toEqual([
      ['2026-10-02', 280_000, 'base'],
      ['2026-10-03', 320_000, 'weekend'],
      ['2026-10-04', 320_000, 'weekend']
    ])
  })

  it('özel gün (bayram) hafta içinde de hafta sonu fiyatını alır ve nedeni "özel gün" olur', () => {
    const special = new Set(['2026-10-29'])
    expect(suggestNightPrice(d('2026-10-29'), PRICES, WEEKEND, special)).toEqual({
      date: '2026-10-29',
      priceMinor: 320_000,
      reason: 'special'
    })
  })

  it('hafta sonu fiyatı yoksa her gece oda tipi fiyatı; oda tipinin fiyatı yoksa öneri yok', () => {
    const base = { baseMinor: 250_000, weekendMinor: null }
    expect(suggestNightPrice(d('2026-10-03'), base, WEEKEND, new Set())).toMatchObject({
      priceMinor: 250_000,
      reason: 'base'
    })
    expect(
      suggestNightPrice(d('2026-10-03'), { baseMinor: null, weekendMinor: null }, WEEKEND, new Set())
    ).toBe(null)
  })

  it('aynı gün giriş-çıkışta tek gün için öneri gelir', () => {
    expect(suggestStayPrices(d('2026-10-03'), d('2026-10-03'), PRICES, WEEKEND, new Set())).toHaveLength(1)
  })
})

describe('çıkışta KBS uyarısı (G-53)', () => {
  const people = [
    { id: 'a', fullName: 'Ayşe Örnek', kbsReportedAt: '2026-10-01T12:00:00Z' },
    { id: 'b', fullName: 'Bora Örnek', kbsReportedAt: '2026-10-01T12:00:00Z' },
    { id: 'c', fullName: 'Can Örnek', kbsReportedAt: null },
    {
      id: 'd',
      fullName: 'Deniz Örnek',
      kbsReportedAt: '2026-10-01T12:00:00Z',
      kbsCheckoutAt: '2026-10-02T09:00:00Z'
    }
  ]

  it('işaretlenmeyen kişi "KBS çıkışı yapılmadı", hiç bildirilmemiş kişi ayrı uyarı verir', () => {
    expect(checkoutKbsGaps(people, new Set(['a']))).toEqual([
      { occupantId: 'b', fullName: 'Bora Örnek', kind: 'checkout' },
      { occupantId: 'c', fullName: 'Can Örnek', kind: 'notReported' }
    ])
  })

  it('herkes işaretlenince uyarı kalmaz; bildirilmemiş kişi işaretlense de uyarı kalır', () => {
    expect(checkoutKbsGaps(people.slice(0, 2), new Set(['a', 'b']))).toEqual([])
    expect(checkoutKbsGaps([people[2]!], new Set(['c']))).toHaveLength(1)
  })
})

describe('ad soyad ayırma', () => {
  it('son sözcük soyadı olur; tek sözcük yalnız ad', () => {
    expect(splitFullName('  Ayşe Nur  Yılmaz ')).toEqual({ firstName: 'Ayşe Nur', lastName: 'Yılmaz' })
    expect(splitFullName('Elif')).toEqual({ firstName: 'Elif', lastName: '' })
  })
})

describe('çıkışta boşalan geceler (K-44)', () => {
  it('çıkış gününde ya da sonra gece boşalmaz; erken ayrılışta bugünden sonraki geceler boşalır', () => {
    expect(checkoutPlan({ checkIn: d('2026-10-01'), checkOut: d('2026-10-04') }, d('2026-10-04'))).toEqual({
      kind: 'onTime',
      released: []
    })
    expect(checkoutPlan({ checkIn: d('2026-10-01'), checkOut: d('2026-10-04') }, d('2026-10-02'))).toEqual({
      kind: 'early',
      released: ['2026-10-02', '2026-10-03']
    })
  })

  it('giriş günü ayrılan misafirin ilk gecesi o günün gündüz kullanımı olur, sonraki geceler boşalır', () => {
    expect(checkoutPlan({ checkIn: d('2026-10-01'), checkOut: d('2026-10-03') }, d('2026-10-01'))).toEqual({
      kind: 'sameDay',
      released: ['2026-10-02']
    })
    // A day-use leaves on its own day: nothing to free.
    expect(checkoutPlan({ checkIn: d('2026-10-01'), checkOut: d('2026-10-01') }, d('2026-10-01'))).toEqual({
      kind: 'onTime',
      released: []
    })
  })
})
