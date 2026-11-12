import { describe, expect, it } from 'vitest'
import {
  colorMeaning,
  isBlankChoice,
  isMarked,
  looksLikeSamePerson,
  parseAmountMinor,
  parseCurrency,
  parseDayCell,
  parseReservationCell,
  splitName,
  titleCaseName
} from './import-cells'

describe('tutar ve para birimi (sahibin yazımı)', () => {
  it('binlik nokta, ondalık virgül ve döviz ondalığı doğru okunur', () => {
    expect(parseAmountMinor('2.500', 'TRY')).toBe(250_000)
    expect(parseAmountMinor('2500', 'TRY')).toBe(250_000)
    expect(parseAmountMinor('2.500,50', 'TRY')).toBe(250_050)
    expect(parseAmountMinor('2,500.50', 'TRY')).toBe(250_050)
    expect(parseAmountMinor('43.01 EURO', 'TRY')).toBe(4_301)
    expect(parseAmountMinor('35 euro', 'TRY')).toBe(3_500)
    expect(parseAmountMinor('₺1.000.000', 'TRY')).toBe(100_000_000)
    expect(parseAmountMinor('2500,5', 'TRY')).toBe(250_050)
    expect(parseAmountMinor('abc', 'TRY')).toBeNull()
    expect(parseAmountMinor('-50', 'TRY')).toBeNull()
    expect(parseAmountMinor('', 'TRY')).toBeNull()
  })

  it('hücredeki tutar yazılan ya da varsayılan para biriminin kuruş hanesiyle okunur', () => {
    expect(parseReservationCell('Tanaka Ken (3000 JPY)', 'TRY')).toMatchObject({
      guests: [{ priceMinor: 3_000, currency: 'JPY' }]
    })
    expect(parseReservationCell('Tanaka Ken (3000)', 'JPY')).toMatchObject({
      guests: [{ priceMinor: 3_000, currency: null }]
    })
    expect(parseReservationCell('Ali Veli (2500)', 'TRY')).toMatchObject({
      guests: [{ priceMinor: 250_000 }]
    })
    expect(parseAmountMinor('12,5', 'JPY')).toBeNull()
  })

  it('para birimi sözcükleri ve simgeleri ISO koduna döner', () => {
    expect(parseCurrency('TL')).toBe('TRY')
    expect(parseCurrency('Euro')).toBe('EUR')
    expect(parseCurrency('Dolar')).toBe('USD')
    expect(parseCurrency('Sterlin')).toBe('GBP')
    expect(parseCurrency('Ruble')).toBe('RUB')
    expect(parseCurrency('₺')).toBe('TRY')
    expect(parseCurrency('CHF')).toBe('CHF')
    expect(parseCurrency('kapora')).toBeNull()
  })
})

describe('gün başlığı', () => {
  it('tam tarih, kısa yıl ve ay ipucuyla yalnız gün numarası okunur', () => {
    expect(parseDayCell('01.10.2026')).toBe('2026-10-01')
    expect(parseDayCell('1/10/26')).toBe('2026-10-01')
    expect(parseDayCell('2026-10-31')).toBe('2026-10-31')
    expect(parseDayCell('3 (cts)', '2026-10')).toBe('2026-10-03')
    expect(parseDayCell('3.10', '2026-10')).toBe('2026-10-03')
    expect(parseDayCell('3', null)).toBeNull()
    expect(parseDayCell('31.02.2026')).toBeNull()
    expect(parseDayCell('ODA NO', '2026-10')).toBeNull()
  })
})

describe('misafir adı', () => {
  it('Türkçe büyük/küçük harfle düzeltilir ve ad/soyad ayrılır', () => {
    expect(titleCaseName('SEBAHATTİN SEVEN')).toBe('Sebahattin Seven')
    expect(titleCaseName('  ışıl   ılgaz ')).toBe('Işıl Ilgaz')
    expect(splitName('GÜRCAN KEMAL İNCİCİ')).toEqual({ firstName: 'Gürcan Kemal', lastName: 'İncici' })
    expect(splitName('TÜRKMEN')).toEqual({ firstName: 'Türkmen', lastName: '' })
  })

  it('aynı kişinin farklı yazımları olası tekrar sayılır, farklı kişiler sayılmaz', () => {
    expect(looksLikeSamePerson('Gadir Garibov', 'GADİR GADİROV')).toBe(true)
    expect(looksLikeSamePerson('Emil Aras', 'Elmir Aras')).toBe(false)
    expect(looksLikeSamePerson('Ali Yılmaz', 'ALİ YILMAZ')).toBe(false) // the same name, not a possible duplicate
  })
})

describe('rezervasyon hücresi', () => {
  it('ad, gecelik fiyat ve dövizi okur', () => {
    expect(parseReservationCell('FETHİ ERDEM (2500 TL)', 'TRY')).toEqual({
      kind: 'guests',
      guests: [{ name: 'Fethi Erdem', priceMinor: 250_000, currency: 'TRY', note: null }]
    })
    expect(parseReservationCell('Orsa Deniz (43.01 EURO)', 'TRY')).toMatchObject({
      guests: [{ name: 'Orsa Deniz', priceMinor: 4_301, currency: 'EUR' }]
    })
  })

  it('"sonra" ile aynı gün iki misafir ve fiyattan sonraki not ayrılır', () => {
    expect(
      parseReservationCell('SEBAHATTİN SEVEN (2500 TL) sonra Serdar Işık (2500 TL)', 'TRY')
    ).toMatchObject({
      guests: [{ name: 'Sebahattin Seven' }, { name: 'Serdar Işık', priceMinor: 250_000 }]
    })
    expect(parseReservationCell('Mert Kaya (1600 TL) sonra kirli', 'TRY')).toMatchObject({
      guests: [{ name: 'Mert Kaya', priceMinor: 160_000, note: 'sonra kirli' }]
    })
  })

  it('SATILMAZ oda bloğudur; boş ve hatalı hücreler ayrılır', () => {
    expect(parseReservationCell('SATILMAZ', 'TRY')).toEqual({ kind: 'blocked' })
    expect(parseReservationCell('  ', 'TRY')).toEqual({ kind: 'empty' })
    expect(parseReservationCell('(2500 TL)', 'TRY')).toEqual({ kind: 'invalid', reason: 'emptyName' })
    expect(parseReservationCell('Ali (25x00 TL)', 'TRY')).toEqual({ kind: 'invalid', reason: 'badAmount' })
    expect(parseReservationCell('Gökhan Çakır (kapora)', 'TRY')).toMatchObject({
      guests: [{ name: 'Gökhan Çakır', priceMinor: null, note: 'kapora' }]
    })
  })
})

describe('hücre rengi ve işaretler', () => {
  it('kırmızı ödendi, sarı ödenmedi, camgöbeği aynı gün, siyah satılmaz', () => {
    expect(colorMeaning('FFFF0000')).toBe('paid')
    expect(colorMeaning('#facc15')).toBe('unpaid')
    expect(colorMeaning('FF00FFFF')).toBe('dayuse')
    expect(colorMeaning('FF000000')).toBe('blocked')
    expect(colorMeaning('FF6A1B9A')).toBeNull()
    expect(colorMeaning(null)).toBeNull()
  })

  it('kasa "x" işareti ve "---" boş seçim tanınır', () => {
    expect(isMarked('x')).toBe(true)
    expect(isMarked('X ')).toBe(true)
    expect(isMarked('')).toBe(false)
    expect(isBlankChoice('---')).toBe(true)
    expect(isBlankChoice('Booking')).toBe(false)
  })
})
