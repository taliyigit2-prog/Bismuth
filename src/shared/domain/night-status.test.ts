import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import { deriveFolioNights, deriveNightStatus } from './night-status'

const TODAY = localDate('2026-10-04')
const d = (s: string) => localDate(s)

describe('deriveNightStatus (takvim hücresinin tek kaynağı)', () => {
  it('boş hücre: bugünden önce gri (geçmiş tarih, boş), bugün ve sonrası beyaz (boş)', () => {
    expect(deriveNightStatus({ date: d('2026-10-03'), pay: null }, TODAY)).toBe('pastEmpty')
    expect(deriveNightStatus({ date: TODAY, pay: null }, TODAY)).toBe('empty')
    expect(deriveNightStatus({ date: d('2026-10-05'), pay: null }, TODAY)).toBe('empty')
  })

  it('blok satılmazdır; dolu gece geçmişte de ödeme durumunu gösterir; gündüz kullanımı "aynı gün"', () => {
    expect(deriveNightStatus({ date: d('2026-10-01'), pay: null, blocked: true }, TODAY)).toBe('blocked')
    expect(deriveNightStatus({ date: d('2026-10-01'), pay: 'unpaid' }, TODAY)).toBe('unpaid')
    expect(deriveNightStatus({ date: TODAY, pay: 'paid', dayUse: true }, TODAY)).toBe('dayuse')
  })
})

describe('deriveFolioNights (§6.3)', () => {
  const nights = ['2026-10-04', '2026-10-05', '2026-10-06'].map((date, i) => ({
    id: `n${i}`,
    date: d(date),
    roomSort: 0,
    priceMinor: 200_000,
    dayUse: false
  }))

  it('ödeme 2000 ise ilk gece ödendi, diğerleri ödenmedi; 5000 ise son gece kısmen', () => {
    const two = deriveFolioNights(nights, [{ kind: 'payment', amountFolioMinor: 200_000 }], TODAY)
    expect(nights.map((n) => two.get(n.id)?.pay)).toEqual(['paid', 'unpaid', 'unpaid'])
    const five = deriveFolioNights(nights, [{ kind: 'deposit', amountFolioMinor: 500_000 }], TODAY)
    expect(nights.map((n) => five.get(n.id)?.status)).toEqual(['paid', 'paid', 'partial'])
    expect(five.get('n2')?.allocatedMinor).toBe(100_000)
  })

  it('iptal edilen ödeme sayılmaz; gündüz kullanımı gecesi "aynı gün" durumunu alır', () => {
    const voided = deriveFolioNights(
      nights,
      [{ kind: 'payment', amountFolioMinor: 600_000, voided: true }],
      TODAY
    )
    expect(voided.get('n0')?.pay).toBe('unpaid')
    const day = deriveFolioNights([{ ...nights[0]!, dayUse: true }], [], TODAY)
    expect(day.get('n0')).toEqual({ pay: 'unpaid', status: 'dayuse', allocatedMinor: 0 })
  })
})
