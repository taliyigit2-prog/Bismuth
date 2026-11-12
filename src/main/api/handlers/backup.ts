// Handlers of procedures/backup.ts (Faz 14): contract procedure → service call.
import type { backupProcedures } from '@shared/contract/procedures/backup'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const backupHandlers = (services: Services): HandlersFor<keyof typeof backupProcedures> => ({
  'backup.status': (ctx) => services.backup.status(ctx),
  'backup.overview': (ctx) => services.backup.overview(ctx),
  'backup.run': (ctx, input) => services.backup.run(ctx, input),
  'backup.verify': (ctx, input) => services.backup.verify(ctx, input),
  'backup.restore': (ctx, input) => services.backup.restore(ctx, input),
  'backup.cancelRestore': (ctx) => {
    services.backup.cancelRestore(ctx)
    return { ok: true }
  },
  'backup.restart': (ctx) => {
    services.backup.restart(ctx)
    return { ok: true }
  },
  'backup.openFolder': async (ctx, input) => {
    await services.backup.openFolder(ctx, input.which)
    return { ok: true }
  },
  'backup.pickDriveFolder': async (ctx) => {
    const chosen = await services.backup.pickDriveFolder(ctx)
    const values =
      chosen === null
        ? services.settings.get(ctx)
        : services.settings.set(ctx, { 'backup.driveFolder': chosen })
    return { folder: values['backup.driveFolder'] }
  },
  'backup.recoveryText': (ctx) => services.backup.recoveryText(ctx),
  'backup.setRecoveryText': (ctx, input) => {
    services.backup.setRecoveryText(ctx, input.text, input.replace ?? false)
    return { ok: true }
  },
  'dataExport.datasets': (ctx) => services.dataExport.datasets(ctx),
  'dataExport.run': (ctx, input) => services.dataExport.run(ctx, input),
  'dataImport.preview': (ctx, input) => services.dataImport.preview(ctx, input),
  'dataImport.run': (ctx, input) => services.dataImport.run(ctx, input),
  'dataImport.batches': (ctx) => services.dataImport.batches(ctx),
  'dataImport.voidBatch': (ctx, input) => services.dataImport.voidBatch(ctx, input),
  'dataImport.sample': (ctx, input) => services.dataImport.sample(ctx, input)
})
