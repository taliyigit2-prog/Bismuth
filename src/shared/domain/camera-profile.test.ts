import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE_TABLE,
  DEFAULT_PROFILE_TABLE_JSON,
  parseProfileTable,
  profileSettings,
  recommendProfile
} from './camera-profile'

describe('kamera performans profili (K-59)', () => {
  it('8 GB ve 8 iş parçacıklı otel bilgisayarı standart önerilir', () => {
    expect(recommendProfile({ cores: 8, ramGb: 8 }, DEFAULT_PROFILE_TABLE)).toBe('standard')
  })

  it('az bellek ya da az çekirdek hafif profili önerir', () => {
    expect(recommendProfile({ cores: 8, ramGb: 4 }, DEFAULT_PROFILE_TABLE)).toBe('light')
    expect(recommendProfile({ cores: 2, ramGb: 16 }, DEFAULT_PROFILE_TABLE)).toBe('light')
  })

  it('bellek ve çekirdek birlikte yeterliyse yüksek profil önerilir', () => {
    expect(recommendProfile({ cores: 12, ramGb: 32 }, DEFAULT_PROFILE_TABLE)).toBe('high')
    expect(recommendProfile({ cores: 12, ramGb: 8 }, DEFAULT_PROFILE_TABLE)).toBe('standard')
  })

  it('eşikler ayardan gelir: tablo değişince öneri değişir', () => {
    const table = { ...DEFAULT_PROFILE_TABLE, rules: { ...DEFAULT_PROFILE_TABLE.rules, lightBelowRamGb: 12 } }
    expect(recommendProfile({ cores: 8, ramGb: 8 }, table)).toBe('light')
  })

  it('geçersiz tablo varsayılana düşer', () => {
    expect(recommendProfile({ cores: 8, ramGb: 8 }, null)).toBe('standard')
    expect(profileSettings('light', null)['camera.processEveryN']).toBe(5)
  })

  it('profil seçimi sıklık, çözünürlük ve boş tarama ayarlarını birlikte yazar', () => {
    expect(profileSettings('high', DEFAULT_PROFILE_TABLE)).toEqual({
      'camera.profile': 'high',
      'camera.processEveryN': 2,
      'camera.streamMaxWidth': 1280,
      'camera.idleFaceScanEvery': 2
    })
  })

  it('varsayılan JSON okunur; bozuk ya da sınır dışı JSON reddedilir', () => {
    expect(parseProfileTable(DEFAULT_PROFILE_TABLE_JSON)).toEqual(DEFAULT_PROFILE_TABLE)
    expect(parseProfileTable('{')).toBeNull()
    expect(parseProfileTable('{"rules":{}}')).toBeNull()
    const bad = structuredClone(DEFAULT_PROFILE_TABLE)
    bad.profiles.light.processEveryN = 99
    expect(parseProfileTable(JSON.stringify(bad))).toBeNull()
  })
})
