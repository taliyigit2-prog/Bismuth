import { join } from 'node:path'
import type { DatabaseHandle } from '../db/client'
import { createAppInfoService, type RuntimeInfo } from './app-info-service'
import { createAttachmentsService, type ProcessImage } from './attachments-service'
import { createAuditService } from './audit-service'
import { createAuthService } from './auth-service'
import { createBackupService, type BackupDeps } from './backup-service'
import { createDataExportService } from './data-export-service'
import { createDataImportService } from './data-import-service'
import { createDiagnosticsService, type DiagnosticsDeps } from './diagnostics-service'
import { createCalendarService } from './calendar-service'
import { createContactsService } from './contacts-service'
import { createCurrencyService } from './currency-service'
import { createExpensesService } from './expenses-service'
import { createExternalService } from './external-service'
import { createHttpClient, type FetchLike } from '../network/http'
import { createStateStore, keySealer, systemSealer } from '../network/state'
import type { SecretStorage } from '../security/bismuth-key'
import { setHotelTimeZone } from '@shared/date'
import { readSetting } from './settings-service'
import { createBlacklistService, createCompaniesService, createGuestsService } from './guests-service'
import { createHousekeepingService } from './housekeeping-service'
import type { ServiceDeps } from './kit'
import { createLaundryService } from './laundry-service'
import { createLedgerService } from './ledger-service'
import { createLostItemsService } from './lost-items-service'
import { createOccupantsService } from './occupants-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomIssuesService } from './room-issues-service'
import { createRoomsService } from './rooms-service'
import { createSettingsService } from './settings-service'
import { createShiftService } from './shift-service'
import { createStaffService } from './staff-service'
import { createStatusTagsService } from './status-tags-service'
import { createSupplyService } from './supply-service'
import { createTasksService } from './tasks-service'
import { createTourismStatsService } from './tourism-stats-service'
import { createReportsService } from './reports/reports-service'
import { createUsersService } from './users-service'
import { createListsService } from './lists-service'
import { createSetupService } from './setup-service'

export type Services = ReturnType<typeof createServices>

/** Where files go; defaults to the folders under `runtime.dataDir` (userData). */
export interface ServiceStorage {
  attachmentsDir?: string
  backupsDir?: string
  restoreMarkerPath?: string
  processImage?: ProcessImage
  /** Backups (Faz 14): the Bismuth key, Drive folder, busy signal, folder opening, restart (main process). */
  backup?: Partial<
    Pick<
      BackupDeps,
      | 'dbFile'
      | 'appVersion'
      | 'schemaVersion'
      | 'keys'
      | 'driveDir'
      | 'isBusy'
      | 'stepping'
      | 'openPath'
      | 'relaunch'
      | 'pickFolder'
    >
  >
  /** Export (Faz 14): the program window's "Save as" dialog (main process). */
  saveExport?: (fileName: string, bytes: Buffer) => Promise<string | null>
  /** Errors of follow-up work that runs after a committed write (e.g. the every-N-stays task at check-out). */
  onBackgroundError?: (error: unknown, what: string) => void
  /** Errors a window reported (Faz 16): the main process writes them to the error log. */
  onClientError?: DiagnosticsDeps['onClientError']
  clock?: () => Date
  /** Nothing is written once another computer took over (main process: the epoch guard; O-4). */
  writeGate?: () => 'replaced' | null
  /**
   * Optional online data (Faz 11): the fetch to use (tests: a fake server) and, outside a packaged build only, a
   * local origin every request is sent to instead (e2e). The cache file lives in the data folder.
   */
  network?: {
    fetch?: FetchLike
    origin?: string | null
    /** The operating system's key store (Electron `safeStorage`): seals the rate providers' API keys (N-10). */
    secrets?: SecretStorage | null
  }
}

/** Wire every service to one database handle. No Electron imports below this line (03-mimari.md §1.3). */
export function createServices(handle: DatabaseHandle, runtime: RuntimeInfo, storage: ServiceStorage = {}) {
  const clock = storage.clock ?? (() => new Date())
  // The app's single "today" is the hotel's day (src/shared/date.ts).
  setHotelTimeZone(readSetting(handle.db, 'hotel.timezone'))
  const deps: ServiceDeps = {
    db: handle.db,
    clock,
    ...(storage.writeGate ? { writeGate: storage.writeGate } : {})
  }
  const tasks = createTasksService(deps)
  const onBackgroundError = storage.onBackgroundError ?? (() => undefined)
  const payments = createPaymentsService(deps)
  const reservations = createReservationsService({
    ...deps,
    hooks: {
      // The check-out is committed already; a failing follow-up must not report the check-out as failed.
      onCheckout: (ctx, roomId, date) => {
        try {
          tasks.onCheckout(ctx, roomId, date)
        } catch (error) {
          onBackgroundError(error, 'tasks.onCheckout')
        }
      },
      recordRefund: (ctx, tx, audit, now, input) => {
        payments.createIn(ctx, tx, audit, now, input)
      }
    }
  })
  const settings = createSettingsService(handle.db, clock, storage.writeGate)
  const rooms = createRoomsService(deps)
  const lists = createListsService(deps)
  const users = createUsersService(deps)
  const auth = createAuthService(deps)
  const staff = createStaffService(deps)
  const shifts = createShiftService(deps)
  const calendar = createCalendarService(deps)
  const currency = createCurrencyService(deps)
  const external = createExternalService({
    ...deps,
    http: createHttpClient({
      enabled: () => readSetting(handle.db, 'network.enabled'),
      fetch: storage.network?.fetch,
      origin: runtime.packaged ? null : (storage.network?.origin ?? null)
    }),
    state: createStateStore(
      runtime.dataDir ? join(runtime.dataDir, 'external-data.json') : null,
      systemSealer(storage.network?.secrets ?? null),
      // The earlier version sealed them with the Bismuth key: read once, sealed again (never makes that key).
      storage.backup?.keys ? keySealer(storage.backup.keys) : null
    ),
    currency,
    calendar,
    settings,
    appVersion: runtime.version
  })
  const expenses = createExpensesService(deps)
  const setup = createSetupService(deps, {
    settings,
    rooms,
    lists,
    users,
    auth,
    staff,
    shifts,
    tasks,
    calendar
  })
  return {
    appInfo: createAppInfoService(handle, runtime),
    diagnostics: createDiagnosticsService({ clock, onClientError: storage.onClientError }),
    settings,
    setup,
    rooms,
    lists,
    currency,
    external,
    reservations,
    payments,
    occupants: createOccupantsService(deps),
    guests: createGuestsService(deps),
    companies: createCompaniesService(deps),
    blacklist: createBlacklistService(deps),
    calendar,
    tasks,
    shifts,
    ledger: createLedgerService(deps),
    expenses,
    staff,
    lostItems: createLostItemsService(deps),
    statusTags: createStatusTagsService(deps),
    contacts: createContactsService(deps),
    supply: createSupplyService(deps),
    laundry: createLaundryService(deps),
    housekeeping: createHousekeepingService(deps),
    roomIssues: createRoomIssuesService(deps),
    attachments: createAttachmentsService({
      ...deps,
      attachmentsDir: storage.attachmentsDir ?? join(runtime.dataDir, 'attachments'),
      processImage: storage.processImage
    }),
    users,
    auth,
    audit: createAuditService(deps),
    backup: createBackupService({
      ...deps,
      sqlite: handle.sqlite,
      backupsDir: storage.backupsDir ?? join(runtime.dataDir, 'backups'),
      attachmentsDir: storage.attachmentsDir ?? join(runtime.dataDir, 'attachments'),
      restoreMarkerPath: storage.restoreMarkerPath ?? join(runtime.dataDir, 'restore-pending.json'),
      dataDir: runtime.dataDir,
      appVersion: runtime.version,
      ...storage.backup
    }),
    dataExport: createDataExportService({ ...deps, saveFile: storage.saveExport }),
    dataImport: createDataImportService({
      ...deps,
      reservations,
      payments,
      expenses,
      staff,
      saveFile: storage.saveExport
    }),
    tourism: createTourismStatsService(deps),
    reports: createReportsService({ ...deps, staff, saveFile: storage.saveExport })
  }
}

export type { Ctx } from './context'
export { localOwnerCtx, ctxFromPermissions, systemCtx } from './context'
export { AppError } from './errors'
export { applyPendingRestore } from './backup-service'
