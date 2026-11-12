// Backup bug-hunt fixes (P14fix #4 a restore that failed at start is shown, #8 a key never shown is pointed out,
// #12 the data entered between "Geri yükle" and the restart can be restored from the list, #6 the checks of a
// copy run off the main thread, #21 the optional encryption of the copies kept on this computer).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { MIGRATIONS } from '../../../tests/factories/db'
import { openDatabase, type DatabaseHandle } from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { backups, settings } from '../db/schema'
import { encodeRecoveryText, memoryKeyStore, type BismuthKeyStore } from '../security/bismuth-key'
import { applyPendingRestore, createBackupService } from './backup-service'
import { systemCtx } from './context'
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

async function env(opts: { drive?: boolean; keys?: BismuthKeyStore } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bismuth-backup-fix-'))
  temps.push(root)
  const dbFile = join(root, 'bismuth.db')
  const attachmentsDir = join(root, 'attachments')
  const backupsDir = join(root, 'backups')
  const markerPath = join(root, 'restore-pending.json')
  const driveDir = join(root, 'drive', 'Bismuth', 'yedekler')
  if (opts.drive) mkdirSync(driveDir, { recursive: true })
  mkdirSync(attachmentsDir, { recursive: true })
  const open = async () => {
    const h = await openDatabase({ file: dbFile, migrationsFolder: MIGRATIONS })
    seedBaseData(h.db)
    return h
  }
  handle = await open()
  const clock = testClock('2026-10-01T09:00:00.000Z')
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
      schemaVersion: () => handle!.schemaVersion,
      keys,
      driveDir: () => (opts.drive ? driveDir : null),
      stepping: fast
    })
  const apply = () => applyPendingRestore({ dbFile, attachmentsDir, backupsDir, markerPath })
  const reopen = async () => {
    handle?.close()
    handle = await open()
  }
  return { root, backupsDir, markerPath, driveDir, clock, svc, keys, apply, reopen }
}

const setName = (e: { clock: ReturnType<typeof testClock> }, name: string) =>
  createSettingsService(handle!.db, e.clock).set(owner, { 'hotel.name': name })
const hotelName = () =>
  handle!.db.select().from(settings).where(eq(settings.key, 'hotel.name')).get()?.valueJson

describe('açılışta yapılamayan geri yükleme (P14fix #4)', () => {
  it('sağlaması tutmayan kopya geri yüklenmez; Yedek ve Bugün "Geri yükleme yapılamadı" der; Tamam ile kalkar', async () => {
    const e = await env()
    const backup = await e.svc().run(owner)
    await e.svc().restore(owner, { source: 'local', id: backup.id })
    // The unpacked copy changed on disk before the restart (a disk error, an antivirus…).
    const marker = JSON.parse(readFileSync(e.markerPath, 'utf8')) as { dir: string }
    writeFileSync(join(e.backupsDir, marker.dir, 'bismuth.db'), 'bozuk')
    handle!.close()
    handle = undefined
    expect(e.apply()).toEqual({ status: 'failed', reason: 'checksum' })
    await e.reopen()
    e.svc().noteRestored(systemCtx(), { status: 'failed', reason: 'checksum' })
    expect(e.svc().status(owner).warnings).toContain('restoreFailed')
    expect(e.svc().status(roleCtx('housekeeping')).warnings).toContain('restoreFailed')
    expect(e.svc().overview(owner)).toMatchObject({
      pendingRestore: null,
      restoreFailed: { id: backup.id, reason: 'checksum' }
    })
    expect(e.svc().cancelRestore(owner)).toBe(true)
    expect(e.svc().status(owner).warnings).not.toContain('restoreFailed')
    expect(e.svc().overview(owner).restoreFailed).toBeNull()
  })

  it('geri yüklenen yedeğin kaydına geri yükleme zamanı yazılır', async () => {
    const e = await env()
    const backup = await e.svc().run(owner)
    await e.svc().restore(owner, { source: 'local', id: backup.id })
    handle!.close()
    handle = undefined
    const result = e.apply()!
    await e.reopen()
    e.clock.advance(1)
    e.svc().noteRestored(systemCtx(), result)
    const row = handle!.db.select().from(backups).where(eq(backups.path, backup.id)).get()
    expect(row?.restoredAt).toBe(e.clock().toISOString())
  })
})

describe('gösterilmemiş Bismuth anahtarı (P14fix #8)', () => {
  it('ilk Drive yedeğinde sessizce yapılan anahtar gösterilene kadar Bugün ve Yedek uyarır', async () => {
    const e = await env({ drive: true })
    expect(e.svc().status(owner).warnings).not.toContain('keyNotShown')
    await e.svc().run(owner)
    expect(e.keys.info().exists).toBe(true)
    expect(e.svc().status(owner).warnings).toContain('keyNotShown')
    expect(e.svc().status(roleCtx('reception')).warnings).toContain('keyNotShown')
    e.svc().recoveryText(owner)
    expect(e.svc().status(owner).warnings).not.toContain('keyNotShown')
  })

  it('kâğıttan girilen anahtar için uyarı çıkmaz (sahibinde zaten yazılı)', async () => {
    const keys = memoryKeyStore(null)
    const e = await env({ drive: true, keys })
    e.svc().setRecoveryText(owner, encodeRecoveryText(Buffer.alloc(32, 9)))
    await e.svc().run(owner)
    expect(e.svc().status(owner).warnings).not.toContain('keyNotShown')
  })
})

describe('geri yükle ile yeniden başlatma arasında girilenler (P14fix #12)', () => {
  it('açılıştaki güvenlik kopyası listede görünür ve ondan geri yüklenebilir', async () => {
    const e = await env()
    setName(e, 'Yedekteki ad')
    const backup = await e.svc().run(owner)
    await e.svc().restore(owner, { source: 'local', id: backup.id })
    // Entered after "Geri yükle", before the restart: not in the restored data.
    setName(e, 'Sonradan girilen ad')
    handle!.close()
    handle = undefined
    expect(e.apply()).toMatchObject({ status: 'restored' })
    await e.reopen()
    expect(hotelName()).toBe('"Yedekteki ad"')
    const safety = e
      .svc()
      .list(owner)
      .find((i) => i.id.startsWith('bismuth-safety_'))
    expect(safety).toMatchObject({ source: 'local', kind: 'safety', encrypted: false })
    expect((await e.svc().verify(owner, { source: 'local', id: safety!.id })).verified).toBe(true)
    await e.svc().restore(owner, { source: 'local', id: safety!.id })
    handle!.close()
    handle = undefined
    expect(e.apply()).toMatchObject({ status: 'restored' })
    await e.reopen()
    expect(hotelName()).toBe('"Sonradan girilen ad"')
    expect(readdirSync(e.backupsDir).some((n) => n.startsWith('bismuth-safety_'))).toBe(true)
    expect(existsSync(e.markerPath)).toBe(false)
  })
})
