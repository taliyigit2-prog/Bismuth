import { describe, expect, it } from 'vitest'
import { ULID_PATTERN, ulid } from './ids'

describe('ulid', () => {
  it('26 karakterlik Crockford base32 üretir; zaman kısmı milisaniyeyi kodlar', () => {
    const id = ulid(Date.UTC(2030, 0, 1))
    expect(id).toMatch(ULID_PATTERN)
    expect(ulid(Date.UTC(2031, 0, 1)).slice(0, 10) > id.slice(0, 10)).toBe(true)
  })

  it('aynı milisaniyede ve geri giden saatte üretilen kimlikler üretim sırasına göre sıralanır', () => {
    const t = Date.UTC(2032, 5, 1)
    const ids = [ulid(t), ulid(t), ulid(t), ulid(t - 60_000), ulid(t)]
    expect([...ids].sort()).toEqual(ids)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('geçersiz zaman reddedilir', () => {
    expect(() => ulid(-1)).toThrow(RangeError)
    expect(() => ulid(1.5)).toThrow(RangeError)
  })
})
