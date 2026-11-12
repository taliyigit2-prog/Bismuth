// Faz 14: backups, restore, export, import.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/backup.ts.
import * as z from 'zod'
import {
  backupItemSchema,
  backupOverviewSchema,
  backupRefSchema,
  backupRunInputSchema,
  backupStatusSchema,
  exportDatasetInfoSchema,
  exportFileSchema,
  exportRunInputSchema,
  importBatchSchema,
  importInputSchema,
  importPreviewSchema,
  importReportSchema,
  importSampleInputSchema,
  importVoidInputSchema,
  openFolderInputSchema,
  recoveryTextOutputSchema,
  recoveryTextSchema,
  restoreInputSchema,
  restoreScheduledSchema
} from '../backup'
import { empty, proc, type Procedure } from '../proc'

const ok = z.object({ ok: z.literal(true) })

export const backupProcedures = {
  /** The Today badge and the Backup section's first line (G-120). */
  'backup.status': proc(empty, backupStatusSchema),
  'backup.overview': proc(empty, backupOverviewSchema),
  /** A backup now (G-121): here and, encrypted, in Drive. */
  'backup.run': proc(backupRunInputSchema, backupItemSchema),
  /** Opens the copy and checks it (integrity_check). */
  'backup.verify': proc(backupRefSchema, backupItemSchema),
  /** Safety backup first, then the chosen copy replaces the data at the next start. */
  'backup.restore': proc(restoreInputSchema, restoreScheduledSchema),
  'backup.cancelRestore': proc(empty, ok),
  /** Starts the program again (applies a scheduled restore); the program's own window only. */
  'backup.restart': proc(empty, ok),
  'backup.openFolder': proc(openFolderInputSchema, ok),
  /** "Klasör seç" for the Drive copies: the system's folder dialog of the program's own window (K-45 (3)). */
  'backup.pickDriveFolder': proc(empty, z.object({ folder: z.string() })),
  /** The Bismuth key on paper (K-05): shown to the owner, written to the audit log. */
  'backup.recoveryText': proc(empty, recoveryTextOutputSchema),
  /** A new computer learns the hotel's key (to read the Drive copies). */
  'backup.setRecoveryText': proc(
    // replace: the person agreed to change this computer's own key (a new computer that had made one already).
    z.object({ text: recoveryTextSchema, replace: z.boolean().optional() }).strict(),
    ok
  ),

  'dataExport.datasets': proc(empty, z.array(exportDatasetInfoSchema)),
  'dataExport.run': proc(exportRunInputSchema, exportFileSchema),
  'dataImport.preview': proc(importInputSchema, importPreviewSchema),
  'dataImport.run': proc(importInputSchema, importReportSchema),
  /** Earlier imports, newest first (P14fix #2). */
  'dataImport.batches': proc(empty, z.array(importBatchSchema)),
  /** Cancels one import: what it wrote is voided (reason, audit), its records may be imported again. */
  'dataImport.voidBatch': proc(importVoidInputSchema, importBatchSchema),
  /** The template as a file to fill in (P14fix #10). */
  'dataImport.sample': proc(importSampleInputSchema, exportFileSchema)
} as const satisfies Record<string, Procedure>
