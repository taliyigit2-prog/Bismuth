import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  minorDigits,
  money,
  multiplyRatio,
  parseAmountText,
  parseMoney,
  roundToUnit,
  subtract,
  sum,
  toDecimalString
} from './money'

describe('Money', () => {
  it('kuruş hanesi ISO 4217 tablosundan gelir: eklenebilen her döviz doğru (JPY 0, TND 3, VND 0, CLF 4, TRY 2)', () => {
    expect(minorDigits('TRY')).toBe(2)
    expect(minorDigits('JPY')).toBe(0)
    expect(minorDigits('VND')).toBe(0)
    expect(minorDigits('CLP')).toBe(0)
    expect(minorDigits('TND')).toBe(3)
    expect(minorDigits('OMR')).toBe(3)
    expect(minorDigits('JOD')).toBe(3)
    expect(minorDigits('CLF')).toBe(4)
    expect(minorDigits('UAH')).toBe(2)
    expect(minorDigits('HUF')).toBe(2)
  })

  it('kayan sayıyı ve geçersiz para birimini reddeder', () => {
    expect(() => money(10.5, 'TRY')).toThrow(RangeError)
    expect(() => money(100, 'try')).toThrow(RangeError)
  })

  it('aynı para birimini toplar, farklıysa hata verir', () => {
    expect(add(money(250000, 'TRY'), money(50, 'TRY'))).toEqual(money(250050, 'TRY'))
    expect(() => add(money(1, 'TRY'), money(1, 'EUR'))).toThrow(TypeError)
    expect(subtract(money(100, 'USD'), money(250, 'USD')).amountMinor).toBe(-150)
    expect(sum([money(100, 'EUR'), money(200, 'EUR')], 'EUR').amountMinor).toBe(300)
  })

  it('Excel maaş formülü: 40.000 ÷ 30 × 4 izin = 5.333,33 TL (kuruş kesin)', () => {
    expect(multiplyRatio(money(4_000_000, 'TRY'), 4, 30).amountMinor).toBe(533_333)
    // 35.000 ÷ 30 × 2 = 2.333,33
    expect(multiplyRatio(money(3_500_000, 'TRY'), 2, 30).amountMinor).toBe(233_333)
  })

  it('yarım kuruşu sıfırdan uzağa yuvarlar', () => {
    expect(multiplyRatio(money(5, 'TRY'), 1, 2).amountMinor).toBe(3)
    expect(multiplyRatio(money(-5, 'TRY'), 1, 2).amountMinor).toBe(-3)
  })

  it('bölüştürme toplamı her zaman korur (10.000 → 3 gece)', () => {
    const parts = allocate(money(1_000_000, 'TRY'), [1, 1, 1])
    expect(parts.map((p) => p.amountMinor)).toEqual([333_334, 333_333, 333_333])
    expect(parts.reduce((a, p) => a + p.amountMinor, 0)).toBe(1_000_000)
  })

  it('yazılan tutarı Türkçe ve İngilizce biçimde kuruşa çevirir', () => {
    expect(parseMoney('2.500,50', 'TRY').amountMinor).toBe(250_050)
    expect(parseMoney('2500', 'TRY').amountMinor).toBe(250_000)
    expect(parseMoney('2,500.5', 'USD', '.').amountMinor).toBe(250_050)
    expect(parseMoney('-10', 'EUR').amountMinor).toBe(-1000)
    expect(() => parseMoney('12,345', 'TRY')).toThrow(RangeError)
    expect(() => parseMoney('abc', 'TRY')).toThrow(RangeError)
  })

  it("tek noktalı 1-2 haneli yazım ondalıktır, 3'lü gruplar binliktir (1250.5 asla 12.505 olmaz)", () => {
    const tr = (t: string): number => parseMoney(t, 'TRY').amountMinor
    expect(tr('1250.5')).toBe(125_050)
    expect(tr('1250.50')).toBe(125_050)
    expect(tr('1.250,50')).toBe(125_050)
    expect(tr('1.250')).toBe(125_000)
    expect(tr('1.250.000')).toBe(125_000_000)
    expect(tr('1250,5')).toBe(125_050)
    expect(tr('0.5')).toBe(50)
    expect(() => parseMoney('0.500', 'TRY')).toThrow(RangeError)
    expect(tr('12.5')).toBe(1_250)
    expect(() => parseMoney('1,250.50', 'TRY')).toThrow(RangeError)
    expect(() => parseMoney('1.25.5', 'TRY')).toThrow(RangeError)
    expect(() => parseMoney('1.2345', 'TRY')).toThrow(RangeError)
    expect(() => parseMoney('1,5,5', 'TRY')).toThrow(RangeError)
    expect(parseMoney('1,250.50', 'USD', '.').amountMinor).toBe(125_050)
    expect(parseMoney('1250.5', 'USD', '.').amountMinor).toBe(125_050)
    expect(parseMoney('1,250', 'USD', '.').amountMinor).toBe(125_000)
    expect(parseMoney('12,5', 'USD', '.').amountMinor).toBe(1_250)
    expect(() => parseMoney('1.250,50', 'USD', '.')).toThrow(RangeError)
  })

  it('tablodan içe aktarma yolu (parseAmountText) yazım kuralından etkilenmez', () => {
    expect(parseAmountText('1.250,50', 'TRY')?.amountMinor).toBe(125_050)
    expect(parseAmountText('1,250.50', 'TRY')?.amountMinor).toBe(125_050)
    expect(parseAmountText('1250.5', 'TRY')?.amountMinor).toBe(125_050)
    expect(parseAmountText('1.250', 'TRY')?.amountMinor).toBe(125_000)
  })

  it('tablodaki tutar para biriminin kendi kuruş hanesiyle okunur (yen kuruşsuz, dinar üç haneli)', () => {
    expect(parseAmountText('2.500', 'TRY')).toEqual({ amountMinor: 250_000, currency: 'TRY' })
    expect(parseAmountText('2.500,50 TL', 'TRY')?.amountMinor).toBe(250_050)
    expect(parseAmountText('2500,5', 'EUR')?.amountMinor).toBe(250_050)
    expect(parseAmountText('3.000', 'JPY')?.amountMinor).toBe(3_000)
    expect(parseAmountText('1500', 'JPY')?.amountMinor).toBe(1_500)
    expect(parseAmountText('12,5', 'JPY')).toBeNull()
    expect(parseAmountText('1,250', 'KWD')?.amountMinor).toBe(1_250_000)
    expect(parseAmountText('3,25', 'KWD')?.amountMinor).toBe(3_250)
    expect(parseAmountText('2500,505', 'TRY')).toBeNull()
    expect(parseAmountText('-50', 'TRY')).toBeNull()
    expect(parseAmountText('abc', 'TRY')).toBeNull()
    expect(parseAmountText('99999999999999999999', 'TRY')).toBeNull()
  })

  it('ondalık metni kayan sayı kullanmadan üretir', () => {
    expect(toDecimalString(money(250_050, 'TRY'))).toBe('2500.50')
    expect(toDecimalString(money(-5, 'TRY'))).toBe('-0.05')
    expect(toDecimalString(money(1500, 'JPY'))).toBe('1500')
  })

  it('tam birime yuvarlar: yarım sıfırdan uzağa, eksi tutar simetrik (₺2.347,50 → ₺2.348; onluk → ₺2.350)', () => {
    expect(roundToUnit(money(234_750, 'TRY'), 100)).toEqual(money(234_800, 'TRY'))
    expect(roundToUnit(money(234_749, 'TRY'), 100)).toEqual(money(234_700, 'TRY'))
    expect(roundToUnit(money(234_750, 'TRY'), 1_000)).toEqual(money(235_000, 'TRY'))
    expect(roundToUnit(money(-150, 'EUR'), 100)).toEqual(money(-200, 'EUR'))
    expect(roundToUnit(money(-149, 'EUR'), 100)).toEqual(money(-100, 'EUR'))
    expect(roundToUnit(money(-10, 'EUR'), 100).amountMinor).toBe(0)
    expect(roundToUnit(money(1_235, 'JPY'), 10)).toEqual(money(1_240, 'JPY'))
    expect(roundToUnit(money(5_089, 'USD'), 1)).toEqual(money(5_089, 'USD'))
    expect(() => roundToUnit(money(1, 'TRY'), 0)).toThrow(RangeError)
    expect(() => roundToUnit(money(1, 'TRY'), 2.5)).toThrow(RangeError)
  })
})
