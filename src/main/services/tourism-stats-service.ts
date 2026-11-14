// Ministry accommodation statistics from the KBS export (G-150, K-24, K-29, K-36; 03-mimari.md §6.11).
// The KBS file is read by header names (tourism/kbs-reader.ts: only the five statistics columns, never identity
// data); its rows are kept per import so the table can be recomputed after a nationality is confirmed, and
// compared with Bismuth's own stays (a stay missing in KBS is a legal risk, G-53).
import { and, desc, eq, gte, inArray, isNull, lt, lte, ne, notInArray } from 'drizzle-orm'
import {
  countryConfirmInputSchema,
  kbsFileRange,
  kbsImportInputSchema,
  statsPeriodSchema,
  tourismAssignRowInputSchema,
  tourismRenameInputSchema,
  tourismStayUntilInputSchema,
  type CountryConfirmInput,
  type KbsImportInput,
  type TourismAssignRowInput,
  type TourismComparisonView,
  type TourismCountryOption,
  type TourismExportView,
  type TourismImportView,
  type TourismRenameInput,
  type TourismStayUntilInput,
  type TourismTableView
} from '@shared/contract/tourism'
import { addDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import {
  countryMap,
  guests,
  kbsImports,
  kbsStayRows,
  reservationRooms,
  reservations,
  roomCapacityChanges,
  rooms,
  stayOccupants,
  users
} from '../db/schema'
import { TOURISM_TEMPLATE_CODE } from '@shared/domain/today'
import type { Ctx } from './context'
import { AppError } from './errors'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'
import {
  COUNTRY_CODES,
  mapNationality,
  ministryNameOf,
  normalizeCountryKey,
  type UserCountryMap
} from './tourism/country-map'
import { KbsFormatError, readKbsWorkbook, type KbsRow } from './tourism/kbs-reader'
import { ministryCsv, ministryXlsx } from './tourism/ministry-export'
import { syncLegalPeriodTask } from './tasks-service'
import {
  countStayNights,
  daysInPeriod,
  isBlankNationality,
  ministryNights,
  ministryTable,
  periodEnd,
  plannedDepartureKey,
  toClipboardText,
  type StoredKbsRow
} from './tourism/ministry-table'

export type KbsImportRow = typeof kbsImports.$inferSelect

/** country_map rows holding the user's own name for a country carry this prefix + ISO code (never a KBS key). */
const NAME_KEY_PREFIX = '#'
const nameKey = (iso2: string): string => `${NAME_KEY_PREFIX}${iso2}`

const periodParts = (period: string): { year: number; month: number } => ({
  year: Number(period.slice(0, 4)),
  month: Number(period.slice(5, 7))
})
const periodOf = (imp: Pick<KbsImportRow, 'periodYear' | 'periodMonth'>): string =>
  `${imp.periodYear}-${String(imp.periodMonth).padStart(2, '0')}`

/** The month most rows arrived in (a renamed file without a day range in its name). */
function dominantMonth(rows: readonly KbsRow[]): string | null {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.arrival.slice(0, 7), (counts.get(r.arrival.slice(0, 7)) ?? 0) + 1)
  let best: string | null = null
  for (const [m, n] of counts) if (best === null || n > (counts.get(best) ?? 0)) best = m
  return best
}

/**
 * The day an in-house guest without a planned departure is counted to: the import day, but never past the day
 * after the file's last day (its name's range, else the month): the file shows who was in on its last day, so
 * importing it a few days late does not add nights (Eylül: 5 guests to 1 October → 840, S-81).
 */
export function countedToOf(
  imp: Pick<KbsImportRow, 'importedAt' | 'rangeTo' | 'periodYear' | 'periodMonth'>
): LocalDate {
  const importDay = localDateOf(new Date(imp.importedAt))
  const fileEnd = imp.rangeTo ? addDays(localDate(imp.rangeTo), 1) : periodEnd(periodOf(imp))
  return importDay < fileEnd ? importDay : fileEnd
}

const toBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')

export function createTourismStatsService(deps: ServiceDeps) {
  const { db } = deps

  /** Confirmed spellings (K-36) and the user's own country names (by ISO code). */
  const userMaps = (): { map: UserCountryMap; names: Record<string, string> } => {
    const map: Record<string, { iso2: string | null; ministryNameTr: string }> = {}
    const names: Record<string, string> = {}
    for (const r of db.select().from(countryMap).where(eq(countryMap.source, 'user')).all()) {
      if (r.keyNormalized.startsWith(NAME_KEY_PREFIX)) {
        if (r.iso2 && r.ministryNameTr) names[r.iso2] = r.ministryNameTr
      } else map[r.keyNormalized] = { iso2: r.iso2, ministryNameTr: r.ministryNameTr ?? r.rawExample }
    }
    return { map, names }
  }

  const nameOf = (iso2: string, names: Record<string, string>): string => names[iso2] ?? ministryNameOf(iso2)

  /** Planned departures of Bismuth's stays by room number + arrival day (in-house guests, §6.11). */
  const plannedDepartures = (period: string): Record<string, LocalDate> => {
    const out: Record<string, LocalDate> = {}
    for (const s of db
      .select({
        number: rooms.number,
        checkIn: reservationRooms.checkIn,
        checkOut: reservationRooms.checkOut
      })
      .from(reservationRooms)
      .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
      .where(
        and(
          ne(reservationRooms.status, 'cancelled'),
          gte(reservationRooms.checkIn, `${period}-01`),
          lt(reservationRooms.checkIn, periodEnd(period))
        )
      )
      .all()) {
      // A same-day (hourly) sale and a night of the same room and arrival day share the key: the later departure
      // (the overnight stay) wins, so it never takes the hourly sale's departure.
      const key = plannedDepartureKey(s.number, s.checkIn as LocalDate)
      const known = out[key]
      if (!known || s.checkOut > known) out[key] = s.checkOut as LocalDate
    }
    return out
  }

  /** Real beds of active rooms on a day (capacity history, K-27; S-99: never the ministry's registered count). */
  const bedsOn = (date: LocalDate): number => {
    let beds = 0
    for (const room of db.select({ id: rooms.id }).from(rooms).all()) {
      const change = db
        .select({ active: roomCapacityChanges.active, beds: roomCapacityChanges.beds })
        .from(roomCapacityChanges)
        .where(
          and(
            eq(roomCapacityChanges.roomId, room.id),
            lte(roomCapacityChanges.validFrom, date),
            isNull(roomCapacityChanges.cancelledAt)
          )
        )
        .orderBy(desc(roomCapacityChanges.validFrom), desc(roomCapacityChanges.createdAt))
        .get()
      if (change?.active) beds += change.beds
    }
    return beds
  }

  /** Beds on the 1st and Σ beds over the month's days (differs only when the capacity changed in the month). */
  const capacityOf = (period: string): { beds: number; bedDays: number } => {
    const first = localDate(`${period}-01`)
    const changed = db
      .select({ id: roomCapacityChanges.id })
      .from(roomCapacityChanges)
      .where(
        and(
          gte(roomCapacityChanges.validFrom, addDays(first, 1)),
          lt(roomCapacityChanges.validFrom, periodEnd(period)),
          isNull(roomCapacityChanges.cancelledAt)
        )
      )
      .get()
    const beds = bedsOn(first)
    const days = daysInPeriod(period)
    if (!changed) return { beds, bedDays: beds * days }
    let bedDays = 0
    for (let i = 0; i < days; i++) bedDays += bedsOn(addDays(first, i))
    return { beds, bedDays }
  }

  const importOf = (id: string): KbsImportRow => {
    const row = db.select().from(kbsImports).where(eq(kbsImports.id, id)).get()
    if (!row) throw notFound('kbs_import', id)
    return row
  }

  const viewOf = (imp: KbsImportRow): TourismImportView => {
    const by = imp.reportedBy
      ? (db.select({ name: users.displayName }).from(users).where(eq(users.id, imp.reportedBy)).get()?.name ??
        null)
      : null
    return {
      id: imp.id,
      period: periodOf(imp),
      fileName: imp.fileName,
      importedAt: imp.importedAt,
      rowCount: imp.rowCount,
      sameDayCount: imp.sameDayCount,
      activeCount: imp.activeCount,
      rangeFrom: imp.rangeFrom as LocalDate | null,
      rangeTo: imp.rangeTo as LocalDate | null,
      reportedAt: imp.reportedAt,
      reportedByName: by
    }
  }

  const rowsOf = (importId: string): StoredKbsRow[] =>
    db
      .select()
      .from(kbsStayRows)
      .where(eq(kbsStayRows.importId, importId))
      .all()
      .map((r) => ({
        id: r.id,
        arrival: r.arrivalAt as LocalDate,
        departure: (r.departureAt as LocalDate | null) ?? null,
        room: r.roomNo,
        nationalityRaw: r.nationalityRaw,
        status: r.statusRaw ?? '',
        manualUntil: r.nightsBasis === 'manual' ? ((r.countedUntil as LocalDate | null) ?? null) : null,
        assignedIso2: r.assignedIso2 ?? null
      }))

  const tableOf = (imp: KbsImportRow): TourismTableView => {
    const period = periodOf(imp)
    const { map, names } = userMaps()
    const { beds, bedDays } = capacityOf(period)
    const countedTo = countedToOf(imp)
    const result = ministryTable(rowsOf(imp.id), period, {
      beds,
      bedDays,
      asOf: countedTo,
      plannedDepartures: plannedDepartures(period),
      userMap: map,
      countryNames: names
    })
    return {
      import: viewOf(imp),
      period,
      daysInMonth: result.daysInMonth,
      beds: beds > 0 ? beds : null,
      table: result.table,
      totals: result.totals,
      occupancyBasisPoints: result.occupancyBasisPoints,
      countedTo,
      inHouse: result.inHouse,
      review: result.review.map((r) => ({
        key: r.key,
        raw: r.raw,
        reason: r.reason,
        suggestions: r.suggestions.map((iso2) => ({ iso2, name: nameOf(iso2, names) })),
        rows: r.rows
      })),
      blankNationality: result.blankNationality.map((r) => ({
        rowId: r.rowId,
        room: r.room,
        arrival: r.arrival,
        departure: r.departure,
        raw: r.raw,
        country: r.assignedIso2 ? { iso2: r.assignedIso2, name: nameOf(r.assignedIso2, names) } : null
      })),
      invalidDates: result.invalidDates,
      issues: {
        invalidDates: result.issues.invalidDates,
        sameDay: result.issues.sameDay,
        active: result.issues.active,
        missingDeparture: result.issues.missingDeparture,
        outsidePeriod: result.issues.outsidePeriod
      },
      clipboard: toClipboardText(result)
    }
  }

  return {
    /**
     * Reads a KBS month export and keeps its statistics rows (no identity data). A file that is not a KBS
     * export is refused with the missing column named.
     */
    async importKbs(ctx: Ctx, input: KbsImportInput): Promise<TourismTableView> {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const data = parseInput(kbsImportInputSchema, input)
      let rows: KbsRow[]
      try {
        rows = await readKbsWorkbook(
          Buffer.from(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength)
        )
      } catch (error) {
        if (error instanceof KbsFormatError)
          throw new AppError('VALIDATION', 'errors.kbsFormat', { code: error.code, column: error.column })
        throw new AppError('VALIDATION', 'errors.kbsFormat', { code: 'KBS_UNREADABLE', column: null })
      }
      const range = kbsFileRange(data.fileName)
      const period = data.period ?? range?.from.slice(0, 7) ?? dominantMonth(rows)
      if (rows.length === 0 || !period) throw invalid('errors.kbsEmpty')
      const { year, month } = periodParts(period)
      const now = deps.clock()
      const plans = plannedDepartures(period)
      const { map } = userMaps()
      const imp = inTransaction(deps, ctx, (tx, audit) => {
        const id = newId(now)
        // A file of a month already marked "bildirildi" (taken again, e.g. corrected) keeps the mark: the screen
        // and the month-end check read the newest import, and the month stays reported until someone undoes it.
        const previous = tx
          .select({ reportedAt: kbsImports.reportedAt, reportedBy: kbsImports.reportedBy })
          .from(kbsImports)
          .where(and(eq(kbsImports.periodYear, year), eq(kbsImports.periodMonth, month)))
          .orderBy(desc(kbsImports.importedAt), desc(kbsImports.id))
          .get()
        const row: KbsImportRow = {
          id,
          periodYear: year,
          periodMonth: month,
          fileName: data.fileName,
          importedAt: now.toISOString(),
          rowCount: rows.length,
          sameDayCount: rows.filter((r) => r.departure !== null && r.departure === r.arrival).length,
          activeCount: rows.filter((r) => normalizeCountryKey(r.status) === 'AKTIF').length,
          createdBy: ctx.userId,
          rangeFrom: range?.from ?? null,
          rangeTo: range?.to ?? null,
          reportedAt: previous?.reportedAt ?? null,
          reportedBy: previous?.reportedAt ? (previous.reportedBy ?? null) : null,
          ...stamps(now)
        }
        tx.insert(kbsImports).values(row).run()
        const asOf = countedToOf(row)
        const values = rows.map((r) => {
          const c = countStayNights(r, { asOf, plannedDepartures: plans })
          return {
            id: newId(now),
            importId: id,
            arrivalAt: r.arrival,
            departureAt: r.departure,
            roomNo: r.room,
            gender: null,
            nationalityRaw: r.nationalityRaw,
            nationalityIso: mapNationality(r.nationalityRaw, map).iso2,
            statusRaw: r.status,
            nightsComputed: c.nights,
            nightsBasis: c.basis,
            countedUntil: c.countedUntil,
            inPeriod: r.arrival.slice(0, 7) === period
          }
        })
        for (let i = 0; i < values.length; i += 200)
          tx.insert(kbsStayRows)
            .values(values.slice(i, i + 200))
            .run()
        audit({
          entity: 'kbs_import',
          entityId: id,
          action: 'import',
          after: { ...row, rows: values.length }
        })
        return row
      })
      return tableOf(imp)
    },

    /** Imports, newest first (one month, or all of them: the history of what was reported). */
    listImports(ctx: Ctx, period?: string): TourismImportView[] {
      requirePermission(ctx, 'tourism_stats', 'view')
      const p = period ? periodParts(parseInput(statsPeriodSchema, period)) : null
      return db
        .select()
        .from(kbsImports)
        .where(p ? and(eq(kbsImports.periodYear, p.year), eq(kbsImports.periodMonth, p.month)) : undefined)
        .orderBy(desc(kbsImports.importedAt), desc(kbsImports.id))
        .all()
        .map(viewOf)
    },

    /** The ministry table of an import, recomputed with today's confirmations, names and corrections. */
    table(ctx: Ctx, importId: string): TourismTableView {
      requirePermission(ctx, 'tourism_stats', 'view')
      return tableOf(importOf(importId))
    },

    /** Every country the panel knows, with the Turkish name Bismuth types (for an ambiguous or unknown spelling). */
    countries(ctx: Ctx): TourismCountryOption[] {
      requirePermission(ctx, 'tourism_stats', 'view')
      const { names } = userMaps()
      const collator = new Intl.Collator('tr')
      return COUNTRY_CODES.map((iso2) => ({ iso2, name: nameOf(iso2, names) })).sort((a, b) =>
        collator.compare(a.name, b.name)
      )
    },

    /** K-36: the user confirms what a KBS spelling means; it is remembered for every later file. */
    confirmCountry(ctx: Ctx, input: CountryConfirmInput): void {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const data = parseInput(countryConfirmInputSchema, input)
      const key = normalizeCountryKey(data.rawValue)
      if (!key) throw invalid('errors.validation')
      inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(countryMap).where(eq(countryMap.keyNormalized, key)).get() ?? null
        const iso = now.toISOString()
        const values = {
          rawExample: data.rawValue,
          iso2: data.iso2,
          ministryNameTr: data.ministryNameTr,
          source: 'user' as const,
          confirmedBy: ctx.userId,
          confirmedAt: iso,
          updatedAt: iso
        }
        tx.insert(countryMap)
          .values({ keyNormalized: key, ...values, createdAt: iso })
          .onConflictDoUpdate({ target: countryMap.keyNormalized, set: values })
          .run()
        audit({
          entity: 'country_map',
          entityId: key,
          action: before ? 'update' : 'create',
          before,
          after: values
        })
      })
    },

    /**
     * The user's own name for a country in the ministry table (the panel has a type-ahead box, no list): kept for
     * every later month. `name: null` puts Bismuth's name back.
     */
    renameCountry(ctx: Ctx, input: TourismRenameInput): void {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const data = parseInput(tourismRenameInputSchema, input)
      const key = nameKey(data.iso2)
      inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(countryMap).where(eq(countryMap.keyNormalized, key)).get() ?? null
        const iso = now.toISOString()
        const name = data.name ?? ministryNameOf(data.iso2)
        const values = {
          rawExample: name,
          iso2: data.iso2,
          ministryNameTr: name,
          source: 'user' as const,
          confirmedBy: ctx.userId,
          confirmedAt: iso,
          updatedAt: iso
        }
        tx.insert(countryMap)
          .values({ keyNormalized: key, ...values, createdAt: iso })
          .onConflictDoUpdate({ target: countryMap.keyNormalized, set: values })
          .run()
        audit({
          entity: 'country_map',
          entityId: key,
          action: before ? 'update' : 'create',
          before,
          after: values
        })
      })
    },

    /** Corrects the day an in-house guest is counted to (K-36: "işaretli, düzeltilebilir"); null = automatic. */
    setStayUntil(ctx: Ctx, input: TourismStayUntilInput): TourismTableView {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const data = parseInput(tourismStayUntilInputSchema, input)
      const imp = importOf(data.importId)
      const row = db
        .select()
        .from(kbsStayRows)
        .where(and(eq(kbsStayRows.id, data.rowId), eq(kbsStayRows.importId, imp.id)))
        .get()
      if (!row) throw notFound('kbs_stay_row', data.rowId)
      if (row.departureAt) throw invalid('errors.kbsHasDeparture')
      const arrival = row.arrivalAt as LocalDate
      if (data.until !== null && data.until < arrival) throw invalid('errors.kbsUntilBeforeArrival')
      const period = periodOf(imp)
      const auto = countStayNights(
        {
          arrival,
          departure: null,
          room: row.roomNo,
          nationalityRaw: row.nationalityRaw,
          status: row.statusRaw ?? ''
        },
        { asOf: countedToOf(imp), plannedDepartures: plannedDepartures(period) }
      )
      const next =
        data.until === null
          ? { nightsComputed: auto.nights, nightsBasis: auto.basis, countedUntil: auto.countedUntil }
          : {
              nightsComputed: ministryNights(arrival, localDate(data.until)),
              nightsBasis: 'manual' as const,
              countedUntil: data.until
            }
      inTransaction(deps, ctx, (tx, audit) => {
        tx.update(kbsStayRows).set(next).where(eq(kbsStayRows.id, row.id)).run()
        audit({
          entity: 'kbs_import',
          entityId: imp.id,
          action: 'update',
          before: {
            rowId: row.id,
            nightsBasis: row.nightsBasis,
            countedUntil: row.countedUntil,
            nights: row.nightsComputed
          },
          after: { rowId: row.id, ...next, nights: next.nightsComputed }
        })
      })
      return tableOf(importOf(imp.id))
    },

    /**
     * A row KBS wrote without a nationality ("" or "-") is assigned to a country for this row only (P10fix #4,
     * varsayılan): it is not a spelling, so nothing goes into country_map. `iso2: null` takes it back.
     */
    assignRow(ctx: Ctx, input: TourismAssignRowInput): TourismTableView {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const data = parseInput(tourismAssignRowInputSchema, input)
      const imp = importOf(data.importId)
      const row = db
        .select()
        .from(kbsStayRows)
        .where(and(eq(kbsStayRows.id, data.rowId), eq(kbsStayRows.importId, imp.id)))
        .get()
      if (!row) throw notFound('kbs_stay_row', data.rowId)
      if (!isBlankNationality(row.nationalityRaw)) throw invalid('errors.kbsRowHasNationality')
      if (data.iso2 !== null && !COUNTRY_CODES.includes(data.iso2))
        throw invalid('errors.validation', { fields: { iso2: ['unknown country'] } })
      if ((row.assignedIso2 ?? null) !== data.iso2)
        inTransaction(deps, ctx, (tx, audit) => {
          tx.update(kbsStayRows).set({ assignedIso2: data.iso2 }).where(eq(kbsStayRows.id, row.id)).run()
          audit({
            entity: 'kbs_import',
            entityId: imp.id,
            action: 'update',
            before: { rowId: row.id, assignedIso2: row.assignedIso2 ?? null },
            after: { rowId: row.id, assignedIso2: data.iso2 }
          })
        })
      return tableOf(importOf(imp.id))
    },

    /** "Bildirildi": the table was entered into the ministry panel (or the mark is taken back). */
    markReported(ctx: Ctx, importId: string, reported: boolean): TourismImportView {
      requirePermission(ctx, 'tourism_stats', 'edit')
      const imp = importOf(importId)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const set = reported
          ? { reportedAt: now.toISOString(), reportedBy: ctx.userId, updatedAt: now.toISOString() }
          : { reportedAt: null, reportedBy: null, updatedAt: now.toISOString() }
        tx.update(kbsImports).set(set).where(eq(kbsImports.id, imp.id)).run()
        audit({
          entity: 'kbs_import',
          entityId: imp.id,
          action: 'update',
          before: { reportedAt: imp.reportedAt, reportedBy: imp.reportedBy },
          after: { reportedAt: set.reportedAt, reportedBy: set.reportedBy }
        })
        // Tek giriş (G-60): the month's reminder task follows the mark; it reopens only when no import of the
        // period is still marked.
        const stillReported = tx
          .select({ id: kbsImports.id, reportedAt: kbsImports.reportedAt })
          .from(kbsImports)
          .where(and(eq(kbsImports.periodYear, imp.periodYear), eq(kbsImports.periodMonth, imp.periodMonth)))
          .all()
          .some((r) => r.reportedAt !== null)
        syncLegalPeriodTask(tx, audit, ctx, TOURISM_TEMPLATE_CODE, periodOf(imp), stillReported, now)
        return viewOf({ ...imp, ...set })
      })
    },

    /** The ministry table as CSV or XLSX (base64, for the screen to save). */
    async exportTable(ctx: Ctx, importId: string, format: 'csv' | 'xlsx'): Promise<TourismExportView> {
      requirePermission(ctx, 'tourism_stats', 'view')
      const t = tableOf(importOf(importId))
      const base = `turizm-istatistigi-${t.period}`
      if (format === 'csv')
        return {
          fileName: `${base}.csv`,
          mime: 'text/csv;charset=utf-8',
          dataBase64: toBase64(new TextEncoder().encode(ministryCsv(t.table, t.totals)))
        }
      return {
        fileName: `${base}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dataBase64: toBase64(await ministryXlsx(t.table, t.totals, t.period))
      }
    },

    /**
     * The import against Bismuth's own stays of the same month: per country (guest nationality, every person in
     * the room), the people whose nationality is not written, and room + arrival day present on one side only.
     */
    compareWithProgram(ctx: Ctx, importId: string): TourismComparisonView {
      requirePermission(ctx, 'tourism_stats', 'view')
      const imp = importOf(importId)
      const period = periodOf(imp)
      const kbsTable = tableOf(imp)
      const { names } = userMaps()

      // Stays of Bismuth that began in the month and were really checked in (a past stay never checked in is
      // not a KBS arrival, P10fix #11). A room move inside a stay is one stay: the parts of a reservation that
      // follow each other (checkout of one = check-in of the next) are joined (P10fix #5).
      const startedIn = db
        .selectDistinct({ id: reservationRooms.reservationId })
        .from(reservationRooms)
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .where(
          and(
            ne(reservationRooms.status, 'cancelled'),
            notInArray(reservations.status, ['cancelled', 'no_show', 'parked']),
            gte(reservationRooms.checkIn, `${period}-01`),
            lt(reservationRooms.checkIn, periodEnd(period))
          )
        )
        .all()
        .map((r) => r.id)
      const segments: {
        id: string
        reservationId: string
        status: string
        number: string
        checkIn: string
        checkOut: string
        code: string
        adults: number | null
        children: number | null
        primaryFirst: string
        primaryLast: string | null
        primaryNationality: string | null
      }[] = []
      for (let i = 0; i < startedIn.length; i += 500)
        segments.push(
          ...db
            .select({
              id: reservationRooms.id,
              reservationId: reservationRooms.reservationId,
              status: reservationRooms.status,
              number: rooms.number,
              checkIn: reservationRooms.checkIn,
              checkOut: reservationRooms.checkOut,
              code: reservations.code,
              adults: reservations.adults,
              children: reservations.children,
              primaryFirst: guests.firstName,
              primaryLast: guests.lastName,
              primaryNationality: guests.nationality
            })
            .from(reservationRooms)
            .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
            .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
            .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
            .where(
              and(
                ne(reservationRooms.status, 'cancelled'),
                inArray(reservationRooms.reservationId, startedIn.slice(i, i + 500))
              )
            )
            .all()
        )
      segments.sort((a, b) =>
        a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.number.localeCompare(b.number, 'tr')
      )
      type Segment = (typeof segments)[number]
      const chains: Segment[][] = []
      for (const seg of segments) {
        const open = chains.find(
          (c) => c[0]!.reservationId === seg.reservationId && c[c.length - 1]!.checkOut === seg.checkIn
        )
        if (open) open.push(seg)
        else chains.push([seg])
      }
      const stays = chains.filter(
        (c) =>
          c[0]!.checkIn.slice(0, 7) === period &&
          c.some((x) => x.status === 'in_house' || x.status === 'done')
      )

      const occupants = new Map<
        string,
        { name: string; nationality: string | null; arrivedAt: string | null; leftAt: string | null }[]
      >()
      const ids = stays.flatMap((c) => c.map((x) => x.id))
      for (let i = 0; i < ids.length; i += 500) {
        for (const o of db
          .select({
            stay: stayOccupants.reservationRoomId,
            fullName: stayOccupants.fullName,
            nationality: guests.nationality,
            arrivedAt: stayOccupants.arrivedAt,
            leftAt: stayOccupants.leftAt
          })
          .from(stayOccupants)
          .leftJoin(guests, eq(guests.id, stayOccupants.guestId))
          .where(inArray(stayOccupants.reservationRoomId, ids.slice(i, i + 500)))
          .all()) {
          const list = occupants.get(o.stay) ?? []
          list.push({
            name: o.fullName,
            nationality: o.nationality,
            arrivedAt: o.arrivedAt,
            leftAt: o.leftAt
          })
          occupants.set(o.stay, list)
        }
      }

      const program = new Map<string, { arrivals: number; nights: number }>()
      const missing: TourismComparisonView['missingNationality'] = []
      const programTotals = { arrivals: 0, nights: 0 }
      let headCountStays = 0
      /** room|arrival day → the reservation code, for "Bismuth'ta var, KBS'de yok". */
      const programKeys = new Map<string, { room: string; arrival: LocalDate; reservationCode: string }>()
      const dayOf = (iso: string | null): LocalDate | null => (iso ? localDateOf(new Date(iso)) : null)
      for (const chain of stays) {
        const first = chain[0]!
        const start = first.checkIn as LocalDate
        const end = chain[chain.length - 1]!.checkOut as LocalDate
        const roomOn = (d: LocalDate): string =>
          chain.find((x) => x.checkIn <= d && d < x.checkOut)?.number ?? first.number
        const primaryName = [first.primaryFirst, first.primaryLast].filter(Boolean).join(' ')
        const listed = chain.flatMap((x) => occupants.get(x.id) ?? [])
        // Without any occupant record (S-22) the reservation's head count stands for the room, under its guest:
        // its adults only — a child is not an arrival of its own (K-29, a KBS row per arrival). The screen says
        // how many stays were counted this way.
        if (!listed.length) headCountStays++
        const people = listed.length
          ? listed
          : Array.from({ length: Math.max(1, first.adults ?? 1) }, () => ({
              name: primaryName,
              nationality: first.primaryNationality,
              arrivedAt: null,
              leftAt: null
            }))
        for (const p of people) {
          // Each person from their own arrival to their own leaving day, within the stay (a guest who joined on
          // the third day is counted from that day, like their KBS row).
          const came = dayOf(p.arrivedAt)
          const left = dayOf(p.leftAt)
          const arrival = came && came > start && came < end ? came : start
          const until = left && left < end ? (left > arrival ? left : arrival) : end
          if (arrival.slice(0, 7) !== period) continue
          const nights = ministryNights(arrival, until)
          const room = roomOn(arrival)
          const key = plannedDepartureKey(room, arrival)
          if (!programKeys.has(key)) programKeys.set(key, { room, arrival, reservationCode: first.code })
          programTotals.arrivals++
          programTotals.nights += nights
          const iso = p.nationality?.trim().toUpperCase() || null
          if (!iso) {
            missing.push({ reservationCode: first.code, room, arrival, name: p.name })
            continue
          }
          const line = program.get(iso) ?? { arrivals: 0, nights: 0 }
          line.arrivals++
          line.nights += nights
          program.set(iso, line)
        }
      }

      const differences: TourismComparisonView['differences'] = []
      const seen = new Set<string>()
      for (const k of kbsTable.table) {
        const p = k.iso2 ? program.get(k.iso2) : undefined
        if (k.iso2) seen.add(k.iso2)
        const pa = p?.arrivals ?? 0
        const pn = p?.nights ?? 0
        if (pa !== k.arrivals || pn !== k.nights)
          differences.push({
            country: k.country,
            iso2: k.iso2,
            kbsArrivals: k.arrivals,
            kbsNights: k.nights,
            programArrivals: pa,
            programNights: pn
          })
      }
      for (const [iso2, p] of program) {
        if (seen.has(iso2)) continue
        differences.push({
          country: nameOf(iso2, names),
          iso2,
          kbsArrivals: 0,
          kbsNights: 0,
          programArrivals: p.arrivals,
          programNights: p.nights
        })
      }

      // Room + arrival day on one side only.
      const kbs = new Map<string, { room: string; arrival: LocalDate; people: number }>()
      for (const r of rowsOf(imp.id)) {
        if (r.arrival.slice(0, 7) !== period) continue
        const key = plannedDepartureKey(r.room, r.arrival)
        const e = kbs.get(key)
        if (e) e.people++
        else kbs.set(key, { room: r.room.trim(), arrival: r.arrival, people: 1 })
      }
      const onlyInProgram: TourismComparisonView['onlyInProgram'] = []
      let matched = 0
      for (const [key, p] of programKeys) {
        if (kbs.delete(key)) matched++
        else onlyInProgram.push(p)
      }
      return {
        period,
        differences,
        programTotals,
        missingNationality: missing,
        onlyInKbs: [...kbs.values()].sort((a, b) =>
          a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : a.room.localeCompare(b.room, 'tr')
        ),
        onlyInProgram,
        matched,
        headCountStays
      }
    }
  }
}

export type TourismStatsService = ReturnType<typeof createTourismStatsService>
