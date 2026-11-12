// Faz 14 permissions (G-23): every backup, export and import call is checked in the service, whatever the screen
// shows. Each method: a role without the right gets PERMISSION_DENIED; remote callers cannot open folders or restart.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import { createBackupService } from '../../src/main/services/backup-service'
import { createDataExportService } from '../../src/main/services/data-export-service'
import { datasetOf } from '../../src/main/services/data-transfer/export-catalog'
import { createDataImportService } from '../../src/main/services/data-import-service'
import { createExpensesService } from '../../src/main/services/expenses-service'
import { createPaymentsService } from '../../src/main/services/payments-service'
import { createReservationsService } from '../../src/main/services/reservations-service'
import { memoryKeyStore } from '../../src/main/security/bismuth-key'
import type { DatabaseHandle } from '../../src/main/db/client'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle | undefined
const temps: string[] = []
afterEach(() => {
  handle?.close()
  handle = undefined
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const denied = { code: 'PERMISSION_DENIED' }
const nobody = ctxFromPermissions('u-none', 'd', 'ipc', {})
/** The owner on a phone or another computer (server mode). */
const remoteOwner: Ctx = ctxFromPermissions('u-owner', 'd', 'http', defaultPermissions('owner'))

async function setup() {
  handle = await seededDatabase()
  const root = mkdtempSync(join(tmpdir(), 'bismuth-perm-'))
  temps.push(root)
  const deps = depsOf(handle, testClock())
  const backup = createBackupService({
    ...deps,
    sqlite: handle.sqlite,
    backupsDir: join(root, 'backups'),
    attachmentsDir: join(root, 'attachments'),
    restoreMarkerPath: join(root, 'restore.json'),
    keys: memoryKeyStore(),
    driveDir: () => null,
    openPath: async () => '',
    relaunch: () => undefined
  })
  const reservations = createReservationsService(deps)
  const payments = createPaymentsService(deps)
  const expenses = createExpensesService(deps)
  return {
    backup,
    exports: createDataExportService(deps),
    imports: createDataImportService({ ...deps, reservations, payments, expenses })
  }
}

const csv = Buffer.from('Tarih;Ücret;Birim;İsim;Ödeme Yöntemi\n01.10.2026;100;TL;Deneme;Nakit\n').toString(
  'base64'
)

describe('yedek yetkileri (settings.backup)', () => {
  it('yetkisiz rol yedek alamaz, listeleyemez, geri yükleyemez, budayamaz', async () => {
    const { backup } = await setup()
    const manager = roleCtx('manager') // settings.backup: none
    await expect(backup.run(manager)).rejects.toMatchObject(denied)
    await expect(backup.runAuto(manager)).rejects.toMatchObject(denied)
    expect(() => backup.list(manager)).toThrow(/PERMISSION_DENIED/)
    expect(() => backup.overview(manager)).toThrow(/PERMISSION_DENIED/)
    await expect(backup.verify(manager, { source: 'local', id: 'x.bmy' })).rejects.toMatchObject(denied)
    await expect(backup.restore(manager, { source: 'local', id: 'x.bmy' })).rejects.toMatchObject(denied)
    expect(() => backup.cancelRestore(manager)).toThrow(/PERMISSION_DENIED/)
    expect(() => backup.pendingRestore(manager)).toThrow(/PERMISSION_DENIED/)
    expect(() => backup.prune(manager)).toThrow(/PERMISSION_DENIED/)
    expect(() => backup.restart(manager)).toThrow(/PERMISSION_DENIED/)
    await expect(backup.openFolder(manager, 'data')).rejects.toMatchObject(denied)
    expect(() => backup.noteRestored(manager, { status: 'failed', reason: 'io' })).toThrow(
      /PERMISSION_DENIED/
    )
    await expect(backup.pickDriveFolder(manager)).rejects.toMatchObject(denied)
  })

  it('yalnız görüntüleyen rol listeyi görür ama yedek alamaz', async () => {
    const { backup } = await setup()
    const viewer = ctxFromPermissions('u-view', 'd', 'ipc', { 'settings.backup': 'view' })
    expect(backup.list(viewer)).toEqual([])
    expect(backup.overview(viewer).canOpenFolders).toBe(true)
    await expect(backup.run(viewer)).rejects.toMatchObject(denied)
    expect(() => backup.prune(viewer)).toThrow(/PERMISSION_DENIED/)
  })

  it('durum rozeti "Bugün" yetkisiyle okunur; hiçbir yetkisi olmayan okuyamaz', async () => {
    const { backup } = await setup()
    expect(backup.status(roleCtx('employee')).warnings).toContain('stale')
    expect(() => backup.status(nobody)).toThrow(/PERMISSION_DENIED/)
  })

  it('Bismuth anahtarını yalnız uzaktan erişim yetkisi de olan görür; muhasebe göremez', async () => {
    const { backup } = await setup()
    const accountant = roleCtx('accountant') // settings.backup edit, remote.settings none
    expect(() => backup.recoveryText(accountant)).toThrow(/PERMISSION_DENIED/)
    expect(() => backup.setRecoveryText(accountant, 'x'.repeat(55))).toThrow(/PERMISSION_DENIED/)
    expect(backup.recoveryText(roleCtx('owner')).text).toHaveLength(65)
  })

  it('uzaktan bağlanan sahip klasör açamaz ve programı yeniden başlatamaz', async () => {
    const { backup } = await setup()
    await expect(backup.openFolder(remoteOwner, 'data')).rejects.toMatchObject({
      messageKey: 'errors.backupDesktopOnly'
    })
    expect(() => backup.restart(remoteOwner)).toThrow(/errors.backupDesktopOnly/)
    expect(backup.overview(remoteOwner).canOpenFolders).toBe(false)
  })

  it('uzaktan bağlanan sahip planlı geri yüklemeyi iptal edemez; genel bakışta yerel klasör yolları yok (N-9)', async () => {
    const { backup } = await setup()
    expect(() => backup.cancelRestore(remoteOwner)).toThrow(/errors.backupDesktopOnly/)
    expect(backup.overview(remoteOwner)).toMatchObject({ dataDir: null, backupsDir: null, driveDir: null })
    // The hotel computer's own window still sees them and may cancel.
    const local = backup.overview(roleCtx('owner'))
    expect(local.backupsDir).toMatch(/backups$/)
    expect(local.dataDir).not.toBeNull()
    expect(backup.cancelRestore(roleCtx('owner'))).toBe(false)
  })

  it('uzaktan bağlanan sahip anahtarı göremez/giremez, geri yükleyemez, Drive klasörü seçemez (K-45, Y-1)', async () => {
    const { backup } = await setup()
    expect(() => backup.recoveryText(remoteOwner)).toThrow(/errors.backupDesktopOnly/)
    expect(() => backup.setRecoveryText(remoteOwner, 'x'.repeat(55), true)).toThrow(
      /errors.backupDesktopOnly/
    )
    await expect(backup.restore(remoteOwner, { source: 'local', id: 'x.bmy' })).rejects.toMatchObject({
      messageKey: 'errors.backupDesktopOnly'
    })
    await expect(backup.pickDriveFolder(remoteOwner)).rejects.toMatchObject({
      messageKey: 'errors.backupDesktopOnly'
    })
  })
})

describe('dışa ve içe aktarma yetkileri', () => {
  it('reports.export olmayan rol dışa aktaramaz; tablo yetkisi olmayan tablo verilmez', async () => {
    const { exports } = await setup()
    expect(() => exports.datasets(roleCtx('reception'))).toThrow(/PERMISSION_DENIED/)
    await expect(
      exports.run(roleCtx('housekeeping'), { dataset: 'guests', format: 'csv', locale: 'tr' })
    ).rejects.toMatchObject(denied)
    const exportOnly = ctxFromPermissions('u-x', 'd', 'ipc', { 'reports.export': 'view' })
    expect(exports.datasets(exportOnly)).toEqual([])
    await expect(
      exports.run(exportOnly, { dataset: 'all', format: 'xlsx', locale: 'tr' })
    ).rejects.toMatchObject(denied)
  })

  it('eklenen tablolar ekrandaki yetkiyi ister: yetkisi olmayan listede görmez, dışa aktaramaz (QA2x)', async () => {
    const { exports } = await setup()
    const added = [
      'folioCharges',
      'reservationNotes',
      'roomTypes',
      'rooms',
      'roomCapacity',
      'roomBlocks',
      'cashHandovers',
      'ledgerDays',
      'employmentPeriods',
      'shiftHandovers',
      'boardNotes',
      'calendarDays',
      'fxRates',
      'laundryPrices',
      'laundrySettlements',
      'productCategories',
      'importBatches'
    ] as const
    for (const id of added) {
      const def = datasetOf(id)
      expect(def.permissions.length, id).toBeGreaterThan(0)
      // Everything but the table's own right (and the rights that need it): the table is not offered.
      const without = { ...defaultPermissions('owner') }
      for (const key of def.permissions) without[key] = 'none'
      const ctx = ctxFromPermissions('u-x', 'd', 'ipc', without)
      expect(
        exports.datasets(ctx).map((d) => d.id),
        id
      ).not.toContain(id)
      await expect(exports.run(ctx, { dataset: id, format: 'csv', locale: 'tr' }), id).rejects.toMatchObject(
        denied
      )
      expect(exports.datasets(roleCtx('owner')).map((d) => d.id)).toContain(id)
    }
    // Default roles: the accountant has no shift notes and no room settings; the manager no imports (backup).
    const accountant = exports.datasets(roleCtx('accountant')).map((d) => d.id)
    for (const id of ['shiftHandovers', 'boardNotes', 'roomTypes', 'rooms', 'roomCapacity'] as const)
      expect(accountant).not.toContain(id)
    expect(accountant).toContain('cashHandovers')
    expect(exports.datasets(roleCtx('manager')).map((d) => d.id)).not.toContain('importBatches')
    await expect(
      exports.run(roleCtx('manager'), { dataset: 'importBatches', format: 'csv', locale: 'tr' })
    ).rejects.toMatchObject(denied)
  })

  it('içe aktarma yedek yetkisi ve hedef alanın yazma yetkisi ister', async () => {
    const { imports } = await setup()
    const grid = { template: 'reservationGrid' as const, fileName: 'r.csv', contentBase64: csv }
    const ledger = { template: 'ledgerRows' as const, fileName: 'd.csv', contentBase64: csv }
    await expect(imports.preview(roleCtx('manager'), ledger)).rejects.toMatchObject(denied)
    await expect(imports.run(roleCtx('reception'), grid)).rejects.toMatchObject(denied)
    // The accountant may import the ledger (payments + expenses) but not reservations (calendar: view only).
    await expect(imports.preview(roleCtx('accountant'), grid)).rejects.toMatchObject(denied)
    expect((await imports.preview(roleCtx('accountant'), ledger)).recordCount).toBe(1)
  })
})
