// §6.12 "sayılan konaklama" (P5fix #3, #19): the guest list, the guest card, the reservation panel and the new
// reservation form read the same rule — a stay that has begun by today; parked, no-show, cancelled and future ones
// are listed but not counted.
import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import { guestHistorySummary, isCountedStay, type HistoryStay } from './reports'

const stay = (id: string, checkIn: string, status: string, price: number, nights = 1): HistoryStay => ({
  reservationId: id,
  roomNumber: '501',
  checkIn: d(checkIn),
  checkOut: d(checkIn),
  status,
  nights: Array.from({ length: nights }, (_, i) => ({
    date: d(`${checkIn.slice(0, 8)}${String(Number(checkIn.slice(8)) + i).padStart(2, '0')}`),
    priceMinor: price,
    currency: 'TRY'
  })),
  paidMinor: price * nights,
  currency: 'TRY',
  methods: []
})

const TODAY = d('2026-10-01')

describe('sayılan konaklama (§6.12)', () => {
  it('bugüne kadar başlamış konaklama sayılır; gelecek, park, gelmedi ve iptal sayılmaz', () => {
    expect(isCountedStay({ status: 'checked_out', checkIn: d('2026-09-01') }, TODAY)).toBe(true)
    expect(isCountedStay({ status: 'checked_in', checkIn: TODAY }, TODAY)).toBe(true)
    expect(isCountedStay({ status: 'confirmed', checkIn: d('2026-09-30') }, TODAY)).toBe(true)
    expect(isCountedStay({ status: 'confirmed', checkIn: d('2026-11-01') }, TODAY)).toBe(false)
    for (const status of ['parked', 'no_show', 'cancelled'])
      expect(isCountedStay({ status, checkIn: d('2026-09-01') }, TODAY)).toBe(false)
  })

  it('son konaklama ve son gecelik fiyat ileri tarihli ya da park edilmiş rezervasyondan gelmez', () => {
    const s = guestHistorySummary(
      [
        stay('PAST', '2026-09-01', 'checked_out', 200_000, 2),
        stay('FUTURE', '2026-11-01', 'confirmed', 350_000, 2),
        { ...stay('PARKED', '2026-09-20', 'parked', 500_000), nights: [] }
      ],
      TODAY
    )
    expect(s.stays.map((x) => x.reservationId)).toEqual(['FUTURE', 'PARKED', 'PAST'])
    expect(s).toMatchObject({
      lastStayDate: '2026-09-01',
      lastNightly: { amountMinor: 200_000, currency: 'TRY' },
      averageNightly: { TRY: 200_000 },
      totalNights: 2,
      stayCount: 1
    })
    // Money taken stays money taken: a deposit for the coming stay is in the total paid.
    expect(s.totalSpent).toEqual({ TRY: 400_000 + 700_000 + 500_000 })
  })
})
