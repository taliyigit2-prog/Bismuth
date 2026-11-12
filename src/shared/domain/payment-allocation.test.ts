import { describe, expect, it } from 'vitest'
import { localDate as d } from '../date'
import { allocatePayments, creditedTotal, folioTotals, type CreditLike } from './payment-allocation'

const nights = [
  { id: 'n3', date: d('2026-10-03'), roomSort: 0, priceMinor: 200_000 },
  { id: 'n1', date: d('2026-10-01'), roomSort: 0, priceMinor: 200_000 },
  { id: 'n2', date: d('2026-10-02'), roomSort: 0, priceMinor: 200_000 }
]
const pay = (amount: number, kind: CreditLike['kind'] = 'payment', voided = false): CreditLike => ({
  kind,
  amountFolioMinor: amount * 100,
  voided
})
const statuses = (credits: CreditLike[]) => allocatePayments(nights, credits).map((a) => a.status)

describe('ödeme gecelere sırayla dağılır (§6.3, kabul ölçütü)', () => {
  it('6.000 borçlu 3 geceye 2.000 ödeme → 1. gece ödendi, 2–3 ödenmedi', () => {
    expect(statuses([pay(2000)])).toEqual(['paid', 'unpaid', 'unpaid'])
  })
  it('5.000 → 1–2 ödendi, 3 kısmen', () => {
    expect(statuses([pay(4000, 'deposit'), pay(1000)])).toEqual(['paid', 'paid', 'partial'])
  })
  it('6.000 → hepsi ödendi; 1.000 iade sonrası son gece kısmen', () => {
    expect(statuses([pay(6000)])).toEqual(['paid', 'paid', 'paid'])
    expect(statuses([pay(6000), pay(1000, 'refund')])).toEqual(['paid', 'paid', 'partial'])
  })
  it('iptal edilmiş ödeme sayılmaz; hiç ödeme yoksa hepsi ödenmedi', () => {
    expect(statuses([pay(6000, 'payment', true)])).toEqual(['unpaid', 'unpaid', 'unpaid'])
    expect(creditedTotal([pay(100, 'refund')])).toBe(-10_000)
    expect(statuses([pay(100, 'refund')])).toEqual(['unpaid', 'unpaid', 'unpaid'])
  })
  it('çok odalı rezervasyonda aynı gece önce ilk oda dolar', () => {
    const two = [
      { id: 'b1', date: d('2026-10-01'), roomSort: 1, priceMinor: 220_000 },
      { id: 'a1', date: d('2026-10-01'), roomSort: 0, priceMinor: 220_000 }
    ]
    const r = allocatePayments(two, [pay(3000)])
    expect(r.map((x) => [x.night.id, x.status, x.allocatedMinor])).toEqual([
      ['a1', 'paid', 220_000],
      ['b1', 'partial', 80_000]
    ])
  })
  it('bakiye = masraflar − ödemeler; iptal edilen masraf düşer', () => {
    expect(
      folioTotals(
        [{ amountMinor: 600_000 }, { amountMinor: 14_000 }, { amountMinor: 50_000, voided: true }],
        [pay(5000)]
      )
    ).toEqual({ chargesMinor: 614_000, creditedMinor: 500_000, balanceMinor: 114_000 })
  })
})
