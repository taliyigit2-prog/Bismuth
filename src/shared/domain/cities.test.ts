import { describe, expect, it } from 'vitest'
import { CITIES, DEFAULT_CITY, cityKey, cityLabel, findCity } from './cities'

describe('hava durumu için şehir listesi (G-113)', () => {
  it('81 il merkezi ve ilçeler; her koordinat iki ondalıklı ve Türkiye sınırları içinde', () => {
    expect(CITIES.filter((c) => !c.province)).toHaveLength(81)
    for (const c of CITIES) {
      expect(c.lat, c.name).toBeGreaterThan(35.5)
      expect(c.lat, c.name).toBeLessThan(42.2)
      expect(c.lon, c.name).toBeGreaterThan(25.5)
      expect(c.lon, c.name).toBeLessThan(45)
      expect(Math.round(c.lat * 100) / 100).toBe(c.lat)
    }
    expect(DEFAULT_CITY).toMatchObject({ name: 'İstanbul' })
  })

  it('Türkçe büyük/küçük harf ve aksan fark etmez', () => {
    expect(cityKey('  İSTANBUL ')).toBe('istanbul')
    expect(cityKey('Istanbul')).toBe('istanbul')
    expect(cityKey('ŞANLIURFA')).toBe(cityKey('Şanlıurfa'))
    expect(cityKey('Kadıköy   Moda')).toBe('kadikoy moda')
  })

  it('"Şehir" ayarındaki serbest metin: ilçe ilinden önce gelir; bulunamazsa null', () => {
    expect(findCity('istanbul')?.province).toBeUndefined()
    expect(findCity('istanbul')?.name).toBe('İstanbul')
    expect(findCity('Kadıköy, İstanbul')).toMatchObject({ name: 'Kadıköy', province: 'İstanbul' })
    expect(findCity('Kadıköy / İstanbul')?.name).toBe('Kadıköy')
    expect(findCity('Bodrum')).toMatchObject({ province: 'Muğla' })
    expect(findCity('Atlantis')).toBeNull()
    expect(findCity('')).toBeNull()
  })

  it('ilçe adı iliyle gösterilir', () => {
    expect(cityLabel(findCity('Kadıköy')!)).toBe('Kadıköy (İstanbul)')
    expect(cityLabel(DEFAULT_CITY)).toBe('İstanbul')
  })
})
