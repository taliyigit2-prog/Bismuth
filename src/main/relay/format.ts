// The encrypted box package `.bmr` (faz-13 madde 4; spike S-C; K-05, K-19): what the hotel's computer leaves in the
// hotel's Google Drive folder for the owner's read-only copy. Bismuth only writes files; Drive for desktop syncs
// them (yasak 4: no cloud account, no network code here).
//   file  = "BSMRLY01" · u32 header length · header (JSON) · AES-256-GCM(gzip(payload)) · 16-byte tag
//   key   = HKDF-SHA256(Bismuth key, random 16-byte salt, "bismuth-relay-v1") — one key per file
//   AAD   = everything before the ciphertext, so a changed header (term, sequence numbers) is caught like a changed
//           byte of the data. A file is decrypted whole and used only when its tag checks out: a half-synced or
//           damaged file is never applied (it is tried again later).
// Payload: one JSON value per line — changes (`seg`), rows (`snap`), the new term (`epoch`) or where the main
// computer is (`mark`, a small "still here" note every few minutes).
// Files are written under a temporary name and renamed, so Drive never uploads half a file under the real name.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createGzip, gunzipSync, gzipSync } from 'node:zlib'
import * as z from 'zod'
import { keyIdOf } from '../security/bismuth-key'

const MAGIC = Buffer.from('BSMRLY01')
const TAG_BYTES = 16
const INFO = Buffer.from('bismuth-relay-v1')
const MAX_HEADER = 64 * 1024
/**
 * Largest package file read and largest payload unpacked (D2): a 19-room hotel's whole snapshot is a few MB; a file
 * far beyond that is not one of ours, and a small file that unpacks to gigabytes (a "zip bomb") is refused too.
 */
export const MAX_PACKAGE_BYTES = 256 * 1024 * 1024
export const MAX_PAYLOAD_BYTES = 512 * 1024 * 1024

export const PACKAGE_KINDS = ['seg', 'snap', 'epoch', 'mark'] as const
export type PackageKind = (typeof PACKAGE_KINDS)[number]

const headerSchema = z.object({
  v: z.literal(1),
  kind: z.enum(PACKAGE_KINDS),
  epoch: z.number().int().min(1),
  fromSeq: z.number().int().min(0),
  toSeq: z.number().int().min(0),
  schemaVersion: z.number().int().min(0),
  /** When the main computer wrote it: the copy is complete up to here once it is in. */
  at: z.string(),
  /** Identity numbers are inside (setting `relay.excludeIdentity` off). */
  identity: z.boolean(),
  keyId: z.string().regex(/^[0-9a-f]{16}$/),
  salt: z.string(),
  iv: z.string()
})
export type PackageHeader = z.infer<typeof headerSchema>
export type PackageInfo = Omit<PackageHeader, 'v' | 'keyId' | 'salt' | 'iv'>

/** Why a package cannot be used: not ours, another key, or damaged / not fully synced yet. */
export class PackageError extends Error {
  constructor(readonly reason: 'notPackage' | 'wrongKey' | 'damaged') {
    super(`relay package: ${reason}`)
    this.name = 'PackageError'
  }
}

const fileKey = (key: Buffer, salt: Buffer): Buffer => Buffer.from(hkdfSync('sha256', key, salt, INFO, 32))

/** The whole package as bytes (payload lines are joined with newlines and compressed). */
export function encodePackage(info: PackageInfo, lines: Iterable<string>, key: Buffer): Buffer {
  const parts: string[] = []
  for (const line of lines) parts.push(line)
  return seal(info, gzipSync(Buffer.from(parts.join('\n')), { level: 6 }), key)
}

/**
 * The same, fed line by line and compressed in Node's thread pool as the lines arrive (a snapshot of ten years does
 * not hold the program up, K-32, and is never held in memory as text, only compressed: database review #3).
 */
export async function encodePackageLines(
  info: PackageInfo,
  lines: AsyncIterable<string> | Iterable<string>,
  key: Buffer
): Promise<Buffer> {
  const gz = createGzip({ level: 6 })
  const out: Buffer[] = []
  gz.on('data', (chunk: Buffer) => out.push(chunk))
  const finished = new Promise<void>((resolve, reject) => {
    gz.once('end', resolve)
    gz.once('error', reject)
  })
  let pending: string[] = []
  let size = 0
  let first = true
  const flush = async (): Promise<void> => {
    if (pending.length === 0) return
    const more = gz.write(pending.join(''))
    pending = []
    size = 0
    if (!more) await new Promise<void>((resolve) => gz.once('drain', resolve))
  }
  for await (const line of lines) {
    const piece = first ? line : `\n${line}`
    first = false
    pending.push(piece)
    size += piece.length
    if (size >= 256 * 1024) await flush()
  }
  await flush()
  gz.end()
  await finished
  return seal(info, Buffer.concat(out), key)
}

function seal(info: PackageInfo, plain: Buffer, key: Buffer): Buffer {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const header: PackageHeader = {
    v: 1,
    ...info,
    keyId: keyIdOf(key).toString('hex'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64')
  }
  const json = Buffer.from(JSON.stringify(header))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  const aad = Buffer.concat([MAGIC, length, json])
  const cipher = createCipheriv('aes-256-gcm', fileKey(key, salt), iv)
  cipher.setAAD(aad)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([aad, body, cipher.getAuthTag()])
}

/** Reads only the header (no key needed): which file is what, before deciding to decrypt it. */
export function readPackageHeader(bytes: Buffer): PackageHeader {
  if (bytes.length < MAGIC.length + 4 || !bytes.subarray(0, MAGIC.length).equals(MAGIC))
    throw new PackageError('notPackage')
  const length = bytes.readUInt32BE(MAGIC.length)
  if (length > MAX_HEADER || bytes.length < MAGIC.length + 4 + length + TAG_BYTES)
    throw new PackageError('damaged')
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.subarray(MAGIC.length + 4, MAGIC.length + 4 + length).toString('utf8'))
  } catch {
    throw new PackageError('damaged')
  }
  const header = headerSchema.safeParse(parsed)
  if (!header.success) throw new PackageError('damaged')
  return header.data
}

/** Decrypts and checks a package; its lines only when every byte (and the header) is as written. */
export function decodePackage(
  bytes: Buffer,
  key: Buffer,
  maxPayload = MAX_PAYLOAD_BYTES
): { header: PackageHeader; lines: string[] } {
  const header = readPackageHeader(bytes)
  if (header.keyId !== keyIdOf(key).toString('hex')) throw new PackageError('wrongKey')
  const start = MAGIC.length + 4 + bytes.readUInt32BE(MAGIC.length)
  const aad = bytes.subarray(0, start)
  const body = bytes.subarray(start, bytes.length - TAG_BYTES)
  const tag = bytes.subarray(bytes.length - TAG_BYTES)
  let plain: Buffer
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      fileKey(key, Buffer.from(header.salt, 'base64')),
      Buffer.from(header.iv, 'base64')
    )
    decipher.setAAD(aad)
    decipher.setAuthTag(tag)
    plain = gunzipSync(Buffer.concat([decipher.update(body), decipher.final()]), {
      maxOutputLength: maxPayload
    })
  } catch {
    throw new PackageError('damaged')
  }
  const text = plain.toString('utf8')
  return { header, lines: text.length ? text.split('\n') : [] }
}

/** Writes `bytes` as `path` through a temporary name in the same folder (Drive sees only whole files). */
export function writeWhole(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.tmp`)
  try {
    writeFileSync(tmp, bytes)
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/** The same in ~4 MB blocks with a rest in between (K-32: the weak hotel computer keeps working). */
export async function writeWholeSlowly(
  path: string,
  bytes: Buffer,
  pause: () => Promise<void>,
  block = 4 * 1024 * 1024
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = join(dirname(path), `.${Date.now().toString(36)}-${randomBytes(3).toString('hex')}.tmp`)
  try {
    const file = await open(tmp, 'w')
    try {
      for (let offset = 0; offset < bytes.length; offset += block) {
        await file.write(bytes, offset, Math.min(block, bytes.length - offset))
        if (offset + block < bytes.length) await pause()
      }
      await file.sync()
    } finally {
      await file.close()
    }
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/** A package file as bytes; one larger than any package Bismuth writes is not read at all (D2). */
export function readWhole(path: string): Buffer {
  if (statSync(path).size > MAX_PACKAGE_BYTES) throw new PackageError('damaged')
  return readFileSync(path)
}

/**
 * The header says what the file name says (D2): the name decides which package is read when, so a package renamed
 * in the box (an old snapshot under a newer name, a segment moved to another place) is not applied.
 */
export function headerMatchesName(header: PackageHeader, file: BoxFile): boolean {
  if (header.kind !== file.kind) return false
  switch (file.kind) {
    case 'seg':
      return header.epoch === file.epoch && header.fromSeq === file.fromSeq && header.toSeq === file.toSeq
    case 'snap':
      return header.epoch === file.epoch && header.toSeq === file.seq
    case 'epoch':
      return header.epoch === file.epoch
    case 'mark':
      return true
  }
}

// seg-0001-000000000101-000000000250.bmr · snap-0001-000000000250.bmr · epoch-0002.bmr · durum.bmr
const pad = (n: number, width: number): string => String(n).padStart(width, '0')
export const segmentName = (epoch: number, from: number, to: number): string =>
  `seg-${pad(epoch, 4)}-${pad(from, 12)}-${pad(to, 12)}.bmr`
export const snapshotName = (epoch: number, seq: number): string =>
  `snap-${pad(epoch, 4)}-${pad(seq, 12)}.bmr`
export const epochName = (epoch: number): string => `epoch-${pad(epoch, 4)}.bmr`
export const MARK_NAME = 'durum.bmr'

export type BoxFile =
  | { kind: 'seg'; name: string; epoch: number; fromSeq: number; toSeq: number }
  | { kind: 'snap'; name: string; epoch: number; seq: number }
  | { kind: 'epoch'; name: string; epoch: number }
  | { kind: 'mark'; name: string }

/** What a file in the box is by its name (anything else — temporary files, Drive's own — is ignored). */
export function parseBoxName(name: string): BoxFile | null {
  let m = /^seg-(\d{4})-(\d{12})-(\d{12})\.bmr$/.exec(name)
  if (m) return { kind: 'seg', name, epoch: Number(m[1]), fromSeq: Number(m[2]), toSeq: Number(m[3]) }
  m = /^snap-(\d{4})-(\d{12})\.bmr$/.exec(name)
  if (m) return { kind: 'snap', name, epoch: Number(m[1]), seq: Number(m[2]) }
  m = /^epoch-(\d{4})\.bmr$/.exec(name)
  if (m) return { kind: 'epoch', name, epoch: Number(m[1]) }
  return name === MARK_NAME ? { kind: 'mark', name } : null
}
