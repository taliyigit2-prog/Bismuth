import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import {
  adrMinor,
  basisPoints,
  guestHistorySummary,
  occupancyBasisPoints,
  revparMinor,
  topExpenses
} from './reports'

describe('rapor oranları (§6.10)', () => {
  it('doluluk baz puan olarak; bakanlık örneği 840 ÷ (38 × 30) = %73,68', () => {
    expect(basisPoints(840, 38 * 30)).toBe(7368)
    expect(occupancyBasisPoints({ soldNights: 285, sellableNights: 19 * 30 })).toBe(5000)
    expect(basisPoints(1, 0)).toBe(0)
  })
  it('ADR ve RevPAR kuruş olarak yuvarlanır', () => {
    expect(adrMinor(1_000_000, 3, 'TRY')).toBe(333_333)
    expect(revparMinor(1_000_000, 6, 'TRY')).toBe(166_667)
    expect(adrMinor(5, 0, 'TRY')).toBe(0)
    expect(revparMinor(5, 0, 'TRY')).toBe(0)
  })
})

describe('"en çok ne harcadım" (§6.10, G-66)', () => {
  it('personel tek grup, ürün satırları kategoriye, kalanlar açıklamaya göre toplanır', () => {
    const groups = topExpenses([
      { amountBaseMinor: 4_000_000, description: 'deniz maaş', descriptionKey: 'deniz maas', kind: 'staff' },
      { amountBaseMinor: 400_000, description: 'deniz 4 izin parası', descriptionKey: 'x', kind: 'staff' },
      {
        amountBaseMinor: 50_000,
        description: 'İş güvenliği',
        descriptionKey: 'is guvenligi',
        kind: 'manual'
      },
      {
        amountBaseMinor: 30_000,
        description: 'iş güvenliği',
        descriptionKey: 'is guvenligi',
        kind: 'manual'
      },
      {
        amountBaseMinor: 260_000,
        description: 'sucu',
        descriptionKey: 'sucu',
        kind: 'manual',
        items: [{ productCategoryId: 'water', amountBaseMinor: 240_000 }]
      },
      { amountBaseMinor: 120_000, description: 'çamaşırhane eylül', descriptionKey: 'c', kind: 'laundry' }
    ])
    expect(groups).toEqual([
      { kind: 'staff', totalMinor: 4_400_000 },
      { kind: 'category', categoryId: 'water', totalMinor: 240_000 },
      { kind: 'laundry', totalMinor: 120_000 },
      { kind: 'description', key: 'is guvenligi', label: 'İş güvenliği', totalMinor: 80_000 },
      { kind: 'description', key: 'sucu', label: 'sucu', totalMinor: 20_000 }
    ])
  })
})

describe('misafir fiyat geçmişi (§6.12, G-190)', () => {
  it('son konaklama, son gecelik fiyat, ortalama ve toplam; iptal edilen sayılmaz', () => {
    const s = guestHistorySummary(
      [
        {
          reservationId: 'R1',
          roomNumber: '501',
          checkIn: d('2026-03-01'),
          checkOut: d('2026-03-03'),
          status: 'checked_out',
          nights: [
            { date: d('2026-03-01'), priceMinor: 200_000, currency: 'TRY' },
            { date: d('2026-03-02'), priceMinor: 250_000, currency: 'TRY' }
          ],
          paidMinor: 450_000,
          currency: 'TRY',
          methods: ['cash']
        },
        {
          reservationId: 'R2',
          roomNumber: '502',
          checkIn: d('2026-09-10'),
          checkOut: d('2026-09-11'),
          status: 'checked_out',
          nights: [{ date: d('2026-09-10'), priceMinor: 300_000, currency: 'TRY' }],
          paidMinor: 300_000,
          currency: 'TRY',
          methods: ['card']
        },
        {
          reservationId: 'R3',
          roomNumber: '101',
          checkIn: d('2026-10-10'),
          checkOut: d('2026-10-11'),
          status: 'cancelled',
          nights: [{ date: d('2026-10-10'), priceMinor: 999_900, currency: 'TRY' }],
          paidMinor: 0,
          currency: 'TRY',
          methods: []
        }
      ],
      d('2026-10-01')
    )
    expect(s.stays.map((x) => x.reservationId)).toEqual(['R3', 'R2', 'R1'])
    expect(s.lastStayDate).toBe('2026-09-10')
    expect(s.lastNightly).toEqual({ amountMinor: 300_000, currency: 'TRY' })
    expect(s.averageNightly).toEqual({ TRY: 250_000 })
    expect(s.totalSpent).toEqual({ TRY: 750_000 })
    expect(s.totalNights).toBe(3)
    expect(guestHistorySummary([], d('2026-10-01')).lastNightly).toBeNull()
  })
})
