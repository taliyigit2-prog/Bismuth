// One backup = one compressed file (faz-14 madde 1; K-32): `bismuth-yedek-YYYY-MM-DD-HHmm.bmy`. Inside (gzip): a
// magic line, a JSON manifest (program version, schema version, file list with sizes, sha256 of the database copy)
// and the files one after the other (the database copy, then the attachments). The Drive copy is the same file
// encrypted with the Bismuth key (AES-256-GCM, K-05): `BSMYENC1` + key id + IV, the ciphertext, the 16-byte tag.
// Everything streams (zlib and the cipher work in Node's thread pool), so a large attachments folder never sits in
// memory; `pause` lets the caller slow the copy down between blocks on a weak computer.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync
} from 'node:fs'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { Readable, Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { keyIdOf } from '../security/bismuth-key'

const MAGIC = Buffer.from('BISMUTH-YEDEK 1\n')
const ENC_MAGIC = Buffer.from('BSMYENC1')
const IV_BYTES = 12
const TAG_BYTES = 16
const ENC_HEADER = ENC_MAGIC.length + 8 + IV_BYTES
const BLOCK = 4 * 1024 * 1024

export interface ArchiveEntry {
  /** Path inside the archive, '/'-separated ("bismuth.db", "attachments/2026/x.jpg"). */
  name: string
  /** File on disk. */
  path: string
}

export interface ArchiveManifest {
  format: 1
  app: string
  /** Applied migrations of the database copy (restore refuses a newer one). */
  schemaVersion: number
  createdAt: string
  kind: string
  dbSha256: string
  files: { name: string; size: number }[]
}

/** A failure the backup service turns into a message: the file is not a backup, is damaged, or the key is wrong. */
export class ArchiveError extends Error {
  constructor(readonly reason: 'notBackup' | 'damaged' | 'wrongKey') {
    super(`archive: ${reason}`)
    this.name = 'ArchiveError'
  }
}

/** A safe relative path inside the target folder ("../x" and absolute paths are refused). */
function safeName(name: string): string {
  const n = normalize(name.split('/').join(sep))
  if (!n || isAbsolute(n) || n.startsWith('..') || n.includes(`${sep}..${sep}`) || n.endsWith(`${sep}..`))
    throw new ArchiveError('damaged')
  return n
}

const sha256Of = async (path: string): Promise<string> => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
export { sha256Of }

/** Writes the archive to `out` (via a temporary file); returns its size and sha256. */
export async function writeArchive(
  out: string,
  manifest: Omit<ArchiveManifest, 'files'>,
  entries: readonly ArchiveEntry[],
  pause: () => Promise<void> = async () => undefined
): Promise<{ sizeBytes: number; sha256: string }> {
  const files = entries.map((e) => ({ ...e, size: statSync(e.path).size }))
  const full: ArchiveManifest = { ...manifest, files: files.map((f) => ({ name: f.name, size: f.size })) }
  const json = Buffer.from(JSON.stringify(full))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  async function* body(): AsyncGenerator<Buffer> {
    yield MAGIC
    yield length
    yield json
    let sinceBreak = 0
    for (const f of files) {
      let left = f.size
      for await (const chunk of createReadStream(f.path, { highWaterMark: 1024 * 1024 })) {
        const buf = chunk as Buffer
        // A file that grew while it was read (it should not): only the size in the manifest is copied.
        const part = buf.length > left ? buf.subarray(0, left) : buf
        left -= part.length
        yield part
        sinceBreak += part.length
        if (sinceBreak >= BLOCK) {
          sinceBreak = 0
          await pause()
        }
        if (left === 0) break
      }
      if (left > 0) throw new Error(`file shrank while copied: ${f.name}`)
    }
  }
  const tmp = `${out}.part`
  const hash = createHash('sha256')
  let size = 0
  const count = new Transform({
    transform(chunk: Buffer, _enc, done) {
      hash.update(chunk)
      size += chunk.length
      done(null, chunk)
    }
  })
  mkdirSync(dirname(out), { recursive: true })
  try {
    await pipeline(Readable.from(body()), createGzip({ level: 6 }), count, createWriteStream(tmp))
    renameSync(tmp, out)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
  return { sizeBytes: size, sha256: hash.digest('hex') }
}

/** Splits the decompressed stream into the manifest and the files, written under `dest`. */
class Unpacker extends Writable {
  manifest: ArchiveManifest | null = null
  private buffer: Buffer = Buffer.alloc(0)
  private stage: 'magic' | 'length' | 'manifest' | 'files' = 'magic'
  private need = MAGIC.length
  private fileIndex = 0
  private left = 0
  private fd: number | null = null

  constructor(private readonly dest: string) {
    super()
  }

  private openNext(): void {
    const files = this.manifest!.files
    while (this.fileIndex < files.length) {
      const f = files[this.fileIndex]!
      const target = join(this.dest, safeName(f.name))
      mkdirSync(dirname(target), { recursive: true })
      this.fd = openSync(target, 'w')
      this.left = f.size
      if (this.left > 0) return
      closeSync(this.fd)
      this.fd = null
      this.fileIndex++
    }
  }

  override _write(chunk: Buffer, _enc: BufferEncoding, done: (error?: Error | null) => void): void {
    try {
      let data: Buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
      this.buffer = Buffer.alloc(0)
      while (data.length) {
        if (this.stage === 'files') {
          if (this.fd === null) throw new ArchiveError('damaged') // bytes after the last file
          const part = data.subarray(0, this.left)
          writeAll(this.fd, part)
          this.left -= part.length
          data = data.subarray(part.length)
          if (this.left === 0) {
            closeSync(this.fd)
            this.fd = null
            this.fileIndex++
            this.openNext()
          }
          continue
        }
        if (data.length < this.need) {
          this.buffer = data
          break
        }
        const head = data.subarray(0, this.need)
        data = data.subarray(this.need)
        if (this.stage === 'magic') {
          if (!head.equals(MAGIC)) throw new ArchiveError('notBackup')
          this.stage = 'length'
          this.need = 4
        } else if (this.stage === 'length') {
          this.need = head.readUInt32BE(0)
          if (this.need > 50 * 1024 * 1024) throw new ArchiveError('damaged')
          this.stage = 'manifest'
        } else {
          this.manifest = JSON.parse(head.toString('utf8')) as ArchiveManifest
          if (this.manifest.format !== 1 || !Array.isArray(this.manifest.files))
            throw new ArchiveError('damaged')
          this.stage = 'files'
          this.openNext()
        }
      }
      done()
    } catch (error) {
      done(error as Error)
    }
  }

  override _final(done: (error?: Error | null) => void): void {
    const complete =
      this.manifest !== null && this.fd === null && this.fileIndex >= this.manifest.files.length
    done(complete ? null : new ArchiveError('damaged'))
  }

  override _destroy(error: Error | null, done: (error?: Error | null) => void): void {
    if (this.fd !== null) closeSync(this.fd)
    this.fd = null
    done(error)
  }
}

function writeAll(fd: number, data: Buffer): void {
  // writeSync may write less than asked on some file systems.
  let offset = 0
  while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset)
}

/** True when the file starts like an encrypted (Drive) copy. */
export function isEncryptedArchive(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(ENC_MAGIC.length)
    return readSync(fd, head, 0, head.length, 0) === head.length && head.equals(ENC_MAGIC)
  } finally {
    closeSync(fd)
  }
}

/**
 * Unpacks a backup into `dest` (decrypting it with `key` when it is a Drive copy) and returns its manifest. A wrong key
 * and a damaged file are told apart (the key id is in the header; GCM's tag catches any changed byte).
 */
export async function readArchive(
  path: string,
  dest: string,
  key: Buffer | null = null
): Promise<ArchiveManifest> {
  mkdirSync(dest, { recursive: true })
  const unpack = new Unpacker(dest)
  try {
    if (isEncryptedArchive(path)) {
      if (!key) throw new ArchiveError('wrongKey')
      const size = statSync(path).size
      if (size < ENC_HEADER + TAG_BYTES) throw new ArchiveError('damaged')
      const fd = openSync(path, 'r')
      const header = Buffer.alloc(ENC_HEADER)
      const tag = Buffer.alloc(TAG_BYTES)
      try {
        readSync(fd, header, 0, ENC_HEADER, 0)
        readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES)
      } finally {
        closeSync(fd)
      }
      const keyId = header.subarray(ENC_MAGIC.length, ENC_MAGIC.length + 8)
      if (!keyId.equals(keyIdOf(key))) throw new ArchiveError('wrongKey')
      const iv = header.subarray(ENC_MAGIC.length + 8)
      const decipher = createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      await pipeline(
        createReadStream(path, { start: ENC_HEADER, end: size - TAG_BYTES - 1 }),
        decipher,
        createGunzip(),
        unpack
      )
    } else {
      await pipeline(createReadStream(path), createGunzip(), unpack)
    }
  } catch (error) {
    if (error instanceof ArchiveError) throw error
    const code = (error as { code?: string }).code
    // Not gzip at all → not a backup; anything else while reading (bad tag, cut-off file) → damaged.
    if (code === 'Z_DATA_ERROR' && !unpack.manifest) throw new ArchiveError('notBackup')
    throw new ArchiveError('damaged')
  }
  if (!unpack.manifest) throw new ArchiveError('damaged')
  return unpack.manifest
}

/** Encrypts `src` into `out` with the Bismuth key (AES-256-GCM); via a temporary file. */
export async function encryptFile(src: string, out: string, key: Buffer): Promise<{ sizeBytes: number }> {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const tmp = `${out}.part`
  mkdirSync(dirname(out), { recursive: true })
  try {
    const sink = createWriteStream(tmp)
    sink.write(Buffer.concat([ENC_MAGIC, keyIdOf(key), iv]))
    await pipeline(createReadStream(src), cipher, sink, { end: false })
    await new Promise<void>((resolve, reject) => {
      sink.end(cipher.getAuthTag(), (error?: Error | null) => (error ? reject(error) : resolve()))
    })
    renameSync(tmp, out)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
  return { sizeBytes: statSync(out).size }
}
