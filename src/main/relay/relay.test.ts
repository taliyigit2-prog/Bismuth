// Spike S-C and the security part of faz-13 madde 10: the encrypted box. Packages are AES-256-GCM with a key per
// file; a device without the Bismuth key reads nothing; a half-synced or changed file is never applied (and later,
// once whole, it is); identity numbers stay out of the box by default; 14 snapshots are kept.
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION, seededDatabase } from '../../../tests/factories/db'
import { openReplicaDatabase, type DatabaseHandle, type ReplicaDatabase } from '../db/client'
import { applySnapshot, readState } from '../replica/apply'
import { tableDigests, type SnapshotRow } from '../replica/feed'
import {
  decodePackage,
  encodePackage,
  MAX_PACKAGE_BYTES,
  PackageError,
  parseBoxName,
  readPackageHeader,
  readWhole,
  snapshotName
} from './format'
import { readBox } from './reader'
import { createRelayWriter, KEEP_SNAPSHOTS, listBox } from './writer'

let source: DatabaseHandle
let dir: string
let box: string
let replica: ReplicaDatabase
const key = randomBytes(32)
let now = new Date('2026-10-05T10:00:00.000Z')
let excludeIdentity = true

beforeEach(async () => {
  source = await seededDatabase()
  dir = mkdtempSync(join(tmpdir(), 'bismuth-relay-'))
  box = join(dir, 'Bismuth', 'kutu')
  mkdirSync(box, { recursive: true })
  replica = openReplicaDatabase({ file: join(dir, 'replica.db'), migrationsFolder: MIGRATIONS })
  now = new Date('2026-10-05T10:00:00.000Z')
  excludeIdentity = true
})
afterEach(() => {
  replica.close()
  source.close()
  rmSync(dir, { recursive: true, force: true })
})

function writer(over: { key?: Buffer | null; replaced?: boolean } = {}) {
  return createRelayWriter({
    sqlite: source.sqlite,
    dir: () => box,
    key: () => (over.key === undefined ? key : over.key),
    enabled: () => true,
    excludeIdentity: () => excludeIdentity,
    schemaVersion: () => SCHEMA_VERSION,
    replaced: () => over.replaced ?? false,
    clock: () => now,
    pause: async () => undefined
  })
}

const addGuest = (id: string, doc = 'TC12345678901'): void => {
  source.sqlite
    .prepare(
      'INSERT INTO guests (id, first_name, last_name, name_normalized, id_doc_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(id, 'Ayşe', 'Yılmaz', 'ayse yilmaz', doc, now.toISOString(), now.toISOString())
}

const read = (k = key) => readBox({ writer: replica.writer, schemaVersion: SCHEMA_VERSION }, box, k)

describe('.bmr paketi', () => {
  it('başlık değişirse ya da tek bayt bozulursa paket açılmaz; başka anahtarla açılmaz', () => {
    const info = {
      kind: 'seg' as const,
      epoch: 1,
      fromSeq: 1,
      toSeq: 2,
      schemaVersion: SCHEMA_VERSION,
      at: now.toISOString(),
      identity: false
    }
    const bytes = encodePackage(info, ['{"a":1}', '{"b":2}'], key)
    expect(decodePackage(bytes, key).lines).toEqual(['{"a":1}', '{"b":2}'])
    expect(readPackageHeader(bytes)).toMatchObject({ kind: 'seg', epoch: 1, toSeq: 2 })
    // The content is not readable without the key (not even after gunzip of the raw bytes).
    expect(bytes.includes(Buffer.from('"a":1'))).toBe(false)
    expect(() => decodePackage(bytes, randomBytes(32))).toThrow(PackageError)
    const flipped = Buffer.from(bytes)
    flipped[flipped.length - 20]! ^= 1
    expect(() => decodePackage(flipped, key)).toThrowError(/damaged/)
    // A changed header (another sequence number) fails the tag as well: the header is the AAD.
    const text = bytes.toString('latin1').replace('"toSeq":2', '"toSeq":3')
    expect(() => decodePackage(Buffer.from(text, 'latin1'), key)).toThrowError(/damaged/)
    // Cut off (half-synced).
    expect(() => decodePackage(bytes.subarray(0, bytes.length - 30), key)).toThrowError(/damaged/)
  })

  it('dosya adları sırayla ve türüyle okunur; geçici dosyalar yok sayılır', () => {
    expect(parseBoxName('seg-0001-000000000101-000000000250.bmr')).toEqual({
      kind: 'seg',
      name: 'seg-0001-000000000101-000000000250.bmr',
      epoch: 1,
      fromSeq: 101,
      toSeq: 250
    })
    expect(parseBoxName('snap-0002-000000000007.bmr')).toMatchObject({ kind: 'snap', epoch: 2, seq: 7 })
    expect(parseBoxName('epoch-0003.bmr')).toMatchObject({ kind: 'epoch', epoch: 3 })
    expect(parseBoxName('.lx2-abc.tmp')).toBeNull()
    expect(parseBoxName('seg-1-2-3.bmr')).toBeNull()
  })
})

describe('kutu yazıcı ve okuyucu', () => {
  it('ilk turda anlık görüntü, sonra yalnız yeni değişiklikler; kopya kutudan kaynağa eşit olur', async () => {
    const w = writer()
    addGuest('g1')
    await w.tick()
    expect(listBox(box).map((f) => f.kind)).toEqual(['snap'])
    addGuest('g2')
    source.sqlite.prepare("UPDATE guests SET notes = 'kat 3' WHERE id = 'g1'").run()
    now = new Date('2026-10-05T10:01:00.000Z')
    await w.tick()
    expect(listBox(box).filter((f) => f.kind === 'seg')).toHaveLength(1)
    // Nothing new: no new segment.
    await w.tick()
    expect(listBox(box).filter((f) => f.kind === 'seg')).toHaveLength(1)

    expect(read()).toMatchObject({ status: 'ok' })
    expect(tableDigests(replica.writer, { identity: false })).toEqual(
      tableDigests(source.sqlite, { identity: false })
    )
    expect(readState(replica.writer)).toMatchObject({
      epoch: 1,
      source: 'relay',
      asOf: '2026-10-05T10:01:00.000Z'
    })
  })

  it('kutu paketlerinde kimlik numarası yok (varsayılan); ayar kapatılırsa vardır', async () => {
    addGuest('g1', 'TC98765432109')
    await writer().tick()
    addGuest('g2', 'P55544433')
    await writer().tick()
    for (const f of readdirSync(box)) {
      const { lines } = decodePackage(readFileSync(join(box, f)), key)
      expect(lines.join('\n')).not.toContain('TC98765432109')
      expect(lines.join('\n')).not.toContain('P55544433')
      expect(lines.join('\n')).not.toContain('id_doc_number')
    }
    excludeIdentity = false
    await writer().snapshot()
    const snaps = listBox(box).filter((f) => f.kind === 'snap')
    const newest = snaps.sort((a, b) => (a.kind === 'snap' && b.kind === 'snap' ? a.seq - b.seq : 0)).at(-1)!
    expect(decodePackage(readFileSync(join(box, newest.name)), key).lines.join('\n')).toContain(
      'TC98765432109'
    )
  })

  it('anahtarsız cihaz kutudan hiçbir şey okuyamaz; anahtarı olmayan ana bilgisayar kutuya yazmaz', async () => {
    addGuest('g1')
    expect((await writer({ key: null }).tick()).problem).toBe('noKey')
    expect(listBox(box)).toEqual([])
    await writer().tick()
    const result = read(randomBytes(32))
    expect(result).toMatchObject({ status: 'waiting', reason: 'wrongKey' })
    expect(readState(replica.writer).epoch).toBe(0)
    // Nothing in the box can be read as plain text either.
    for (const f of readdirSync(box)) {
      const raw = readFileSync(join(box, f))
      expect(raw.includes(Buffer.from('Yılmaz'))).toBe(false)
      expect(() => gunzipSync(raw)).toThrow()
    }
  })

  it('yarım ya da bozuk paket uygulanmaz; tamamı gelince uygulanır', async () => {
    const w = writer()
    await w.tick()
    expect(read().status).toBe('ok')
    const before = readState(replica.writer)
    addGuest('g9')
    now = new Date('2026-10-05T10:02:00.000Z')
    await w.tick()
    const seg = listBox(box).find((f) => f.kind === 'seg')!
    const full = readFileSync(join(box, seg.name))
    // Drive is still syncing: only half of the file is here.
    writeFileSync(join(box, seg.name), full.subarray(0, Math.floor(full.length / 2)))
    expect(read().status).toBe('ok')
    expect(readState(replica.writer).seq).toBe(before.seq)
    expect(replica.writer.prepare("SELECT count(*) AS n FROM guests WHERE id = 'g9'").get()).toEqual({ n: 0 })
    // Now it is whole.
    writeFileSync(join(box, seg.name), full)
    read()
    expect(replica.writer.prepare("SELECT count(*) AS n FROM guests WHERE id = 'g9'").get()).toEqual({ n: 1 })
  })

  it('başka veri sürümünün paketi uygulanmaz: "Bismuth\'u güncelleyin"', async () => {
    await writer().tick()
    const newer = readBox({ writer: replica.writer, schemaVersion: SCHEMA_VERSION - 1 }, box, key)
    expect(newer.status).toBe('needsUpdate')
    expect(readState(replica.writer).epoch).toBe(0)
  })

  it('en çok 14 anlık görüntü kalır; kapsanan bölümler silinir', async () => {
    const w = writer()
    for (let i = 0; i < KEEP_SNAPSHOTS + 3; i++) {
      addGuest(`s${i}`)
      now = new Date(now.getTime() + 60_000)
      await w.tick()
      await w.snapshot()
    }
    const files = listBox(box)
    expect(files.filter((f) => f.kind === 'snap')).toHaveLength(KEEP_SNAPSHOTS)
    const oldest = Math.min(...files.flatMap((f) => (f.kind === 'snap' ? [f.seq] : [])))
    expect(files.filter((f) => f.kind === 'seg' && f.toSeq <= oldest)).toEqual([])
    expect(read().status).toBe('ok')
    expect(tableDigests(replica.writer, { identity: false })).toEqual(
      tableDigests(source.sqlite, { identity: false })
    )
  })

  it('yerine başka ana bilgisayar geçen bilgisayar kutuya yazmaz', async () => {
    addGuest('g1')
    expect((await writer({ replaced: true }).tick()).problem).toBe('replaced')
    expect(listBox(box)).toEqual([])
  })

  it('sessiz saatte "buradayım" notu kopyanın saatini ilerletir', async () => {
    const w = writer()
    await w.tick()
    read()
    now = new Date('2026-10-05T10:30:00.000Z')
    await w.tick()
    read()
    expect(readState(replica.writer).asOf).toBe('2026-10-05T10:30:00.000Z')
  })
})

describe('kutu dosyalarına güven (D2)', () => {
  it('adı değiştirilmiş paket (eski anlık görüntü yeni adla) uygulanmaz', async () => {
    addGuest('g-1')
    await writer().tick()
    const old = listBox(box).find((f) => f.kind === 'snap')!
    // An old snapshot dropped back under a newer name: its header still says what it is.
    addGuest('g-2')
    now = new Date('2026-10-05T10:05:00.000Z')
    await writer().snapshot()
    const newer = listBox(box)
      .filter((f) => f.kind === 'snap')
      .at(-1)!
    expect(newer.name).not.toBe(old.name)
    const fake = snapshotName(1, (newer as { seq: number }).seq + 50)
    copyFileSync(join(box, old.name), join(box, fake))
    for (const f of listBox(box)) if (f.kind === 'snap' && f.name !== fake) rmSync(join(box, f.name))
    for (const f of listBox(box)) if (f.kind === 'seg') rmSync(join(box, f.name))
    expect(read().status).toBe('waiting')
    expect(readState(replica.writer).epoch).toBe(0)
  })

  it('aynı dönemin daha eski anlık görüntüsü kutudan uygulanmaz: kopya geriye gitmez', async () => {
    addGuest('g-1')
    await writer().tick()
    const old = listBox(box).find((f) => f.kind === 'snap')!
    const pkg = decodePackage(readFileSync(join(box, old.name)), key)
    addGuest('g-2')
    now = new Date('2026-10-05T10:05:00.000Z')
    await writer().snapshot()
    expect(read().status).toBe('ok')
    const seq = readState(replica.writer).seq
    expect(pkg.header.toSeq).toBeLessThan(seq)
    const rows = pkg.lines.map((l) => JSON.parse(l) as SnapshotRow)
    const meta = { epoch: 1, seq: pkg.header.toSeq, schemaVersion: SCHEMA_VERSION, at: pkg.header.at }
    expect(applySnapshot(replica.writer, meta, rows, { identity: false, source: 'relay', asOf: 'x' })).toBe(
      false
    )
    expect(readState(replica.writer).seq).toBe(seq)
    expect(
      (replica.writer.prepare("SELECT count(*) AS n FROM guests WHERE id = 'g-2'").get() as { n: number }).n
    ).toBe(1)
  })

  it('çok büyük dosya okunmaz; küçük dosyadan dev çıktı (sıkıştırma bombası) açılmaz', () => {
    const big = join(dir, 'buyuk.bmr')
    writeFileSync(big, '')
    truncateSync(big, MAX_PACKAGE_BYTES + 1)
    expect(() => readWhole(big)).toThrow(PackageError)
    // 8 MB of zeros compress to a few KB; unpacking stops at the limit (the program's is 512 MB).
    const zeros = encodePackage(
      {
        kind: 'seg',
        epoch: 1,
        fromSeq: 1,
        toSeq: 1,
        schemaVersion: SCHEMA_VERSION,
        at: now.toISOString(),
        identity: false
      },
      ['0'.repeat(8 * 1024 * 1024)],
      key
    )
    expect(zeros.length).toBeLessThan(64 * 1024)
    expect(() => decodePackage(zeros, key, 1024 * 1024)).toThrow(PackageError)
    expect(decodePackage(zeros, key).lines[0]).toHaveLength(8 * 1024 * 1024)
  })
})
