import { describe, expect, it } from 'vitest'
import { kbsFilePeriod, kbsFileRange } from './tourism'

describe('KBS dosya adından ay', () => {
  it('"…_01092026_30092026.xlsx" 1–30 Eylül 2026 demektir', () => {
    expect(kbsFileRange('EGM_Konaklayan_Listesi_01092026_30092026.xlsx')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30'
    })
    expect(kbsFilePeriod('EGM_Konaklayan_Listesi_01092026_30092026 (1).xlsx')).toBe('2026-09')
  })

  it('aralığı olmayan, geçersiz ya da ters aralıklı ad ay vermez (satırlara bakılır)', () => {
    expect(kbsFileRange('eylul-listesi.xlsx')).toBeNull()
    expect(kbsFileRange('liste_31022026_01032026.xlsx')).toBeNull()
    expect(kbsFileRange('liste_30092026_01092026.xlsx')).toBeNull()
  })
})
