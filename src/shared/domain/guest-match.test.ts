import { describe, expect, it } from 'vitest'
import { editDistance, matchName, sameNameLikely } from './guest-match'
import { normalizeName } from './normalize'

const name = (s: string): string => normalizeName(s)

describe('misafir adı eşleşmesi (G-51, faz-06)', () => {
  it('"gadir garibov" yazımı "GADİR GADİROV" kartını bulur (bir sözcük aynı, diğeri iki harf farklı)', () => {
    expect(matchName('gadir garibov', name('GADİR GADİROV'))).toBe('near')
    expect(matchName('GADİR GADİROV', name('Gadir Garibov'))).toBe('near')
    expect(sameNameLikely('gadir garibov', 'GADİR GADİROV')).toBe(true)
  })

  it('Türkçe harf ve büyük/küçük harf farkı tam eşleşmedir; yazarken baş harfler yeter', () => {
    expect(matchName('gadir gadirov', name('GADİR GADİROV'))).toBe('exact')
    expect(matchName('ayse yil', name('Ayşe Yılmaz'))).toBe('exact')
    expect(matchName('ışık', name('Isik Demir'))).toBe('exact')
  })

  it('hiçbir sözcüğü tutmayan ya da çok farklı ad eşleşmez; kısa sözcükte harf hatası kabul edilmez', () => {
    expect(matchName('ivan petrov', name('Gadir Gadirov'))).toBeNull()
    expect(matchName('garibov', name('Gadir Gadirov'))).toBeNull()
    expect(matchName('ali can', name('Ali Cem'))).toBeNull()
    expect(sameNameLikely('Ali Can', 'Ali Cem')).toBe(false)
    expect(sameNameLikely('Gadir Gadirov', 'Gadir')).toBe(false)
  })

  it('harf yer değiştirmesi tek hatadır', () => {
    expect(editDistance('mehmet', 'mehemt')).toBe(1)
    expect(editDistance('garibov', 'gadirov')).toBe(2)
    expect(editDistance('abc', 'xyzxyz', 2)).toBe(3)
  })
})
