import { describe, expect, it } from 'vitest'
import { taskSuggestedIn } from './task-country'

describe('ülkeye bağlı görev önerileri (K-46 (7))', () => {
  it("turizm bildirimi ve KBS hatırlatıcısı yalnız Türkiye'deki otele önerilir", () => {
    for (const code of ['legal_tourism_stats', 'legal_kbs_checkout']) {
      expect(taskSuggestedIn(code, 'TR')).toBe(true)
      expect(taskSuggestedIn(code, 'tr')).toBe(true)
      expect(taskSuggestedIn(code, 'DE')).toBe(false)
      expect(taskSuggestedIn(code, 'GE')).toBe(false)
      expect(taskSuggestedIn(code, null)).toBe(false)
    }
  })

  it('ülkeye bağlı olmayan öneri ve otelin kendi görevi her yerde önerilir', () => {
    expect(taskSuggestedIn('call_late_checkouts', 'DE')).toBe(true)
    expect(taskSuggestedIn(null, 'DE')).toBe(true)
  })
})
