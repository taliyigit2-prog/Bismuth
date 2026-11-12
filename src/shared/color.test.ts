import { describe, expect, it } from 'vitest'
import { contrastRatio, readableOn } from './color'

describe('renk yardımcıları', () => {
  it('siyah-beyaz karşıtlığı 21:1, aynı renk 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#336699', '#336699')).toBe(1)
  })

  it('açık dolguda koyu, koyu dolguda beyaz yazı; seçilen yazı en az 4,5:1', () => {
    expect(readableOn('#facc15')).toBe('#0a0a0a')
    expect(readableOn('#111827')).toBe('#ffffff')
    expect(readableOn('#7f1d1d')).toBe('#ffffff')
    for (const bg of ['#ef4444', '#facc15', '#fb923c', '#22d3ee', '#9ca3af', '#2563eb', '#0d9488'])
      expect(contrastRatio(readableOn(bg), bg), bg).toBeGreaterThanOrEqual(4.5)
  })
})
