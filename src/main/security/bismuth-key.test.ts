import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createBismuthKeyStore,
  decodeRecoveryText,
  encodeRecoveryText,
  keyIdOf,
  type SecretStorage
} from './bismuth-key'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A stand-in for Electron's safeStorage: reversible, but not the clear text. */
const fakeSafeStorage = (available = true): SecretStorage => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(plain, 'utf8').reverse(),
  decryptString: (enc) => Buffer.from(enc).reverse().toString('utf8')
})

describe('Bismuth anahtarı (K-05)', () => {
  it('kağıda yazılan metin 11 grup, anahtara geri döner; harf hatası yakalanır, I/L/O karışıklığı düzelir', () => {
    const key = Buffer.from([...Array(32).keys()])
    const text = encodeRecoveryText(key)
    expect(text).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){10}[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(decodeRecoveryText(text)?.equals(key)).toBe(true)
    expect(decodeRecoveryText(text.toLowerCase().replace(/-/g, ' '))?.equals(key)).toBe(true)
    const typo = text.slice(0, 3) + (text[3] === 'A' ? 'B' : 'A') + text.slice(4)
    expect(decodeRecoveryText(typo)).toBeNull()
    expect(decodeRecoveryText('kısa')).toBeNull()
    expect(decodeRecoveryText(text.replace(/1/g, 'I').replace(/0/g, 'O'))?.equals(key)).toBe(true)
  })

  it('anahtar işletim sisteminin anahtar deposuyla saklanır, dosyada açık hâli yoktur', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-key-'))
    temps.push(dir)
    const file = join(dir, 'bismuth-key.json')
    const store = createBismuthKeyStore(file, fakeSafeStorage(), () => new Date('2026-10-04T10:00:00Z'))
    expect(store.info()).toEqual({ available: true, exists: false, createdAt: null })
    const key = store.getOrCreate()!
    expect(key).toHaveLength(32)
    expect(readFileSync(file, 'utf8')).not.toContain(key.toString('base64'))
    // A second start reads the same key.
    const again = createBismuthKeyStore(file, fakeSafeStorage())
    expect(again.get()?.equals(key)).toBe(true)
    expect(again.info()).toMatchObject({ exists: true, createdAt: '2026-10-04T10:00:00.000Z' })
    expect(keyIdOf(key)).toHaveLength(8)
  })

  it('anahtar deposu yoksa anahtar üretilmez ve yazılmaz', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-key-'))
    temps.push(dir)
    const store = createBismuthKeyStore(join(dir, 'k.json'), fakeSafeStorage(false))
    expect(store.getOrCreate()).toBeNull()
    expect(() => store.set(Buffer.alloc(32))).toThrow()
    expect(createBismuthKeyStore(join(dir, 'k.json'), null).info().available).toBe(false)
  })
})
