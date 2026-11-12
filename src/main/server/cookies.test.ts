import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseCookies, serializeCookie, signDevice, verifyDevice } from './cookies'
import { createRateLimiter } from './rate-limit'
import { describeUserAgent } from './http-sessions'

const ID = '01JABCDEFGHJKMNPQRSTVWXYZ0'

describe('çerezler', () => {
  it('çerez HttpOnly, SameSite=Strict, Path=/; silme Max-Age=0', () => {
    expect(serializeCookie('a', 'b', { maxAge: 60 })).toBe(
      'a=b; Path=/; HttpOnly; SameSite=Strict; Max-Age=60'
    )
    expect(serializeCookie('a', '', { maxAge: 0 })).toMatch(/Max-Age=0$/)
    expect(parseCookies('a=1; b=2; a=3; bad=<x>')).toEqual({ a: '1', b: '2' })
    expect(parseCookies(undefined)).toEqual({})
  })

  it('cihaz çerezi sunucunun anahtarıyla imzalı; başka anahtar ya da değişmiş kimlik reddedilir', () => {
    const secret = randomBytes(32)
    const value = signDevice(ID, secret)
    expect(verifyDevice(value, secret)).toBe(ID)
    expect(verifyDevice(value, randomBytes(32))).toBeNull()
    expect(verifyDevice(`01JABCDEFGHJKMNPQRSTVWXYZ1.${value.split('.')[1]}`, secret)).toBeNull()
    expect(verifyDevice('cihaz', secret)).toBeNull()
    expect(verifyDevice(undefined, secret)).toBeNull()
  })
})

describe('hız sınırı sayacı', () => {
  it('pencere içinde sınıra kadar izin verir, pencere geçince yeniden açılır', () => {
    let now = 0
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: () => now })
    expect(limiter.take('ip:1')).toBe(true)
    expect(limiter.take('ip:1')).toBe(true)
    expect(limiter.take('ip:1')).toBe(false)
    expect(limiter.take('ip:2')).toBe(true)
    now = 1001
    expect(limiter.blocked('ip:1')).toBe(false)
    limiter.hit('ip:1')
    limiter.reset('ip:1')
    expect(limiter.count('ip:1')).toBe(0)
  })

  it('sahte adres seli belleği büyütmez (en eski anahtar düşer)', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 3, clock: () => 0 })
    for (const k of ['a', 'b', 'c', 'd']) limiter.hit(k)
    expect(limiter.count('a')).toBe(0)
    expect(limiter.count('d')).toBe(1)
  })
})

describe('cihaz adı', () => {
  it('tarayıcı kimliğinden tanınır bir ad: iPhone · Safari, Android · Chrome, Windows · Edge', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
      )
    ).toEqual({ kind: 'mobile', name: 'iPhone · Safari', platform: 'iPhone' })
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
      )
    ).toMatchObject({ kind: 'mobile', name: 'Android · Chrome' })
    expect(
      describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36 Edg/129.0')
    ).toMatchObject({ kind: 'browser', name: 'Windows · Edge' })
    expect(describeUserAgent(undefined)).toEqual({ kind: 'browser', name: 'Browser', platform: null })
  })
})
