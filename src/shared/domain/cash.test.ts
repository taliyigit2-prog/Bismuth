import { describe, expect, it } from 'vitest'
import { cashPanel, expensesBase, revenueBase, sortDayRows, type PaymentRowLike } from './cash'

const p = (o: Partial<PaymentRowLike>): PaymentRowLike => ({
  kind: 'payment',
  amountMinor: 0,
  currency: 'TRY',
  methodGroup: 'cash',
  isCash: true,
  collected: false,
  ...o
})

describe('ciro ve kasa (G-62…G-64, 02-excel-analizi §1.1)', () => {
  // Ekim: KK 26.300 + İban 1.000 + x'li nakit 10.000 = 37.300 (Yıllık Özet'teki Ekim cirosu)
  const october = [
    p({ amountMinor: 2_630_000, amountBaseMinor: 2_630_000, methodGroup: 'card', isCash: false }),
    p({
      amountMinor: 100_000,
      amountBaseMinor: 100_000,
      methodGroup: 'bank',
      isCash: false,
      channelCode: 'airbnb'
    }),
    p({ amountMinor: 1_000_000, amountBaseMinor: 1_000_000, collected: true })
  ]

  it('"x" ciroyu etkilemez: Ekim cirosu 37.300', () => {
    expect(revenueBase(october)).toEqual({ totalMinor: 3_730_000, missingRate: 0 })
  })

  it('kasa paneli teslim alınmamış tutarları ve kasadaki nakdi gösterir', () => {
    const panel = cashPanel(
      [
        ...october,
        p({ amountMinor: 50_000, currency: 'EUR' }),
        p({ amountMinor: 20_000, kind: 'refund' }),
        p({ amountMinor: 99_999, voided: true })
      ],
      [
        { amountMinor: 30_000, currency: 'TRY', paidFromDrawer: true, settled: false },
        { amountMinor: 999, currency: 'TRY', paidFromDrawer: true, settled: true },
        { amountMinor: 777, currency: 'TRY', paidFromDrawer: false, settled: false }
      ]
    )
    expect(panel.pending).toEqual({
      TRY: { card: 2_630_000, bank: 100_000, cash: -20_000 },
      EUR: { cash: 50_000 }
    })
    expect(panel.drawer).toEqual({ TRY: -50_000, EUR: 50_000 })
    expect(panel.channels).toEqual({ airbnb: { TRY: 100_000 } })
  })

  it('kuru bilinmeyen kayıt sayılır ama toplama eklenmez; gün satırları nakit → havale → kart sırasında', () => {
    expect(revenueBase([p({ amountMinor: 100, amountBaseMinor: null })])).toEqual({
      totalMinor: 0,
      missingRate: 1
    })
    expect(
      expensesBase([
        { amountMinor: 5, currency: 'TRY', paidFromDrawer: false, settled: false, amountBaseMinor: 5 },
        { amountMinor: 5, currency: 'EUR', paidFromDrawer: false, settled: false, amountBaseMinor: null },
        {
          amountMinor: 9,
          currency: 'TRY',
          paidFromDrawer: false,
          settled: false,
          amountBaseMinor: 9,
          voided: true
        }
      ])
    ).toEqual({ totalMinor: 5, missingRate: 1 })
    const rows = sortDayRows([
      { id: 'k', methodGroup: 'card' as const, at: '09:00' },
      { id: 'n2', methodGroup: 'cash' as const, at: '11:00' },
      { id: 'h', methodGroup: 'bank' as const, at: '08:00' },
      { id: 'n1', methodGroup: 'cash' as const, at: '10:00' }
    ])
    expect(rows.map((r) => r.id)).toEqual(['n1', 'n2', 'h', 'k'])
  })
})
