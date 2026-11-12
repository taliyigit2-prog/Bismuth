import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveError, encryptFile, readArchive, writeArchive } from './archive'
import { findMyDrive, resolveDriveBackupDir, type DriveProbe } from './drive'
import { closingBackupNeeded, createBackupScheduler, isDue, lastSlotAt, nextSlotAt } from './scheduler'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bismuth-parts-'))
  temps.push(d)
  return d
}

describe('yedek dosyası (sıkıştırılmış, Drive için şifreli)', () => {
  it('dosyaları açar; şifreli kopya yalnız aynı anahtarla açılır, değişen bayt yakalanır', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'db'), Buffer.alloc(300_000, 7))
    mkdirSync(join(dir, 'a', 'b'), { recursive: true })
    writeFileSync(join(dir, 'a', 'b', 'foto.jpg'), 'ğüşiöç')
    writeFileSync(join(dir, 'bos'), '')
    const archive = join(dir, 'yedek.bmy')
    const meta = {
      format: 1 as const,
      app: '1.0.0',
      schemaVersion: 8,
      createdAt: 'x',
      kind: 'auto',
      dbSha256: 'x'
    }
    const written = await writeArchive(archive, meta, [
      { name: 'bismuth.db', path: join(dir, 'db') },
      { name: 'attachments/b/foto.jpg', path: join(dir, 'a', 'b', 'foto.jpg') },
      { name: 'attachments/bos', path: join(dir, 'bos') }
    ])
    expect(written.sizeBytes).toBeLessThan(300_000) // compressed
    const out = join(dir, 'out')
    const manifest = await readArchive(archive, out)
    expect(manifest).toMatchObject({
      schemaVersion: 8,
      files: [{ size: 300_000 }, { size: 11 }, { size: 0 }]
    })
    expect(readFileSync(join(out, 'attachments', 'b', 'foto.jpg'), 'utf8')).toBe('ğüşiöç')
    expect(readFileSync(join(out, 'bismuth.db')).equals(Buffer.alloc(300_000, 7))).toBe(true)

    const key = Buffer.alloc(32, 1)
    const enc = join(dir, 'drive.bmy')
    await encryptFile(archive, enc, key)
    await expect(readArchive(enc, join(dir, 'x1'))).rejects.toMatchObject({ reason: 'wrongKey' })
    await expect(readArchive(enc, join(dir, 'x2'), Buffer.alloc(32, 2))).rejects.toMatchObject({
      reason: 'wrongKey'
    })
    expect((await readArchive(enc, join(dir, 'x3'), key)).schemaVersion).toBe(8)
    const bytes = readFileSync(enc)
    bytes[100] = (bytes[100] ?? 0) ^ 1
    writeFileSync(enc, bytes)
    await expect(readArchive(enc, join(dir, 'x4'), key)).rejects.toBeInstanceOf(ArchiveError)
  })
})

describe('Drive klasörü', () => {
  const probe = (
    dirs: string[],
    platform: NodeJS.Platform,
    list: Record<string, string[]> = {}
  ): DriveProbe => ({
    platform,
    home: '/Users/otel',
    isDir: (p) => dirs.includes(p),
    list: (p) => list[p] ?? []
  })

  it("Windows G: ve macOS CloudStorage içindeki Drive'ım bulunur; yoksa yok sayılır", () => {
    expect(findMyDrive(probe(['G:\\/My Drive', 'G:\\My Drive'], 'win32'))).toMatch(/My Drive$/)
    const mac = probe(["/Users/otel/Library/CloudStorage/GoogleDrive-otel@gmail.com/Drive'ım"], 'darwin', {
      '/Users/otel/Library/CloudStorage': ['GoogleDrive-otel@gmail.com', 'Dropbox']
    })
    expect(resolveDriveBackupDir('', mac)).toBe(
      "/Users/otel/Library/CloudStorage/GoogleDrive-otel@gmail.com/Drive'ım/Bismuth/yedekler"
    )
    expect(resolveDriveBackupDir('', probe([], 'linux'))).toBeNull()
    // A folder set by hand must exist; a relative path is refused.
    expect(resolveDriveBackupDir('/Volumes/Yedek', probe(['/Volumes/Yedek'], 'darwin'))).toBe(
      '/Volumes/Yedek'
    )
    expect(resolveDriveBackupDir('/yok', probe([], 'darwin'))).toBeNull()
    expect(resolveDriveBackupDir('yedek', probe(['yedek'], 'darwin'))).toBeNull()
  })
})

describe('otomatik yedek zamanı (04:00 + kapanış)', () => {
  const at = (s: string) => new Date(s)
  it('son yedek bugünkü 04:00 dilimden eskiyse sıra gelmiştir', () => {
    expect(lastSlotAt(at('2026-10-04T03:00:00'), '04:00')).toEqual(at('2026-10-03T04:00:00'))
    expect(nextSlotAt(at('2026-10-04T05:00:00'), '04:00')).toEqual(at('2026-10-05T04:00:00'))
    expect(isDue(null, at('2026-10-04T05:00:00'), '04:00')).toBe(true)
    expect(isDue(at('2026-10-04T04:01:00'), at('2026-10-04T23:00:00'), '04:00')).toBe(false)
    expect(isDue(at('2026-10-03T04:01:00'), at('2026-10-04T04:00:00'), '04:00')).toBe(true)
    expect(closingBackupNeeded(at('2026-10-04T04:00:00'), at('2026-10-04T08:00:00'))).toBe(false)
    expect(closingBackupNeeded(at('2026-10-04T04:00:00'), at('2026-10-04T11:00:00'))).toBe(true)
  })

  it('zamanlayıcı kaçırılan yedeği açılıştan sonra alır, ikinci kez almaz', async () => {
    let now = at('2026-10-04T09:00:00')
    let last: Date | null = at('2026-10-02T04:00:00')
    let runs = 0
    const scheduler = createBackupScheduler({
      clock: () => now,
      time: () => '04:00',
      lastAutoAt: () => last,
      run: async () => {
        runs++
        last = now
      },
      setTimer: () => 1,
      clearTimer: () => undefined
    })
    await scheduler.tick()
    await scheduler.tick()
    expect(runs).toBe(1)
    now = at('2026-10-05T04:00:30')
    await scheduler.tick()
    expect(runs).toBe(2)
  })

  it('başarısız yedek her dakika yeniden denenmez: 30 dk, 1, 2, 4, en çok 6 saat bekler; başarıyla sıfırlanır (P14fix #5)', async () => {
    let now = at('2026-10-04T09:00:00')
    let fail = true
    let runs = 0
    let last: Date | null = null
    const errors: unknown[] = []
    const scheduler = createBackupScheduler({
      clock: () => now,
      time: () => '04:00',
      lastAutoAt: () => last,
      run: async () => {
        runs++
        if (fail) throw new Error('disk full')
        last = now
      },
      onError: (e) => errors.push(e),
      setTimer: () => 1,
      clearTimer: () => undefined
    })
    const minutes = async (n: number) => {
      for (let i = 0; i < n; i++) {
        now = new Date(now.getTime() + 60_000)
        await scheduler.tick()
      }
    }
    await scheduler.tick()
    await minutes(10)
    expect(runs).toBe(1)
    await minutes(20) // 30 minutes after the failure
    expect(runs).toBe(2)
    await minutes(59)
    expect(runs).toBe(2)
    await minutes(1) // one hour after the second failure
    expect(runs).toBe(3)
    await minutes(12 * 60 - 1)
    // 2 h, then 4 h; the next one waits the 6-hour ceiling: two more tries in almost twelve hours, not 719.
    expect(runs).toBe(5)
    expect(errors).toHaveLength(5)
    fail = false
    await minutes(1)
    expect(runs).toBe(6)
    await minutes(60)
    expect(runs).toBe(6)
    expect(last).not.toBeNull()
  })
})
