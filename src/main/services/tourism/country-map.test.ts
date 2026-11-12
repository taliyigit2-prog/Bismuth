import { describe, expect, it } from 'vitest'
import {
  COUNTRY_SEED_ROWS,
  KKTC_ISO2,
  editDistance,
  mapNationality,
  ministryNameOf,
  normalizeCountryKey,
  type UserCountryMap
} from './country-map'

const brief = (raw: string, userMap?: UserCountryMap) => {
  const m = mapNationality(raw, userMap)
  return {
    iso2: m.iso2,
    name: m.ministryNameTr,
    needsReview: m.needsReview,
    reason: m.reason,
    source: m.source
  }
}

describe('normalizeCountryKey', () => {
  it('Türkçe büyük harf kuralı, aksan ve noktalama farkını yok sayar', () => {
    expect(normalizeCountryKey('Türkiye')).toBe('TURKIYE')
    expect(normalizeCountryKey('TÜRKİYE')).toBe('TURKIYE')
    expect(normalizeCountryKey('türkiye')).toBe('TURKIYE')
    expect(normalizeCountryKey('K.K.T.C.')).toBe('KKTC')
    expect(normalizeCountryKey('Kuzey  Kıbrıs Türk Cumhuriyeti')).toBe('KUZEY KIBRIS TURK CUMHURIYETI')
    expect(normalizeCountryKey('KOREA, REPUBLIC OF')).toBe('KOREA REPUBLIC OF')
    expect(normalizeCountryKey('  GERMANY (Deutschland) ')).toBe('GERMANY (DEUTSCHLAND)')
    expect(normalizeCountryKey('')).toBe('')
    expect(normalizeCountryKey(null)).toBe('')
  })
})

describe('editDistance', () => {
  it('yan yana iki harfin yer değiştirmesi tek düzeltmedir', () => {
    expect(editDistance('TURKYIE', 'TURKIYE')).toBe(1)
    expect(editDistance('TRKIYE', 'TURKIYE')).toBe(1)
    expect(editDistance('TURKIYE', 'TURKIYE')).toBe(0)
  })

  it('üst sınırı aşan uzaklık için sınır + 1 döner', () => {
    expect(editDistance('ALMANYA', 'FRANSA', 2)).toBe(3)
    expect(editDistance('A', 'ABCDEF', 1)).toBe(2)
  })
})

describe('mapNationality', () => {
  it("Türkiye'nin farklı yazımları onay istemeden Türkiye'ye gider", () => {
    for (const s of ['TÜRKİYE', 'TURKIYE', 'Türkiye', 'TURKEY', 'TÜRKİYE CUMHURİYETİ', 'T.C.', 'TR']) {
      expect(brief(s), s).toMatchObject({ iso2: 'TR', name: 'Türkiye', needsReview: false })
    }
  })

  it("KKTC'nin farklı yazımları Kuzey Kıbrıs Türk Cumhuriyeti'ne gider (XC)", () => {
    for (const s of [
      'KUZEY KIBRIS TURK CUMHURİYETİ',
      'KUZEY KIBRIS TÜRK CUMHURİYETİ',
      'Kuzey Kıbrıs Türk Cumhuriyeti',
      'KKTC',
      'K.K.T.C.',
      'NORTHERN CYPRUS'
    ]) {
      expect(brief(s), s).toMatchObject({
        iso2: KKTC_ISO2,
        name: 'Kuzey Kıbrıs Türk Cumhuriyeti',
        needsReview: false,
        source: 'seed'
      })
    }
  })

  it('parantezli uzun adlar parantez atılarak eşlenir', () => {
    expect(brief('GERMANY (Deutschland)')).toMatchObject({ iso2: 'DE', name: 'Almanya', needsReview: false })
    expect(brief('SWITZERLAND (Confederation of Helvetia)')).toMatchObject({ iso2: 'CH', name: 'İsviçre' })
    expect(brief('UZBEKISTAN')).toMatchObject({ iso2: 'UZ', name: 'Özbekistan', source: 'library' })
  })

  it('bazı ülkeler bakanlık panelindeki adla gösterilir', () => {
    expect(brief('RUSSIAN FEDERATION').name).toBe('Rusya Federasyonu')
    expect(brief('RUSSIA').name).toBe('Rusya Federasyonu')
    expect(brief('UNITED STATES').name).toBe('Amerika Birleşik Devletleri')
    expect(brief('USA').name).toBe('Amerika Birleşik Devletleri')
    expect(brief('PALESTINIAN TERRITORIES').name).toBe('Filistin')
    expect(brief('KOSOVO').name).toBe('Kosova')
    expect(ministryNameOf(KKTC_ISO2)).toBe('Kuzey Kıbrıs Türk Cumhuriyeti')
  })

  it('Türkçe yazılmış ülke adları da tanınır', () => {
    expect(brief('ALMANYA').iso2).toBe('DE')
    expect(brief('IRAK').iso2).toBe('IQ')
    expect(brief('ÖZBEKİSTAN').iso2).toBe('UZ')
    expect(brief('Gürcistan').iso2).toBe('GE')
  })

  it('harf hatalı yazım tek adaya yakınsa öneri olarak eşlenir ama kullanıcı onayı ister', () => {
    for (const [s, iso2] of [
      ['TÜRKYİE', 'TR'],
      ['TRKİYE', 'TR'],
      ['TÜRKİYYE', 'TR'],
      ['KUZY KIBRIS TURK CUMHURIYETI', KKTC_ISO2],
      ['GERMNY', 'DE']
    ] as const) {
      const m = mapNationality(s)
      expect([m.iso2, m.needsReview, m.reason, m.source, m.suggestions], s).toEqual([
        iso2,
        true,
        'typo',
        'fuzzy',
        [iso2]
      ])
    }
    expect(mapNationality('KUZY KIBRIS TURK CUMHURIYETI').ministryNameTr).toBe(
      'Kuzey Kıbrıs Türk Cumhuriyeti'
    )
  })

  it('KIBRIS belirsizdir: otomatik eşlenmez, iki seçenek önerilir', () => {
    const m = mapNationality('KIBRIS')
    expect([m.iso2, m.ministryNameTr, m.needsReview, m.reason, m.suggestions]).toEqual([
      null,
      null,
      true,
      'ambiguous',
      [KKTC_ISO2, 'CY']
    ])
  })

  it('CYPRUS hassastır: Güney Kıbrıs Rum Kesimi önerilir ama onay ister', () => {
    for (const s of ['CYPRUS', 'Cyprus', 'GKRY', 'GÜNEY KIBRIS RUM KESİMİ']) {
      expect(brief(s), s).toMatchObject({
        iso2: 'CY',
        name: 'Güney Kıbrıs Rum Kesimi',
        needsReview: true,
        reason: 'sensitive'
      })
    }
  })

  it('tarihî ülke (Sırbistan-Karadağ) onay ister ve iki ülke önerir', () => {
    const m = mapNationality('SERBIA AND MONTENEGRO')
    expect([m.iso2, m.needsReview, m.reason, m.suggestions]).toEqual([null, true, 'historical', ['RS', 'ME']])
  })

  it('bilinmeyen değer ve kısa kodlar tahmin edilmez', () => {
    expect(brief('ATLANTIS')).toMatchObject({
      iso2: null,
      needsReview: true,
      reason: 'unknown',
      source: 'unmapped'
    })
    expect(brief('XQ')).toMatchObject({ iso2: null, source: 'unmapped' })
    expect(brief('')).toMatchObject({ iso2: null, source: 'unmapped' })
  })

  it('kullanıcının onayladığı eşleme kalıcıdır ve her şeyden önce gelir', () => {
    const userMap: UserCountryMap = {
      TURKYIE: { iso2: 'TR', ministryNameTr: 'Türkiye' },
      KIBRIS: { iso2: KKTC_ISO2, ministryNameTr: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
      ATLANTIS: { iso2: null, ministryNameTr: 'Atlantis' }
    }
    expect(brief('TÜRKYİE', userMap)).toEqual({
      iso2: 'TR',
      name: 'Türkiye',
      needsReview: false,
      reason: null,
      source: 'user'
    })
    expect(brief('Kıbrıs', userMap)).toMatchObject({ iso2: KKTC_ISO2, needsReview: false, source: 'user' })
    expect(brief('Atlantis', userMap)).toMatchObject({ iso2: null, name: 'Atlantis', source: 'user' })
  })

  it("eşleme sonucu normalize anahtarı taşır (country_map'e bu anahtarla yazılır)", () => {
    expect(mapNationality('Türkyie').key).toBe('TURKYIE')
    expect(mapNationality('K.K.T.C.').raw).toBe('K.K.T.C.')
  })
})

describe('COUNTRY_SEED_ROWS', () => {
  it('her takma ad tek satırdır ve anahtar yazımın normalize halidir', () => {
    const keys = COUNTRY_SEED_ROWS.map((r) => r.keyNormalized)
    expect(new Set(keys).size).toBe(keys.length)
    for (const r of COUNTRY_SEED_ROWS) expect(r.keyNormalized).toBe(normalizeCountryKey(r.rawExample))
    expect(keys).toEqual(expect.arrayContaining(['TR', 'TURKIYE', 'KKTC', 'KUZEY KIBRIS TURK CUMHURIYETI']))
  })

  it('tohum satırları kodla aynı sonucu verir ve onaysız eşlenir', () => {
    for (const r of COUNTRY_SEED_ROWS) {
      expect(brief(r.rawExample), r.rawExample).toMatchObject({
        iso2: r.iso2,
        name: r.ministryNameTr,
        needsReview: false
      })
    }
    expect(COUNTRY_SEED_ROWS.find((r) => r.keyNormalized === 'RUSSIAN FEDERATION')?.ministryNameTr).toBe(
      'Rusya Federasyonu'
    )
  })

  it('belirsiz ya da hassas yazımlar tohuma girmez (her seferinde sorulur)', () => {
    const keys = new Set(COUNTRY_SEED_ROWS.map((r) => r.keyNormalized))
    for (const k of ['KIBRIS', 'CYPRUS', 'GKRY', 'SERBIA AND MONTENEGRO']) expect(keys.has(k), k).toBe(false)
  })
})
