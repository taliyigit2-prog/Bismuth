// Export (faz-14 madde 3; G-122, S-43): every table a person works with as CSV or XLSX — one table, or all the
// tables the role may see as the sheets of one workbook. Needs `reports.export` and each table's own view right;
// identity numbers and descriptive notes only with `guests.identity` (KVKK). Every export is written to the audit
// log (who took which table out, when). The file goes back to the window as bytes: the program's window saves it
// with the usual "Save as" dialog, a browser downloads it.
import { count, eq, isNull, type SQL } from 'drizzle-orm'
import {
  exportRunInputSchema,
  type ExportDataset,
  type ExportFile,
  type ExportRunInput
} from '@shared/contract/backup'
import { localDateOf } from '@shared/date'
import type { Ctx } from './context'
import { DATASETS, datasetOf, type DatasetDef } from './data-transfer/export-catalog'
import { translator } from './data-transfer/labels'
import { toCsv, toXlsx, type Table } from './data-transfer/writers'
import { permissionDenied } from './errors'
import { inTransaction, parseInput, requirePermission, type ServiceDeps } from './kit'
import { readSetting } from './settings-service'
import {
  blacklist,
  businessDays,
  calendarDays,
  cashHandovers,
  charges,
  companies,
  contacts,
  employees,
  employeeSalaries,
  employmentPeriods,
  expenseItems,
  expenses,
  fxRates,
  guests,
  importBatches,
  laundryDeliveryItems,
  laundryPrices,
  laundrySettlements,
  leaveRecords,
  lostItems,
  notes,
  payments,
  productCategories,
  products,
  reservationNotes,
  reservations,
  roomBlocks,
  roomCapacityChanges,
  roomIssues,
  roomNights,
  rooms,
  roomTypes,
  shiftHandovers,
  staffTransactions,
  stayOccupants,
  tasks,
  workRecords
} from '../db/schema'

/** Main table of each dataset: the row count shown next to its name. */
const COUNT_TABLE = {
  reservationNights: roomNights,
  reservations,
  occupants: stayOccupants,
  ledgerIncome: payments,
  ledgerExpenses: expenses,
  expenseItems,
  staff: employees,
  salaries: employeeSalaries,
  staffTransactions,
  leave: leaveRecords,
  workHours: workRecords,
  guests,
  companies,
  blacklist,
  contacts,
  products,
  laundry: laundryDeliveryItems,
  tasks,
  issues: roomIssues,
  lostItems,
  folioCharges: charges,
  reservationNotes,
  roomTypes,
  rooms,
  roomCapacity: roomCapacityChanges,
  roomBlocks,
  cashHandovers,
  ledgerDays: businessDays,
  employmentPeriods,
  shiftHandovers,
  boardNotes: notes,
  calendarDays,
  fxRates,
  laundryPrices,
  laundrySettlements,
  productCategories,
  importBatches
} as const satisfies Record<ExportDataset, unknown>

/**
 * Rows a dataset leaves out of its main table (P14fix #15: merged guest cards are not exported; personal notes
 * never are, §4.9-12).
 */
const COUNT_WHERE: Partial<Record<ExportDataset, SQL>> = {
  guests: isNull(guests.mergedIntoId),
  boardNotes: eq(notes.kind, 'board')
}

const MIME = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
} as const

export interface DataExportDeps extends ServiceDeps {
  /**
   * The program's own window: the "Save as" dialog writes the file (main process, Electron); returns the path, or null
   * when the dialog was closed. Absent (server harness, tests): the file goes back to the window as bytes.
   */
  saveFile?: (fileName: string, bytes: Buffer) => Promise<string | null>
}

export function createDataExportService(deps: DataExportDeps) {
  const { db } = deps

  const allowed = (ctx: Ctx, d: DatasetDef): boolean => d.permissions.every((p) => ctx.can(p, 'view'))
  const seesIdentity = (ctx: Ctx): boolean => ctx.can('guests.identity', 'view')

  function table(ctx: Ctx, d: DatasetDef, input: ReturnType<typeof parseRun>): Table {
    const t = translator(input.locale)
    const rows = d.load(db, ctx, {
      locale: input.locale,
      t,
      from: input.from,
      to: input.to,
      baseCurrency: readSetting(db, 'hotel.baseCurrency'),
      timeZone: readSetting(db, 'hotel.timezone'),
      clock: deps.clock
    })
    const identity = seesIdentity(ctx)
    return {
      title: t(`dataTransfer.dataset.${d.id}`),
      columns: d.columns.filter((c) => identity || !c.sensitive),
      rows
    }
  }

  const parseRun = (input: ExportRunInput) => parseInput(exportRunInputSchema, input)

  return {
    /** The tables this role may export, with their row counts. */
    datasets(ctx: Ctx): { id: ExportDataset; rows: number; sensitiveHidden: boolean }[] {
      requirePermission(ctx, 'reports.export', 'view')
      const identity = seesIdentity(ctx)
      const opts = {
        locale: 'tr' as const,
        t: translator('tr'),
        baseCurrency: readSetting(db, 'hotel.baseCurrency'),
        timeZone: readSetting(db, 'hotel.timezone'),
        clock: deps.clock
      }
      return DATASETS.filter((d) => allowed(ctx, d)).map((d) => ({
        id: d.id,
        rows: d.scoped
          ? d.load(db, ctx, opts).length
          : (db.select({ n: count() }).from(COUNT_TABLE[d.id]).where(COUNT_WHERE[d.id]).get()?.n ?? 0),
        sensitiveHidden: !identity && d.columns.some((c) => c.sensitive)
      }))
    },

    async run(ctx: Ctx, input: ExportRunInput): Promise<ExportFile> {
      requirePermission(ctx, 'reports.export', 'view')
      const data = parseRun(input)
      const chosen =
        data.dataset === 'all'
          ? DATASETS.filter((d) => allowed(ctx, d))
          : [datasetOf(data.dataset)].filter((d) => allowed(ctx, d))
      if (!chosen.length) throw permissionDenied()
      const tables = chosen.map((d) => table(ctx, d, data))
      const t = translator(data.locale)
      const opts = { locale: data.locale, t, timeZone: readSetting(db, 'hotel.timezone') }
      const bytes =
        data.format === 'csv' ? Buffer.from(toCsv(tables[0]!, opts), 'utf8') : await toXlsx(tables, opts)
      const day = localDateOf(deps.clock())
      const title = data.dataset === 'all' ? t('dataTransfer.export.allFileName') : tables[0]!.title
      const fileName = `${title} ${day}.${data.format}`.replace(/[\\/:*?"<>|]/g, '-')
      const rows = tables.reduce((n, tb) => n + tb.rows.length, 0)
      const local = ctx.transport === 'ipc' && deps.saveFile ? deps.saveFile : null
      const savedPath = local ? await local(fileName, bytes) : null
      const base = { fileName, mime: MIME[data.format], rows }
      if (local && savedPath === null) return { ...base, base64: '', delivery: 'canceled', savedPath: null }
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({
          entity: data.dataset === 'all' ? 'backup' : datasetOf(data.dataset).entity,
          entityId: `export:${data.dataset}`,
          action: 'export',
          after: {
            datasets: chosen.map((d) => d.id),
            format: data.format,
            rows,
            from: data.from ?? null,
            to: data.to ?? null,
            identity: seesIdentity(ctx)
          }
        })
      })
      return local
        ? { ...base, base64: '', delivery: 'saved', savedPath }
        : { ...base, base64: bytes.toString('base64'), delivery: 'download', savedPath: null }
    }
  }
}

export type DataExportService = ReturnType<typeof createDataExportService>
