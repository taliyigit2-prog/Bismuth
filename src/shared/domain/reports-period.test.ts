import { describe, expect, it } from 'vitest'
import { localDate as d, type LocalDate } from '../date'
import {
  addMonths,
  comparisonPeriod,
  forEachSellableDay,
  heatKey,
  monthsIn,
  presetPeriod,
  previousPeriod,
  sameLastYear,
  type CapacityChange
} from './reports-period'

describe('rapor dönemleri (G-104)', () => {
  it('bu ay, geçen ay ve bu yıl bugüne göre bulunur', () => {
    const today = d('2026-10-05')
    expect(presetPeriod('thisMonth', today)).toEqual({ from: '2026-10-01', to: '2026-11-01' })
    expect(presetPeriod('lastMonth', today)).toEqual({ from: '2026-09-01', to: '2026-10-01' })
    expect(presetPeriod('thisYear', today)).toEqual({ from: '2026-01-01', to: '2027-01-01' })
    expect(presetPeriod('lastMonth', d('2026-01-15'))).toEqual({ from: '2025-12-01', to: '2026-01-01' })
  })

  it('önceki dönem: tam aylarsa aynı sayıda ay, değilse aynı sayıda gün önce', () => {
    expect(previousPeriod({ from: d('2026-03-01'), to: d('2026-04-01') })).toEqual({
      from: '2026-02-01',
      to: '2026-03-01'
    })
    expect(previousPeriod({ from: d('2026-01-01'), to: d('2027-01-01') })).toEqual({
      from: '2025-01-01',
      to: '2026-01-01'
    })
    expect(previousPeriod({ from: d('2026-10-10'), to: d('2026-10-20') })).toEqual({
      from: '2026-09-30',
      to: '2026-10-10'
    })
  })

  it('geçen yıl aynı dönem; 29 Şubat 28 Şubat olur', () => {
    expect(sameLastYear({ from: d('2026-09-01'), to: d('2026-10-01') })).toEqual({
      from: '2025-09-01',
      to: '2025-10-01'
    })
    expect(comparisonPeriod({ from: d('2028-02-29'), to: d('2028-03-01') }, 'lastYear')).toEqual({
      from: '2027-02-28',
      to: '2027-03-01'
    })
    expect(comparisonPeriod({ from: d('2026-09-01'), to: d('2026-10-01') }, 'none')).toBeNull()
  })

  it('ay listesi ve ay ekleme yıl sınırını geçer', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthsIn({ from: d('2026-11-15'), to: d('2027-02-01') })).toEqual([
      '2026-11',
      '2026-12',
      '2027-01'
    ])
  })
})

describe('satılabilir gece (K-27, G-38)', () => {
  const count = (
    changes: CapacityChange[],
    blocks: { roomId: string; dateFrom: LocalDate; dateTo: LocalDate }[],
    from: string,
    to: string
  ): number => {
    let n = 0
    forEachSellableDay(
      [
        { id: 'a', active: true, sellable: true },
        { id: 'b', active: true, sellable: true }
      ],
      changes,
      blocks,
      { from: d(from), to: d(to) },
      () => n++
    )
    return n
  }

  it('iki oda × 30 gün = 60; satılmaz blok paydadan düşer', () => {
    expect(count([], [], '2026-09-01', '2026-10-01')).toBe(60)
    expect(
      count(
        [],
        [{ roomId: 'a', dateFrom: d('2026-09-28'), dateTo: d('2026-10-05') }],
        '2026-09-01',
        '2026-10-01'
      )
    ).toBe(57)
  })

  it("kapasite geçmişi: oda 15 Eylül'de açılır, 20 Eylül'de satıştan kalkar", () => {
    const changes: CapacityChange[] = [
      { roomId: 'a', validFrom: d('2026-09-15'), active: true, sellable: true, createdAt: '1' },
      { roomId: 'a', validFrom: d('2026-09-20'), active: true, sellable: false, createdAt: '2' },
      { roomId: 'b', validFrom: d('2026-01-01'), active: true, sellable: true, createdAt: '1' },
      // Same day: the later change wins (opened again).
      { roomId: 'b', validFrom: d('2026-09-10'), active: false, sellable: true, createdAt: '2' },
      { roomId: 'b', validFrom: d('2026-09-10'), active: true, sellable: true, createdAt: '3' }
    ]
    expect(count(changes, [], '2026-09-01', '2026-10-01')).toBe(5 + 30)
  })

  it('ısı haritası anahtarı ay ve haftanın günüdür (0 = pazar)', () => {
    expect(heatKey(d('2026-10-04'))).toBe('2026-10|0')
    expect(heatKey(d('2026-10-10'))).toBe('2026-10|6')
  })
})
