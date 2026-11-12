import { describe, expect, it } from 'vitest'
import { matchBlacklist } from './blacklist'
import { descriptionKey, maskDocNumber, normalizeDocNumber, normalizeName, normalizePhone } from './normalize'

describe('ad ve açıklama normalleştirme', () => {
  it('Türkçe büyük/küçük harf ve aksanlar aynı anahtara iner', () => {
    expect(normalizeName('  GADİR  Garibov ')).toBe('gadir garibov')
    expect(normalizeName('IŞIK Çağrı')).toBe('isik cagri')
    expect(normalizeName('Ömer Başbuğ, Gizem Yüce')).toBe('omer basbug gizem yuce')
    expect(normalizeName('Sebahattin   Seven')).toBe(normalizeName('SEBAHATTİN SEVEN'))
  })

  it('gider açıklamaları gruplanırken büyük harf ve Türkçe karakter farkı yok sayılır', () => {
    expect(descriptionKey('Deniz maaş')).toBe(descriptionKey('deniz MAAŞ'))
    expect(descriptionKey('deniz 4 izin parası')).toBe('deniz 4 izin parasi')
  })
})

describe('telefon ve belge numarası', () => {
  it('yerel Türk numaraları 90 ile başlayan tek biçime iner', () => {
    expect(normalizePhone('0532 123 45 67')).toBe('905321234567')
    expect(normalizePhone('532-123-4567')).toBe('905321234567')
    expect(normalizePhone('+90 (532) 123 45 67')).toBe('905321234567')
    expect(normalizePhone('0044 20 7946 0958')).toBe('442079460958')
    expect(normalizePhone('+7 912 345 67 89')).toBe('79123456789')
    expect(normalizePhone('  ')).toBe('')
  })

  it('kimlik numarası karşılaştırma ve maskeli gösterim', () => {
    expect(normalizeDocNumber('u 123-456')).toBe('U123456')
    expect(maskDocNumber('12345678901')).toBe('12••••••901')
    expect(maskDocNumber('123')).toBe('•••')
    expect(maskDocNumber(maskDocNumber('U12345678'))).toBe('U1••••678')
  })
})

describe('kara liste eşleşmesi (G-52)', () => {
  const entries = [
    { id: 'b1', nameNormalized: 'hakan delireisoglu', severity: 'warn' as const, status: 'active' as const },
    {
      id: 'b2',
      nameNormalized: 'x y',
      idDocNumber: 'P1234567',
      severity: 'block' as const,
      status: 'active' as const
    },
    {
      id: 'b3',
      nameNormalized: 'z',
      phoneNormalized: '905551112233',
      severity: 'warn' as const,
      status: 'active' as const
    },
    { id: 'b4', nameNormalized: 'eski kayit', severity: 'block' as const, status: 'removed' as const }
  ]

  it('ad, kimlik no ya da telefondan biri tutarsa uyarır; engel önce gelir', () => {
    const hits = matchBlacklist(
      { name: 'Hakan DELİREİSOĞLU', idDocNumber: 'p-1234567', phone: '0555 111 22 33' },
      entries
    )
    expect(hits.map((h) => h.entry.id)).toEqual(['b2', 'b1', 'b3'])
    expect(hits[0]?.reasons).toEqual(['id'])
  })

  it('kaldırılmış kayıt ve eşleşmeyen misafir uyarı vermez', () => {
    expect(matchBlacklist({ name: 'Eski Kayıt' }, entries)).toEqual([])
    expect(matchBlacklist({ name: 'Başka Biri', phone: '' }, entries)).toEqual([])
  })
})
