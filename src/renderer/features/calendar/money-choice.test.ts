import { describe, expect, it } from 'vitest'
import { moneyChoiceProblem, type MoneyChoice } from './money-choice'

const refund = (amountMinor: number, currency: string): MoneyChoice => ({
  mode: 'refund',
  amount: { amountMinor, currency },
  methodId: '',
  note: ''
})

describe('iade tavanı kontrolü para birimine bakar', () => {
  it('aynı para biriminde tahsilattan fazla iade reddedilir', () => {
    expect(moneyChoiceProblem(refund(150_001, 'TRY'), 150_000, 'TRY')).toBe('booking.refund.tooMuch')
    expect(moneyChoiceProblem(refund(150_000, 'TRY'), 150_000, 'TRY')).toBeNull()
  })

  it('farklı para biriminde istemci tavanı karşılaştırmaz (asıl kontrol serviste)', () => {
    expect(moneyChoiceProblem(refund(200_000, 'EUR'), 150_000, 'TRY')).toBeNull()
  })

  it('tutar yoksa ya da sıfırsa para birimi fark etmeden reddedilir', () => {
    expect(moneyChoiceProblem(refund(0, 'EUR'), 150_000, 'TRY')).toBe('booking.refund.needAmount')
  })
})
