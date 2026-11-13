// Face sealing (K-51): AES-256-GCM, the key sealed by a (fake) operating-system key store, no plain fallback.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Sealer } from '../network/state'
import { createFaceCrypto, FaceCryptoError } from './crypto'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})
const dir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bismuth-facekey-'))
  temps.push(d)
  return d
}

/** A reversible fake of the key store; another `owner` is another computer's store (cannot open this one's). */
const fakeSealer = (owner = 'a'): Sealer => ({
  seal: (plain) => `${owner}:${Buffer.from(plain).toString('base64')}`,
  open: (sealed) =>
    sealed.startsWith(`${owner}:`) ? Buffer.from(sealed.slice(2), 'base64').toString() : null
})

const vector = Buffer.from(Float32Array.from({ length: 128 }, (_, i) => i / 128).buffer)

const code = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    return e instanceof FaceCryptoError ? e.code : 'other'
  }
  return undefined
}

describe('yüz verisi şifreleme (K-51)', () => {
  it('şifreler ve çözer; şifreli bayt düz veriyi içermez; her şifreleme farklı çıkar', () => {
    const c = createFaceCrypto(join(dir(), 'face-key.bin'), fakeSealer())
    const a = c.encrypt(vector, 'guest_faces:embedding:f1')
    const b = c.encrypt(vector, 'guest_faces:embedding:f1')
    expect(a.equals(b)).toBe(false)
    expect(a.includes(vector.subarray(0, 32))).toBe(false)
    expect(c.decrypt(a, 'guest_faces:embedding:f1').equals(vector)).toBe(true)
  })

  it('anahtar mühürlü dosyada durur, düz yazılmaz; yeniden açılışta aynı anahtar okunur', () => {
    const file = join(dir(), 'camera', 'face-key.bin')
    const sealer = fakeSealer()
    const blob = createFaceCrypto(file, sealer).encrypt(vector)
    expect(readFileSync(file, 'utf8').startsWith('a:')).toBe(true)
    expect(createFaceCrypto(file, sealer).decrypt(blob).equals(vector)).toBe(true)
  })

  it('anahtar deposu yoksa açık hata verir ve hiçbir şey düz yazılmaz', () => {
    const file = join(dir(), 'face-key.bin')
    const c = createFaceCrypto(file, null)
    expect(c.available()).toBe(false)
    expect(code(() => c.encrypt(vector))).toBe('no-key-store')
    expect(code(() => c.decrypt(Buffer.from([1, ...new Array(40).fill(7)])))).toBe('no-key-store')
    expect(existsSync(file)).toBe(false)
    // A store that refuses to seal is the same: no key is kept in the clear.
    const refusing: Sealer = { seal: () => null, open: () => null }
    expect(code(() => createFaceCrypto(file, refusing).encrypt(vector))).toBe('no-key-store')
    expect(existsSync(file)).toBe(false)
  })

  it('başka bilgisayarın anahtar deposuyla açılamayan dosya key-lost verir; reset yeni anahtar kurar', () => {
    const file = join(dir(), 'face-key.bin')
    const blob = createFaceCrypto(file, fakeSealer('a')).encrypt(vector)
    const other = createFaceCrypto(file, fakeSealer('b'))
    expect(code(() => other.decrypt(blob))).toBe('key-lost')
    expect(code(() => other.encrypt(vector))).toBe('key-lost') // never silently replaces the key
    other.reset()
    const fresh = other.encrypt(vector)
    expect(other.decrypt(fresh).equals(vector)).toBe(true)
    expect(code(() => createFaceCrypto(file, fakeSealer('b')).decrypt(blob))).toBe('bad-data') // old blobs are gone
  })

  it('değiştirilmiş, kısaltılmış, başka satıra taşınmış ya da başka anahtarla şifreli veri bad-data verir', () => {
    const c = createFaceCrypto(null, null)
    const blob = c.encrypt(vector, 'guest_faces:embedding:f1')
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    expect(code(() => c.decrypt(tampered, 'guest_faces:embedding:f1'))).toBe('bad-data')
    expect(code(() => c.decrypt(blob.subarray(0, 20), 'guest_faces:embedding:f1'))).toBe('bad-data')
    expect(code(() => c.decrypt(blob, 'guest_faces:embedding:f2'))).toBe('bad-data')
    const other = createFaceCrypto(null, null)
    other.encrypt(vector)
    expect(code(() => other.decrypt(blob, 'guest_faces:embedding:f1'))).toBe('bad-data')
  })

  it('bellek anahtarı (testler): sealer olmadan da çalışır; anahtarsız çözme key-lost verir', () => {
    const c = createFaceCrypto(null, null)
    expect(c.available()).toBe(true)
    const blob = c.encrypt(Buffer.from('x'))
    expect(c.decrypt(blob).toString()).toBe('x')
    expect(code(() => createFaceCrypto(null, null).decrypt(blob))).toBe('key-lost')
  })
})
