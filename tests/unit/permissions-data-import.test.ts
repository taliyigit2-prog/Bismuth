// P14fix permissions of the import batches (G-23): the list, "Bu aktarımı iptal et" and the template file are
// checked in the service, whatever the screen shows.
import { afterEach, describe, expect, it } from 'vitest'
import { ctxFromPermissions } from '../../src/main/services/context'
import { createDataImportService } from '../../src/main/services/data-import-service'
import { createExpensesService } from '../../src/main/services/expenses-service'
import { createPaymentsService } from '../../src/main/services/payments-service'
import { createReservationsService } from '../../src/main/services/reservations-service'
import { createStaffService } from '../../src/main/services/staff-service'
import type { DatabaseHandle } from '../../src/main/db/client'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle | undefined
afterEach(() => {
  handle?.close()
  handle = undefined
})

const denied = { code: 'PERMISSION_DENIED' }

async function setup() {
  handle = await seededDatabase()
  const deps = depsOf(handle, testClock())
  return createDataImportService({
    ...deps,
    reservations: createReservationsService(deps),
    payments: createPaymentsService(deps),
    expenses: createExpensesService(deps),
    staff: createStaffService(deps)
  })
}

const ledger = {
  template: 'ledgerRows' as const,
  fileName: 'defter.csv',
  contentBase64: Buffer.from(
    'Tarih;Ücret;Birim;İsim;Ödeme Yöntemi\n01.10.2026;100;TL;Deneme;Nakit\n'
  ).toString('base64')
}

describe('içe aktarma kayıtları yetkileri (P14fix #2, #10)', () => {
  it('yedek yetkisi olmayan aktarımları göremez, iptal edemez, örnek dosya alamaz', async () => {
    const imports = await setup()
    const manager = roleCtx('manager') // settings.backup: none
    expect(() => imports.batches(manager)).toThrow(/PERMISSION_DENIED/)
    expect(() => imports.voidBatch(manager, { id: '01J00000000000000000000000', reason: 'Deneme' })).toThrow(
      /PERMISSION_DENIED/
    )
    await expect(imports.sample(manager, { template: 'salaryRows', locale: 'tr' })).rejects.toMatchObject(
      denied
    )
  })

  it('yalnız görüntüleyen listeyi görür ama aktarımı iptal edemez', async () => {
    const imports = await setup()
    const owner = roleCtx('owner', 'u-owner')
    const report = await imports.run(owner, ledger)
    const viewer = ctxFromPermissions('u-view', 'd', 'ipc', { 'settings.backup': 'view' })
    expect(imports.batches(viewer).map((b) => b.id)).toEqual([report.batchId])
    expect(() => imports.voidBatch(viewer, { id: report.batchId!, reason: 'Deneme' })).toThrow(
      /PERMISSION_DENIED/
    )
    // Backup right alone is not enough: voiding payments needs the payment rights too (one transaction, nothing done).
    const backupOnly = ctxFromPermissions('u-b', 'd', 'ipc', { 'settings.backup': 'edit' })
    expect(() => imports.voidBatch(backupOnly, { id: report.batchId!, reason: 'Deneme' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(imports.batches(owner)[0]?.voidedAt).toBeNull()
  })
})
