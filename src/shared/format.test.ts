import { describe, expect, it } from 'vitest'
import { money } from './money'
import { localDate } from './date'
import { collator, formatDate, formatMoney } from './format'

const nbsp = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ')

describe('biçimlendirme', () => {
  it('varsayılan tam sayı, istenirse kuruşlu; rakamlar her dilde Latin', () => {
    const m = money(250_000, 'TRY')
    expect(nbsp(formatMoney(m, 'tr'))).toBe('₺2.500')
    expect(nbsp(formatMoney(m, 'tr', { showMinor: true }))).toBe('₺2.500,00')
    expect(nbsp(formatMoney(money(250_000, 'EUR'), 'en'))).toBe('€2,500')
    expect(nbsp(formatMoney(money(250_000, 'RUB'), 'ru'))).toBe('2 500 ₽')
  })

  it('kuruş kapalıyken yalnız ",00" gizlenir; kuruşu olan tutar yuvarlanmadan kuruşuyla görünür (K-46)', () => {
    expect(nbsp(formatMoney(money(100_050, 'TRY'), 'tr'))).toBe('₺1.000,50')
    expect(nbsp(formatMoney(money(1_275, 'TRY'), 'tr'))).toBe('₺12,75')
    expect(nbsp(formatMoney(money(1_275, 'TRY'), 'en'))).toBe('₺12.75')
    expect(nbsp(formatMoney(money(-100_050, 'TRY'), 'ru'))).toBe('-1 000,50 ₺')
    expect(nbsp(formatMoney(money(100_000, 'TRY'), 'tr'))).toBe('₺1.000')
    expect(nbsp(formatMoney(money(1_000, 'JPY'), 'en'))).toBe('¥1,000')
  })

  it('tarihi üç dilde yazar', () => {
    const d = localDate('2026-03-15')
    expect(formatDate(d, 'tr')).toBe('15 Mart 2026')
    expect(formatDate(d, 'en')).toBe('15 March 2026')
    expect(formatDate(d, 'ru')).toBe('15 марта 2026 г.')
  })

  it('Türkçe sıralama İ/ı ve Ç/Ş harflerini doğru dizer', () => {
    const names = ['Şule', 'Ilgın', 'Çağrı', 'İpek', 'Cem', 'Sema']
    expect([...names].sort(collator('tr').compare)).toEqual(['Cem', 'Çağrı', 'Ilgın', 'İpek', 'Sema', 'Şule'])
  })
})
