// The Bismuth key (K-05): one 256-bit AES key per hotel. Everything that leaves the computer for the hotel's Google
// Drive — backup copies (Faz 14) and the remote "box" packages (Faz 13) — is encrypted with it (AES-256-GCM), so a
// leaked Drive account reveals nothing (KVKK). The key is kept with the operating system's key store (Electron
// `safeStorage`: DPAPI on Windows, Keychain on macOS) and never written in the clear; the owner keeps it on paper
// as a recovery text (11 groups of 5 letters/digits) to read the copies on a new computer.
// No Electron import here: the main process passes `safeStorage` in, tests pass a stand-in.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const KEY_BYTES = 32

/** What `safeStorage` offers (Electron); null when the program runs without it (server harness, tests). */
export interface SecretStorage {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

export interface BismuthKeyInfo {
  /** The computer can keep a key safely. */
  available: boolean
  exists: boolean
  createdAt: string | null
}

export interface BismuthKeyStore {
  info(): BismuthKeyInfo
  /** The hotel's key, or null when none was made or learned on this computer (or it cannot be read). */
  get(): Buffer | null
  /** The key, made now when there is none; null when the computer cannot keep one safely. */
  getOrCreate(): Buffer | null
  /** Keeps a key learned from the recovery text (a new computer). Refused when the key store is unavailable. */
  set(key: Buffer): void
}

/** First 8 bytes of sha256(key): written next to each encrypted file so a wrong key is told apart from damage. */
export const keyIdOf = (key: Buffer): Buffer => createHash('sha256').update(key).digest().subarray(0, 8)

export const sameKey = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b)

interface KeyFile {
  v: 1
  createdAt: string
  /** safeStorage-encrypted base64 of the key. */
  blob: string
}

/** The key in `file` (userData/bismuth-key.json), protected by the operating system's key store. */
export function createBismuthKeyStore(
  file: string,
  storage: SecretStorage | null,
  clock: () => Date = () => new Date()
): BismuthKeyStore {
  const available = (): boolean => {
    try {
      return storage?.isEncryptionAvailable() ?? false
    } catch {
      return false
    }
  }
  const read = (): { key: Buffer; createdAt: string } | null => {
    if (!storage || !existsSync(file)) return null
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as KeyFile
      const key = Buffer.from(storage.decryptString(Buffer.from(parsed.blob, 'base64')), 'base64')
      return key.length === KEY_BYTES ? { key, createdAt: parsed.createdAt } : null
    } catch {
      return null
    }
  }
  const write = (key: Buffer): void => {
    if (!storage || !available()) throw new Error('key store unavailable')
    const body: KeyFile = {
      v: 1,
      createdAt: clock().toISOString(),
      blob: storage.encryptString(key.toString('base64')).toString('base64')
    }
    mkdirSync(dirname(file), { recursive: true })
    // Write then rename: a crash never leaves half a key file.
    writeFileSync(`${file}.tmp`, JSON.stringify(body))
    renameSync(`${file}.tmp`, file)
  }
  return {
    info() {
      const current = read()
      return { available: available(), exists: current !== null, createdAt: current?.createdAt ?? null }
    },
    get: () => read()?.key ?? null,
    getOrCreate() {
      const current = read()
      if (current) return current.key
      if (!available()) return null
      const key = randomBytes(KEY_BYTES)
      write(key)
      return key
    },
    set(key) {
      if (key.length !== KEY_BYTES) throw new Error('bad key length')
      write(key)
    }
  }
}

/** A key store held in memory (tests, and a computer without a key store that was given the key for one restore). */
export function memoryKeyStore(initial: Buffer | null = null, isAvailable = true): BismuthKeyStore {
  let key = initial
  let createdAt = initial ? new Date(0).toISOString() : null
  return {
    info: () => ({ available: isAvailable, exists: key !== null, createdAt }),
    get: () => key,
    getOrCreate() {
      if (!key && isAvailable) {
        key = randomBytes(KEY_BYTES)
        createdAt = new Date().toISOString()
      }
      return key
    },
    set(next) {
      if (!isAvailable) throw new Error('key store unavailable')
      key = next
      createdAt = new Date().toISOString()
    }
  }
}

// Crockford base32: no I, L, O, U — nothing to confuse when read back from paper.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CHECK_BYTES = 2

/** Key → "7KQ2M-…" (55 characters in 11 groups of 5); the last bytes are a checksum against typing errors. */
export function encodeRecoveryText(key: Buffer): string {
  const check = createHash('sha256').update(key).digest().subarray(0, CHECK_BYTES)
  const bytes = Buffer.concat([key, check])
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out.match(/.{1,5}/g)!.join('-')
}

/** Recovery text → key; null when a character is unknown or the checksum does not match. */
export function decodeRecoveryText(text: string): Buffer | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0')
  const total = KEY_BYTES + CHECK_BYTES
  if (clean.length !== Math.ceil((total * 8) / 5)) return null
  const bytes: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) return null
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
      value &= (1 << bits) - 1
    }
  }
  const buf = Buffer.from(bytes.slice(0, total))
  const key = buf.subarray(0, KEY_BYTES)
  const check = createHash('sha256').update(key).digest().subarray(0, CHECK_BYTES)
  return check.equals(buf.subarray(KEY_BYTES)) ? Buffer.from(key) : null
}
