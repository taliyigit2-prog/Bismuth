import { describe, expect, it } from 'vitest'
import { isValidIban, isValidTckn, isValidTurkishTaxNumber } from './tax-id'

describe('IBAN denetimi', () => {
  it('doğru kontrol hanesi kabul edilir; boşluk ve küçük harf sorun olmaz', () => {
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true)
    expect(isValidIban('tr330006100519786457841326')).toBe(true)
    expect(isValidIban('GB82 WEST 1234 5698 7654 32')).toBe(true)
  })

  it('bir hane yanlışsa ya da biçim bozuksa reddedilir', () => {
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 27')).toBe(false)
    expect(isValidIban('TR12 0006 2000 0000 0012 3456 78')).toBe(false)
    expect(isValidIban('TR33')).toBe(false)
    expect(isValidIban('123456')).toBe(false)
  })
})

describe('vergi numarası', () => {
  it('10 hane (VKN) kabul edilir; 9 ya da 12 hane ve harf reddedilir', () => {
    expect(isValidTurkishTaxNumber('1234567890')).toBe(true)
    expect(isValidTurkishTaxNumber('123 456 78 90')).toBe(true)
    for (const bad of ['12', '123456789', '123456789012', '12345678ab', ''])
      expect(isValidTurkishTaxNumber(bad)).toBe(false)
  })

  it('11 hane yalnız T.C. kimlik no algoritmasını geçerse kabul edilir', () => {
    // Built from the algorithm for the test (no real person's number is written in the repository).
    const build = (first9: string): string => {
      const d = [...first9].map(Number)
      const tenth =
        ((((d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) * 7 - (d[1]! + d[3]! + d[5]! + d[7]!)) % 10) + 10) % 10
      const eleventh = (d.reduce((x, y) => x + y, 0) + tenth) % 10
      return `${first9}${tenth}${eleventh}`
    }
    const good = build('123456789')
    expect(good).toHaveLength(11)
    expect(isValidTckn(good)).toBe(true)
    expect(isValidTurkishTaxNumber(good)).toBe(true)
    expect(isValidTurkishTaxNumber(`${good.slice(0, 10)}${(Number(good[10]) + 1) % 10}`)).toBe(false)
    expect(isValidTurkishTaxNumber('0'.repeat(11))).toBe(false)
    expect(isValidTurkishTaxNumber(`0${good.slice(1)}`)).toBe(false)
  })
})
