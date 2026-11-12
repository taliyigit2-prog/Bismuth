// Who the main computer is (K-45 (1); trust on first use): an Ed25519 key pair derived from the server's own secret
// (`userData/host-secret.key`), so it stays the same across restarts and changes only on another computer (a new
// main computer after "Bu bilgisayarı ana bilgisayar yap", or someone else's machine pretending to be it). The
// public key goes out in `remote.hello` with a signature over the asker's random nonce: a stranger who copies the
// hello of the real computer cannot answer a fresh nonce. The client computer keeps the key it met first and stops
// (and asks the person) when another one answers at the hotel's address. Electron-free: unit-tested both ways.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
  verify,
  randomBytes,
  type KeyObject
} from 'node:crypto'
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { SecretStorage } from '../security/bismuth-key'

/** DER prefixes of an Ed25519 private key (PKCS#8) and public key (SPKI); the 32 key bytes follow. */
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const INFO = Buffer.from('bismuth-host-identity-v1')
const PROOF_CONTEXT = 'bismuth-hello-v1:'

export interface HostIdentity {
  /** The public key, 32 bytes as base64url (what a client keeps). */
  publicKey: string
  /** Short form people compare by eye: `AB12-CD34-EF56-7890`. */
  fingerprint: string
  /** The proof for `remote.hello`: a signature over the asker's nonce. */
  prove(nonce: string): string
}

const SEALED_PREFIX = 'os:'

/**
 * The server's 32 random bytes (`userData/host-secret.key`): signs device cookies and seeds this computer's identity,
 * so both survive a restart. N-10: sealed with the operating system's key store (`safeStorage`), so a copy of the file
 * does not let another machine pass for this one; a file of the earlier version (in the clear) is sealed at the first
 * start. Without a key store it stays in the clear, readable only by this computer's user (0600). A file that can no
 * longer be opened (another computer's key store) gives way to a new secret: a new identity, which client computers
 * then ask about (K-45 (1)).
 */
export function loadHostSecret(file: string, storage: SecretStorage | null = null): Uint8Array {
  const sealing = (() => {
    try {
      return storage?.isEncryptionAvailable() ? storage : null
    } catch {
      return null
    }
  })()
  const save = (secret: Buffer): void => {
    const text = sealing
      ? SEALED_PREFIX + sealing.encryptString(secret.toString('base64url')).toString('base64')
      : secret.toString('base64url')
    writeFileSync(`${file}.tmp`, text, { mode: 0o600 })
    chmodSync(`${file}.tmp`, 0o600)
    renameSync(`${file}.tmp`, file)
  }
  try {
    const text = readFileSync(file, 'utf8').trim()
    if (text.startsWith(SEALED_PREFIX)) {
      if (storage) {
        const plain = storage.decryptString(Buffer.from(text.slice(SEALED_PREFIX.length), 'base64'))
        const value = Buffer.from(plain, 'base64url')
        if (value.length === 32) return value
      }
    } else {
      const value = Buffer.from(text, 'base64url')
      if (value.length === 32) {
        if (sealing) save(value)
        return value
      }
    }
  } catch {
    // made below
  }
  const secret = randomBytes(32)
  save(secret)
  return secret
}

/** "AB12-CD34-EF56-7890" of a public key (base64url). */
export function fingerprintOf(publicKey: string): string {
  const hex = createHash('sha256').update(Buffer.from(publicKey, 'base64url')).digest('hex').slice(0, 16)
  return (hex.match(/.{4}/g) ?? []).join('-').toUpperCase()
}

/** The key pair of this computer, from its server secret (32 random bytes). */
export function hostIdentity(secret: Uint8Array): HostIdentity {
  const seed = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), INFO, 32))
  const privateKey: KeyObject = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8'
  })
  const spki = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
  const publicKey = Buffer.from(spki.subarray(spki.length - 32)).toString('base64url')
  return {
    publicKey,
    fingerprint: fingerprintOf(publicKey),
    prove: (nonce) => sign(null, Buffer.from(PROOF_CONTEXT + nonce), privateKey).toString('base64url')
  }
}

/** The answer to `nonce` was signed by the holder of `publicKey`. Anything malformed is simply false. */
export function checkProof(publicKey: string, nonce: string, proof: string): boolean {
  try {
    const raw = Buffer.from(publicKey, 'base64url')
    if (raw.length !== 32) return false
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
    return verify(null, Buffer.from(PROOF_CONTEXT + nonce), key, Buffer.from(proof, 'base64url'))
  } catch {
    return false
  }
}
