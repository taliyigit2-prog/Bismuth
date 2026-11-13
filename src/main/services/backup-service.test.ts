import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { MIGRATIONS } from '../../../tests/factories/db'
import { readArchive } from '../backup/archive'
import { openDatabase, integrityOfFile, type DatabaseHandle } from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { auditLog, settings } from '../db/schema'
import { encodeRecoveryText, memoryKeyStore, type BismuthKeyStore } from '../security/bismuth-key'
import { applyPendingRestore, BACKUP_DB_NAME, createBackupService } from './backup-service'
import { ctxFromPermissions, systemCtx } from './context'
import { defaultPermissions } from '@shared/permissions'
import { createSettingsService } from './settings-service'

const owner = roleCtx('owner', 'u-owner')
let handle: DatabaseHandle | undefined
const temps: string[] = []
afterEach(() => {
  handle?.close()
  handle = undefined
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const fast = { pagesPerStep: 4, restMs: 0, sleep: () => new Promise<void>((r) => setImmediate(r)) }

async function env(
  opts: {
    drive?: boolean
    keys?: BismuthKeyStore
    schemaVersion?: number
    clock?: string
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'bismuth-backup-'))
  temps.push(root)
  const dbFile = join(root, 'bismuth.db')
  const attachmentsDir = join(root, 'attachments')
  const backupsDir = join(root, 'backups')
  const markerPath = join(root, 'restore-pending.json')
  const driveDir = join(root, 'drive', 'Bismuth', 'yedekler')
  if (opts.drive) mkdirSync(driveDir, { recursive: true })
  mkdirSync(join(attachmentsDir, 'room_issue'), { recursive: true })
  writeFileSync(join(attachmentsDir, 'room_issue', 'a.jpg'), 'foto-1')
  const open = async () => {
    const h = await openDatabase({ file: dbFile, migrationsFolder: MIGRATIONS })
    seedBaseData(h.db)
    return h
  }
  handle = await open()
  const clock = testClock(opts.clock ?? '2026-10-01T09:00:00.000Z')
  const keys = opts.keys ?? memoryKeyStore()
  const svc = () =>
    createBackupService({
      ...depsOf(handle!, clock),
      sqlite: handle!.sqlite,
      backupsDir,
      attachmentsDir,
      restoreMarkerPath: markerPath,
      dataDir: root,
      dbFile,
      appVersion: '1.0.0',
      schemaVersion: () => opts.schemaVersion ?? handle!.schemaVersion,
      keys,
      driveDir: () => (opts.drive ? driveDir : null),
      stepping: fast
    })
  const apply = () => applyPendingRestore({ dbFile, attachmentsDir, backupsDir, markerPath })
  return { root, dbFile, attachmentsDir, backupsDir, markerPath, driveDir, open, clock, svc, keys, apply }
}

const hotelName = (h: DatabaseHandle) =>
  h.db.select().from(settings).where(eq(settings.key, 'hotel.name')).get()?.valueJson

describe('otomatik ve elle yedek (G-120, K-32)', () => {
  it('program yoğun yazarken alınan yedek bozulmaz: integrity_check geçer, başlangıçtaki her satır içindedir', async () => {
    const e = await env()
    const sqlite = handle!.sqlite
    sqlite.exec('create table yük (id integer primary key, v text)')
    const insert = sqlite.prepare('insert into yük (v) values (?)')
    sqlite.transaction(() => {
      for (let i = 0; i < 4000; i++) insert.run(`satır ${i} ${'x'.repeat(200)}`)
    })()
    let writing = true
    let written = 0
    const writer = (async () => {
      while (writing) {
        insert.run(`yedek sırasında ${written++}`)
        await new Promise((r) => setImmediate(r))
      }
    })()
    const item = await e.svc().run(owner, { note: 'yük altında' })
    writing = false
    await writer
    expect(written).toBeGreaterThan(10) // writes really went on during the copy
    expect(item).toMatchObject({ source: 'local', kind: 'manual', verified: true, note: 'yük altında' })
    expect(item.id).toMatch(/^bismuth-yedek-2026-10-01-\d{4}-elle\.bmy$/)

    const out = join(e.root, 'acilan')
    const manifest = await readArchive(join(e.backupsDir, item.id), out)
    expect(manifest.files.map((f) => f.name)).toEqual([BACKUP_DB_NAME, 'attachments/room_issue/a.jpg'])
    expect(integrityOfFile(join(out, BACKUP_DB_NAME))).toBe('ok')
    expect(readFileSync(join(out, 'attachments', 'room_issue', 'a.jpg'), 'utf8')).toBe('foto-1')
    const copy = await openDatabase({ file: join(out, BACKUP_DB_NAME), migrationsFolder: MIGRATIONS })
    try {
      const n = (copy.sqlite.prepare('select count(*) as c from yük').get() as { c: number }).c
      expect(n).toBeGreaterThanOrEqual(4000)
    } finally {
      copy.close()
    }
    expect((await e.svc().verify(owner, { source: 'local', id: item.id })).verified).toBe(true)
  })

  it('geri yükleme önce güvenlik yedeği alır, açılışta veriyi ve ekleri geri koyar; denetim kaydı düşer', async () => {
    const e = await env()
    const settingsSvc = createSettingsService(handle!.db, e.clock)
    settingsSvc.set(owner, { 'hotel.name': 'Yedekten önce' })
    const backup = await e.svc().run(owner)
    e.clock.advance(5)
    // Later changes that the restore must undo.
    settingsSvc.set(owner, { 'hotel.name': 'Yedekten sonra' })
    writeFileSync(join(e.attachmentsDir, 'room_issue', 'b.jpg'), 'foto-2')
    const scheduled = await e.svc().restore(owner, { source: 'local', id: backup.id })
    expect(scheduled.id).toBe(backup.id)
    expect(e.svc().overview(owner).pendingRestore).toMatchObject({ id: backup.id })
    expect(e.svc().status(owner).restorePending).toBe(true)
    // The safety backup of today's data came first.
    const safety = e
      .svc()
      .list(owner)
      .find((i) => i.kind === 'safety')!
    expect(safety.id).toMatch(/-guvenlik\.bmy$/)
    const audit = handle!.db.select().from(auditLog).where(eq(auditLog.entity, 'backup')).all()
    expect(audit.map((a) => a.action)).toEqual(['backup', 'backup', 'restore'])
    handle!.close()
    handle = undefined

    const result = e.apply()
    expect(result).toMatchObject({ status: 'restored', backupId: backup.id })
    expect(existsSync(e.markerPath)).toBe(false)
    expect(existsSync(join(e.attachmentsDir, 'room_issue', 'b.jpg'))).toBe(false)
    expect(readFileSync(join(e.attachmentsDir, 'room_issue', 'a.jpg'), 'utf8')).toBe('foto-1')
    // The unpacked copy is cleaned away; the backup file stays.
    expect(readdirSync(join(e.backupsDir, '.restore'))).toEqual([])
    expect(existsSync(join(e.backupsDir, backup.id))).toBe(true)
    handle = await e.open()
    expect(hotelName(handle)).toBe('"Yedekten önce"')
    e.svc().noteRestored(systemCtx(), result!)
    const restoredAudit = handle.db.select().from(auditLog).where(eq(auditLog.action, 'restore')).all()
    expect(restoredAudit.at(-1)).toMatchObject({ entity: 'backup', entityId: backup.id })
    expect(e.apply()).toBeNull()
  })

  it('bozuk ya da yedek olmayan dosya geri yüklenmez; yeni sürümün yedeği açıklamayla reddedilir', async () => {
    const e = await env({ schemaVersion: 2 })
    const good = await e.svc().run(owner)
    await expect(e.svc().restore(owner, { source: 'local', id: good.id })).rejects.toMatchObject({
      messageKey: 'errors.backupNewerVersion',
      details: { program: 2 }
    })
    expect(existsSync(e.markerPath)).toBe(false)
    const bytes = readFileSync(join(e.backupsDir, good.id))
    bytes[bytes.length - 20] = (bytes[bytes.length - 20] ?? 0) ^ 0xff
    writeFileSync(join(e.backupsDir, good.id), bytes)
    await expect(e.svc().restore(owner, { source: 'local', id: good.id })).rejects.toMatchObject({
      messageKey: 'errors.backupDamaged'
    })
    expect((await e.svc().verify(owner, { source: 'local', id: good.id })).verified).toBe(false)
    writeFileSync(join(e.backupsDir, 'bismuth-yedek-2026-09-01-0400.bmy'), 'bu bir yedek değil')
    await expect(
      e.svc().restore(owner, { source: 'local', id: 'bismuth-yedek-2026-09-01-0400.bmy' })
    ).rejects.toMatchObject({ messageKey: 'errors.backupNotBackup' })
    await expect(e.svc().restore(owner, { source: 'local', id: '../bismuth.db' })).rejects.toMatchObject({
      messageKey: 'errors.backupPath'
    })
    // A marker pointing outside the backups folder is refused at start and kept as .failed.
    writeFileSync(e.markerPath, JSON.stringify({ backupId: 'x', dir: '../../etc', sha256: 'x' }))
    expect(e.apply()).toEqual({ status: 'failed', reason: 'invalid' })
    expect(existsSync(`${e.markerPath}.failed`)).toBe(true)
  })

  it('30 gün saklanır: 31. gün yeni yedek gelince en eskisi burada ve Drive klasöründe silinir', async () => {
    const e = await env({ drive: true, clock: '2026-09-01T01:00:00.000Z' })
    const manual = await e.svc().run(owner)
    const autos = (dir: string) => readdirSync(dir).filter((n) => /-\d{4}\.bmy$/.test(n))
    for (let day = 0; day <= 30; day++) {
      await e.svc().runAuto(systemCtx())
      if (day < 30) e.clock.advance(24 * 60)
    }
    // Day 30: the first one is exactly 30 days old and still kept.
    expect(autos(e.backupsDir)).toHaveLength(31)
    expect(autos(e.driveDir)).toHaveLength(31)
    const oldest = autos(e.backupsDir).sort()[0]!
    e.clock.advance(24 * 60)
    await e.svc().runAuto(systemCtx())
    expect(autos(e.backupsDir)).toHaveLength(31)
    expect(autos(e.backupsDir)).not.toContain(oldest)
    expect(autos(e.driveDir)).not.toContain(oldest)
    // Manual copies stay until removed by hand.
    expect(existsSync(join(e.backupsDir, manual.id))).toBe(true)
    expect(e.svc().lastAutoAt()?.toISOString()).toBe(e.clock().toISOString().slice(0, 16) + ':00.000Z')
  })

  it('Drive klasörü yoksa yedek alınır, Drive sessizce atlanır ve durum uyarı verir', async () => {
    const e = await env({ drive: false })
    expect(e.svc().status(owner).warnings).toEqual(['stale', 'drive'])
    await e.svc().run(owner)
    const status = e.svc().status(owner)
    expect(status.drive.state).toBe('missing')
    expect(status.warnings).toEqual(['drive'])
    expect(status.lastBackupAt).toBe('2026-10-01T09:00:00.000Z')
    // The Today badge reads it with the "today" right only.
    expect(e.svc().status(roleCtx('housekeeping')).warnings).toEqual(['drive'])
  })

  it('geçiş öncesi kopyalar listede görünür ve saklama sayısı ayardan gelir', async () => {
    const e = await env()
    mkdirSync(e.backupsDir, { recursive: true })
    for (const t of ['20260901-100000', '20260902-100000', '20260903-100000'])
      writeFileSync(join(e.backupsDir, `bismuth-pre-migration_0.9.0_${t}.db`), 'x')
    expect(
      e
        .svc()
        .list(owner)
        .filter((i) => i.source === 'preMigration')
    ).toHaveLength(3)
    createSettingsService(handle!.db, e.clock).set(owner, { 'backup.preMigrationKeep': 2 })
    await e.svc().runAuto(systemCtx())
    const left = e
      .svc()
      .list(owner)
      .filter((i) => i.source === 'preMigration')
      .map((i) => i.id)
    expect(left.sort()).toEqual([
      'bismuth-pre-migration_0.9.0_20260902-100000.db',
      'bismuth-pre-migration_0.9.0_20260903-100000.db'
    ])
  })
})

describe('geri yükleme ve uzaktan erişim (P13sec)', () => {
  const fromPhone = ctxFromPermissions('u-owner', 'phone', 'http', defaultPermissions('owner'))

  it('geri yüklenen veri yeni bir dönem açar: kopyalar ve kutu tam kopyayla yeniden başlar (Faz 11/14 #1)', async () => {
    const e = await env()
    const backup = await e.svc().run(owner)
    // Meanwhile the hotel's computer had gone through two terms (a takeover back and forth).
    handle!.sqlite.prepare("UPDATE settings SET value_json = '3' WHERE key = 'host.epoch'").run()
    handle!.sqlite
      .prepare(
        "INSERT OR IGNORE INTO settings (key, value_json, updated_at) VALUES ('host.epoch', '3', '2026-10-01')"
      )
      .run()
    await e.svc().restore(owner, { source: 'local', id: backup.id })
    handle!.close()
    handle = undefined
    const result = e.apply()
    expect(result).toMatchObject({ status: 'restored', previousTerm: 3 })
    handle = await e.open()
    // The restored file still says term 1…
    const term = () =>
      handle!.db.select().from(settings).where(eq(settings.key, 'host.epoch')).get()?.valueJson ?? '1'
    expect(term()).toBe('1')
    e.svc().noteRestored(systemCtx(), result!)
    // …and starts above both: 4.
    expect(term()).toBe('4')
    const audit = handle.db.select().from(auditLog).where(eq(auditLog.action, 'restore')).all().at(-1)!
    expect(JSON.parse(audit.afterJson!)).toMatchObject({ term: { from: 1, to: 4 } })
  })

  it('anahtarı gösterme, girme ve geri yükleme yalnız programın kendi penceresinden (Y-1)', async () => {
    const e = await env({ drive: true })
    const item = await e.svc().run(owner)
    expect(() => e.svc().recoveryText(fromPhone)).toThrow(/errors.backupDesktopOnly/)
    expect(() => e.svc().setRecoveryText(fromPhone, encodeRecoveryText(randomBytes(32)), true)).toThrow(
      /errors.backupDesktopOnly/
    )
    await expect(e.svc().restore(fromPhone, { source: 'local', id: item.id })).rejects.toMatchObject({
      messageKey: 'errors.backupDesktopOnly'
    })
    expect(existsSync(e.markerPath)).toBe(false)
    await expect(e.svc().pickDriveFolder(fromPhone)).rejects.toMatchObject({
      messageKey: 'errors.backupDesktopOnly'
    })
  })

  it('Drive klasörü yalnız klasör seçiciyle; ağ paylaşımı seçilemez (O-7)', async () => {
    const e = await env()
    const pick = (chosen: string | null) =>
      createBackupService({
        ...depsOf(handle!, e.clock),
        sqlite: handle!.sqlite,
        backupsDir: e.backupsDir,
        attachmentsDir: e.attachmentsDir,
        restoreMarkerPath: e.markerPath,
        pickFolder: async () => chosen
      }).pickDriveFolder(owner)
    expect(await pick(e.driveDir)).toBe(e.driveDir)
    expect(await pick(null)).toBeNull()
    await expect(pick('\\\\saldirgan\\paylasim')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(pick('goreli/klasor')).rejects.toMatchObject({ code: 'VALIDATION' })
  })

  it('"Drive klasörünü bul" bulunan klasörü döner, yoksa null; yalnız programın kendi penceresinden', async () => {
    const e = await env()
    const make = (found: string | null) =>
      createBackupService({
        ...depsOf(handle!, e.clock),
        sqlite: handle!.sqlite,
        backupsDir: e.backupsDir,
        attachmentsDir: e.attachmentsDir,
        restoreMarkerPath: e.markerPath,
        prepareDriveDir: () => found
      })
    expect(make(e.driveDir).findDriveFolder(owner)).toBe(e.driveDir)
    expect(make(null).findDriveFolder(owner)).toBeNull()
    expect(() => make(e.driveDir).findDriveFolder(fromPhone)).toThrow(/errors.backupDesktopOnly/)
  })

  it("Drive'da aynı adlı yedek varsa (başka bilgisayarın) üzerine yazılmaz, yeni adla yazılır", async () => {
    const e = await env({ drive: true })
    // Another computer of the hotel left a copy with this minute's name.
    const name = 'bismuth-yedek-2026-10-01-1200-elle.bmy'
    writeFileSync(join(e.driveDir, name), 'baskasinin-yedegi')
    const item = await e.svc().run(owner)
    expect(item.id).toBe(name)
    expect(readFileSync(join(e.driveDir, name), 'utf8')).toBe('baskasinin-yedegi')
    expect(existsSync(join(e.driveDir, 'bismuth-yedek-2026-10-01-1200-elle-2.bmy'))).toBe(true)
  })
})

describe('Drive kopyası şifreli (K-05)', () => {
  it('anahtarsız açılmaz, yanlış anahtarla açılmaz; kağıttaki anahtarla geri yüklenir', async () => {
    const hotelKeys = memoryKeyStore()
    const e = await env({ drive: true, keys: hotelKeys })
    const item = await e.svc().run(owner)
    const driveFile = join(e.driveDir, item.id)
    const head = readFileSync(driveFile).subarray(0, 8).toString('latin1')
    expect(head).toBe('BSMYENC1')
    expect(readFileSync(driveFile).includes(Buffer.from('SQLite format 3'))).toBe(false)
    const listed = e
      .svc()
      .list(owner)
      .find((i) => i.source === 'drive')!
    expect(listed).toMatchObject({ id: item.id, encrypted: true })

    // Another computer: no key at first.
    const otherKeys = memoryKeyStore()
    const other = createBackupService({
      ...depsOf(handle!, e.clock),
      sqlite: handle!.sqlite,
      backupsDir: e.backupsDir,
      attachmentsDir: e.attachmentsDir,
      restoreMarkerPath: e.markerPath,
      keys: otherKeys,
      schemaVersion: () => handle!.schemaVersion,
      driveDir: () => e.driveDir,
      stepping: fast
    })
    await expect(other.restore(owner, { source: 'drive', id: item.id })).rejects.toMatchObject({
      messageKey: 'errors.backupKeyMissing'
    })
    // Its first own backup made a key of its own: that one does not open the hotel's copy either.
    otherKeys.getOrCreate()
    await expect(other.restore(owner, { source: 'drive', id: item.id })).rejects.toMatchObject({
      messageKey: 'errors.backupWrongKey'
    })
    const wrong = encodeRecoveryText(Buffer.alloc(32, 7))
    await expect(
      other.restore(owner, { source: 'drive', id: item.id, recoveryText: wrong })
    ).rejects.toMatchObject({ messageKey: 'errors.backupWrongKey' })
    await expect(
      other.restore(owner, { source: 'drive', id: item.id, recoveryText: 'AAAAA-BBBBB' })
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const paper = e.svc().recoveryText(owner).text
    expect(paper).toMatch(/^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/)
    // The paper opens the copy, but this computer keeps a different key of its own: not changed without asking
    // (Faz 11/14 #7); nothing is scheduled.
    const ownKey = otherKeys.get()
    await expect(
      other.restore(owner, { source: 'drive', id: item.id, recoveryText: paper })
    ).rejects.toMatchObject({ messageKey: 'errors.backupKeyExists' })
    expect(otherKeys.get()).toEqual(ownKey)
    expect(existsSync(e.markerPath)).toBe(false)
    const ok = await other.restore(owner, {
      source: 'drive',
      id: item.id,
      recoveryText: paper,
      replace: true
    })
    expect(ok.id).toBe(item.id)
    // From now on this computer encrypts with the hotel's key (the paper keeps working).
    expect(otherKeys.get()?.equals(hotelKeys.get()!)).toBe(true)
    expect(e.apply()).toMatchObject({ status: 'restored' })
    // The key shown on screen is in the audit log.
    expect(
      handle!.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'export'))
        .all()
        .map((a) => a.entityId)
    ).toEqual(['recovery_text'])
  })

  it('anahtar saklanamayan bilgisayarda Drive kopyası yazılmaz, durum "noKey" olur', async () => {
    const e = await env({ drive: true, keys: memoryKeyStore(null, false) })
    await e.svc().run(owner)
    expect(readdirSync(e.driveDir)).toEqual([])
    expect(e.svc().status(owner).drive.state).toBe('noKey')
    expect(() => e.svc().recoveryText(owner)).toThrow(/errors.backupKeyUnavailable/)
  })

  it('kendi anahtarını önceden yapmış yeni bilgisayar kâğıttaki anahtarı ancak onayla alır (P16d bulgusu)', async () => {
    const own = randomBytes(32)
    const hotel = randomBytes(32)
    const e = await env({ keys: memoryKeyStore(own) })
    expect(() => e.svc().setRecoveryText(owner, encodeRecoveryText(hotel))).toThrow(/errors.backupKeyExists/)
    expect(e.keys.get()).toEqual(own)
    e.svc().setRecoveryText(owner, encodeRecoveryText(hotel), true)
    expect(e.keys.get()).toEqual(hotel)
    // The same key again needs no confirmation.
    e.svc().setRecoveryText(owner, encodeRecoveryText(hotel))
    expect(e.keys.get()).toEqual(hotel)
  })
})
