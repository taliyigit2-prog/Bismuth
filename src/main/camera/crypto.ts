// Sealing of biometric bytes (K-51): a face vector and a face crop reach the database only as AES-256-GCM blobs.
// The 32-byte key is made here, kept in `userData/camera/face-key.bin` sealed with the operating system's key store
// (Electron `safeStorage`, as `secrets.ts` does) and never written in the clear. Unlike the camera secrets there is
// NO plain fallback: a computer without a key store cannot enrol faces at all (`no-key-store`), because a face must
// not sit in a file or a row that anyone with the disk can read. The key is not part of any backup: a restored
// database on another computer holds blobs nobody can open, and the retention job deletes them.
//
// Blob layout: version byte (1) | iv (12) | auth tag (16) | ciphertext. `context` (e.g. `guest_faces:embedding:<id>`)
// is bound as additional authenticated data, so a blob copied into another row or column fails to open.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Sealer } from '../network/state'

export type FaceCryptoErrorCode =
  /** This computer has no operating-system key store: biometric data is refused, never stored in the clear. */
  | 'no-key-store'
  /** The key file is missing or this computer/user cannot open it (another machine's key store, damaged file). */
  | 'key-lost'
  /** The blob is malformed, was changed, or belongs to another row/column or key. */
  | 'bad-data'

export class FaceCryptoError extends Error {
  constructor(readonly code: FaceCryptoErrorCode) {
    super(`face crypto: ${code}`)
    this.name = 'FaceCryptoError'
  }
}

export interface FaceCrypto {
  /** True when sealing can work (a key store exists, or the key is memory-only). Does not make the key. */
  available(): boolean
  /** Makes the key on first use. Throws `FaceCryptoError('no-key-store')` when it cannot be kept sealed. */
  encrypt(plain: Uint8Array, context?: string): Buffer
  /** Throws `FaceCryptoError('bad-data' | 'key-lost' | 'no-key-store')`; never makes a key. */
  decrypt(blob: Uint8Array, context?: string): Buffer
  /** Forgets the key (and its file): every blob sealed before becomes unreadable; a new key is made on next use. */
  reset(): void
}

const VERSION = 1
const IV_BYTES = 12
const TAG_BYTES = 16
const KEY_BYTES = 32

/**
 * `file` null = the key lives in memory only (tests); otherwise it needs a `sealer` (the system key store), and
 * without one every call that needs the key throws `no-key-store`.
 */
export function createFaceCrypto(file: string | null, sealer: Sealer | null): FaceCrypto {
  let key: Buffer | null = null

  const loadKey = (create: boolean): Buffer => {
    if (key) return key
    if (file === null) {
      if (!create) throw new FaceCryptoError('key-lost')
      key = randomBytes(KEY_BYTES)
      return key
    }
    if (!sealer) throw new FaceCryptoError('no-key-store')
    let stored: string | null = null
    try {
      stored = readFileSync(file, 'utf8')
    } catch {
      stored = null // no file yet
    }
    if (stored !== null) {
      const opened = sealer.open(stored.trim())
      const bytes = opened === null ? null : Buffer.from(opened, 'base64')
      if (!bytes || bytes.length !== KEY_BYTES) throw new FaceCryptoError('key-lost')
      key = bytes
      return key
    }
    if (!create) throw new FaceCryptoError('key-lost')
    const fresh = randomBytes(KEY_BYTES)
    const sealed = sealer.seal(fresh.toString('base64'))
    if (sealed === null) throw new FaceCryptoError('no-key-store')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, sealed, { mode: 0o600 })
    chmodSync(`${file}.tmp`, 0o600)
    renameSync(`${file}.tmp`, file)
    key = fresh
    return key
  }

  const aad = (context?: string): Buffer => Buffer.from(context ?? '', 'utf8')

  return {
    available: () => file === null || sealer !== null,
    encrypt(plain, context) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', loadKey(true), iv)
      cipher.setAAD(aad(context))
      const body = Buffer.concat([cipher.update(plain), cipher.final()])
      return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body])
    },
    decrypt(blob, context) {
      const data = Buffer.from(blob)
      if (data.length < 1 + IV_BYTES + TAG_BYTES || data[0] !== VERSION) throw new FaceCryptoError('bad-data')
      const k = loadKey(false)
      try {
        const decipher = createDecipheriv('aes-256-gcm', k, data.subarray(1, 1 + IV_BYTES))
        decipher.setAAD(aad(context))
        decipher.setAuthTag(data.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES))
        return Buffer.concat([decipher.update(data.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()])
      } catch {
        throw new FaceCryptoError('bad-data')
      }
    },
    reset() {
      key = null
      if (file !== null) rmSync(file, { force: true })
    }
  }
}
