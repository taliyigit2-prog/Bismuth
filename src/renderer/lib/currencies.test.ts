import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCALE_TAG, type AppLocale } from '@shared/format'
import { COMMON_CURRENCIES, allCurrencies, chipCurrencies, currencyName, matchCurrencies } from './currencies'

afterEach(() => vi.restoreAllMocks())

const codes = (lang: AppLocale): string[] => allCurrencies(lang).map((o) => o.code)

describe('para birimi listesi', () => {
  it('yaygın liste eski çiplerin hepsini korur ve platformun bildiği her kodla bulunur', () => {
    for (const code of ['TRY', 'EUR', 'USD', 'GBP', 'RUB', 'CHF', 'AZN', 'GEL', 'KZT', 'UAH', 'SAR', 'AED'])
      expect(COMMON_CURRENCIES).toContain(code)
    expect(COMMON_CURRENCIES.length).toBeLessThanOrEqual(16)
    expect(new Set(COMMON_CURRENCIES).size).toBe(COMMON_CURRENCIES.length)
    expect(codes('tr')).toEqual(expect.arrayContaining([...COMMON_CURRENCIES]))
  })

  it('TRY, EUR, USD ve JPY gibi yaygın olmayan kodlar da listede; her kod üç harfli ve bir kez geçer', () => {
    const all = codes('tr')
    expect(all).toEqual(expect.arrayContaining(['TRY', 'EUR', 'USD', 'JPY', 'PLN', 'CNY', 'KWD']))
    expect(all.length).toBeGreaterThan(100)
    expect(all.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })

  it('para olmayan ve kullanımdan kalkmış kodlar listelenmez', () => {
    const all = codes('en')
    for (const code of ['XDR', 'XSU', 'HRK', 'CUC', 'SLL', 'ZWL']) expect(all).not.toContain(code)
  })

  it('adlar arayüz dilinde gelir: Japon yeni / Japanese yen / японская иена', () => {
    const name = (lang: AppLocale, code: string): string =>
      allCurrencies(lang).find((o) => o.code === code)!.name
    expect(name('tr', 'JPY')).toMatch(/yeni/i)
    expect(name('en', 'JPY')).toMatch(/yen/i)
    expect(name('ru', 'JPY')).toMatch(/иена/i)
    expect(name('tr', 'TRY')).toBe(currencyName('TRY', 'tr'))
    expect(currencyName('TRY', 'ru')).toMatch(/лира/i)
  })

  it.each(['tr', 'en', 'ru'] as const)('liste %s adına göre o dilin sıralamasıyla dizilir', (lang) => {
    const sorter = new Intl.Collator(LOCALE_TAG[lang])
    const names = allCurrencies(lang).map((o) => o.name)
    expect(names).toEqual([...names].sort((a, b) => sorter.compare(a, b)))
  })

  it('Türkçe sıralamada "Ç" ile başlayan ad "D" ile başlayandan önce gelir (sona atılmaz)', () => {
    const names = allCurrencies('tr').map((o) => o.name)
    const firstC = names.findIndex((n) => n.startsWith('Ç'))
    const firstD = names.findIndex((n) => n.startsWith('D'))
    expect(firstC).toBeGreaterThan(-1)
    expect(firstC).toBeLessThan(firstD)
  })

  it('platform listeyi veremezse yaygın listeyle devam eder', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
      throw new RangeError('unsupported')
    })
    expect(codes('tr').sort()).toEqual([...COMMON_CURRENCIES].sort())
  })

  it('platform boş liste verirse de yaygın liste kalır', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([])
    expect(codes('en').sort()).toEqual([...COMMON_CURRENCIES].sort())
  })

  it('adı bilinmeyen kod adının yerine kodun kendisiyle gösterilir', () => {
    expect(currencyName('QQQ', 'tr')).toBe('QQQ')
  })
})

describe('çipler', () => {
  it('önce yaygın para birimleri, sonra oteldeki ve eklenenler; tekrar yok', () => {
    expect(chipCurrencies(['JPY', 'TRY'], ['PLN', 'JPY'])).toEqual([...COMMON_CURRENCIES, 'JPY', 'PLN'])
    expect(chipCurrencies()).toEqual([...COMMON_CURRENCIES])
  })
})

describe('para birimi arama', () => {
  const tr = allCurrencies('tr')
  const found = (query: string, lang: AppLocale = 'tr', hidden: string[] = []): string[] =>
    matchCurrencies(allCurrencies(lang), query, hidden).map((o) => o.code)

  it('"yen" yazınca Japon yeni bulunur; "jpy" kodla da bulunur', () => {
    expect(found('yen')).toContain('JPY')
    expect(found('jpy')).toEqual(['JPY'])
    expect(found('JPY')).toEqual(['JPY'])
  })

  it('tam kod en başta gelir, sonra koda göre başlayanlar, sonra ada göre eşleşenler', () => {
    const result = found('us')
    expect(result[0]).toBe('USD')
    expect(found('try')[0]).toBe('TRY')
    const idx = (code: string): number => found('ar').indexOf(code)
    expect(idx('ARS')).toBeGreaterThan(-1)
    // Codes starting with "AR" come before names that merely contain it.
    expect(idx('ARS')).toBeLessThan(idx('SAR'))
  })

  it('Türkçe harfler ve büyük/küçük harf farkı aranmaz: "turk" Türk lirasını, "ÇİN" Çin yuanını bulur', () => {
    expect(found('turk')).toContain('TRY')
    expect(found('TÜRK')).toContain('TRY')
    expect(found('çin')).toContain('CNY')
    expect(found('cin')).toContain('CNY')
  })

  it('Rusça adla aranır: "иена" yeni, "лира" lirayı bulur; büyük harf fark etmez', () => {
    expect(found('иена', 'ru')).toContain('JPY')
    expect(found('ЛИРА', 'ru')).toContain('TRY')
  })

  it('zaten çip olarak görünen kodlar listede yer almaz', () => {
    expect(found('yen', 'tr', ['JPY'])).not.toContain('JPY')
    const all = matchCurrencies(tr, '', ['TRY', 'EUR'])
    expect(all.map((o) => o.code)).not.toContain('TRY')
    expect(all).toHaveLength(tr.length - 2)
  })

  it('boş arama hepsini adına göre döker; eşleşme yoksa boş liste', () => {
    expect(matchCurrencies(tr, '   ')).toEqual(tr)
    expect(found('zzzzqq')).toEqual([])
  })
})
