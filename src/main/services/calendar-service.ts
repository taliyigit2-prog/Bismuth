// Calendar days: generated public holidays, special days and notes for any year (03-mimari.md §4.8, §6.7;
// G-16, G-40, K-04). Holidays come from the offline rule engine (calendar/holidays.ts) the first time a year is
// shown; a person's edit turns a generated row into `source = user`, which regeneration never touches.
// Nothing is deleted: cancelled days keep their row with `cancelled_at`.
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import {
  CALENDAR_BULK_MAX,
  calendarDayEditSchema,
  calendarNoteInputSchema,
  calendarRangeSchema,
  calendarYearSchema,
  type CalendarDayEdit,
  type CalendarNoteInput
} from '@shared/contract/operations'
import { addDays, diffDays, weekday, type LocalDate } from '@shared/date'
import { clampedDate } from '@shared/domain/local-datetime'
import {
  auditLog,
  calendarDays,
  calendarGeneration,
  guests,
  reservationRooms,
  reservations,
  rooms
} from '../db/schema'
import {
  RECENT_ENDED_MAX,
  recentEndedSchema,
  type GridData,
  type RecentEnded
} from '@shared/contract/procedures/reservations'
import { createCalendarGrid } from './calendar/grid'
import { generateTurkishHolidays, HOLIDAY_SOURCE_VERSION } from './calendar/holidays'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'
import { createSettingsService, readSetting } from './settings-service'

/** The one country the offline rule engine knows the holidays of (calendar/holidays.ts). */
const HOLIDAY_COUNTRY = 'TR'

export type CalendarDayRow = typeof calendarDays.$inferSelect

/** A day as the calendar shows it: yearly notes repeat on later years with their own `occurrenceDate`. */
export interface CalendarEntry extends CalendarDayRow {
  occurrenceDate: string
  /** True for a later-year repeat of a `recurringYearly` row (edit the original by its id). */
  repeated: boolean
}

export interface GenerationResult {
  year: number
  /** False when the year was already generated with the current rule set. */
  generated: boolean
  inserted: number
  updated: number
  cancelled: number
}

const KIND_ORDER: Record<CalendarDayRow['kind'], number> = {
  holiday: 0,
  half_holiday: 1,
  special: 2,
  event: 3,
  note: 4
}

/** Rows per INSERT statement (SQLite bound-parameter limit stays far away). */
const INSERT_CHUNK = 200

const yearOf = (date: string): number => Number(date.slice(0, 4))

/** Every day a note target covers, sorted and unique; throws when it would exceed CALENDAR_BULK_MAX. */
function expandTarget(target: ReturnType<typeof calendarNoteInputSchema.parse>['target']): LocalDate[] {
  const tooMany = () => invalid('errors.calendarTooManyDates', { max: CALENDAR_BULK_MAX })
  switch (target.mode) {
    case 'single':
      return [target.date as LocalDate]
    case 'list':
      return [...new Set(target.dates)].sort() as LocalDate[]
    case 'range':
    case 'weekdays': {
      const from = target.from as LocalDate
      const span = diffDays(from, target.to as LocalDate) + 1
      const wanted = target.mode === 'weekdays' ? new Set(target.weekdays) : null
      // Each listed weekday occurs at least once a week: a span this long cannot fit under the cap.
      if (span > (wanted ? (CALENDAR_BULK_MAX / wanted.size + 1) * 7 : CALENDAR_BULK_MAX)) throw tooMany()
      const out: LocalDate[] = []
      for (let i = 0; i < span; i++) {
        const d = addDays(from, i)
        if (!wanted || wanted.has(weekday(d))) out.push(d)
      }
      return out
    }
  }
}

export function createCalendarService(deps: ServiceDeps) {
  const { db } = deps
  const settings = createSettingsService(db, deps.clock)
  const tape = createCalendarGrid(deps)

  /** Holidays and notes are not sensitive: the calendar, its notes screen and Today all show them. */
  const requireCalendarRead = (ctx: Ctx): void => {
    if (!ctx.can('calendar', 'view') && !ctx.can('calendar.notes', 'view') && !ctx.can('today', 'view'))
      throw permissionDenied()
  }

  const getDay = (tx: Pick<Tx, 'select'>, id: string): CalendarDayRow => {
    const row = tx.select().from(calendarDays).where(eq(calendarDays.id, id)).get()
    if (!row) throw notFound('calendar_day', id)
    return row
  }

  /**
   * Brings the generated rows of `year` in line with the rule engine, in place: matching generated rows are
   * kept (same ids), changed ones updated, missing ones inserted, vanished ones cancelled. A slot (group + day)
   * that a person edited, moved or cancelled (`user`) or that was verified online stays as it is. The rule engine
   * knows Türkiye's holidays only: a hotel in another country gets none (the wizard says so), and the ones made
   * before its country changed are cancelled, the ones checked online included (Faz 4 bug hunt #8).
   */
  function regenerate(ctx: Ctx, year: number): GenerationResult {
    const country = hotelCountry()
    const fresh = country === HOLIDAY_COUNTRY ? generateTurkishHolidays(year) : []
    return inTransaction(deps, ctx, (tx, audit, now) => {
      const existing = tx.select().from(calendarDays).where(eq(calendarDays.generatedYear, year)).all()
      const claimed = new Set<string>()
      // A group checked online (Faz 11, calendar/holiday-check.ts) may sit on other days than the rule engine's:
      // the whole group is claimed, so its old days never come back next to the announced ones.
      const verifiedGroups = new Set<string>()
      const generated = new Map<string, CalendarDayRow>()
      const foreign: string[] = []
      for (const row of existing) {
        const slot = `${row.groupKey}|${row.date}`
        // Another country: an online-checked Turkish holiday goes like a generated one (a cancelled one is free).
        if (row.source === 'verified' && (fresh.length === 0 || row.cancelledAt)) {
          if (!row.cancelledAt) foreign.push(row.id)
          continue
        }
        if (row.source === 'generated') generated.set(`${slot}|${row.kind}`, row)
        else claimed.add(slot)
        if (row.source === 'verified' && row.groupKey) verifiedGroups.add(row.groupKey)
      }
      const seen = new Set<string>()
      const inserts: (typeof calendarDays.$inferInsert)[] = []
      let updated = 0
      const iso = now.toISOString()
      for (const h of fresh) {
        const slot = `${h.groupKey}|${h.date}`
        const key = `${slot}|${h.kind}`
        const current = generated.get(key)
        if (current) {
          seen.add(key)
          const same =
            !current.cancelledAt &&
            current.estimated === h.estimated &&
            current.generator === h.generator &&
            JSON.stringify(current.titleI18n) === JSON.stringify(h.titleI18n)
          if (!same) {
            tx.update(calendarDays)
              .set({
                titleI18n: h.titleI18n,
                estimated: h.estimated,
                generator: h.generator,
                cancelledAt: null,
                updatedAt: iso
              })
              .where(eq(calendarDays.id, current.id))
              .run()
            updated++
          }
          continue
        }
        if (claimed.has(slot) || verifiedGroups.has(h.groupKey)) continue
        inserts.push({
          id: newId(now),
          date: h.date,
          kind: h.kind,
          title: null,
          titleI18n: h.titleI18n,
          source: 'generated',
          estimated: h.estimated,
          generator: h.generator,
          groupKey: h.groupKey,
          recurringYearly: false,
          generatedYear: year,
          createdBy: null,
          ...stamps(now)
        })
      }
      for (let i = 0; i < inserts.length; i += INSERT_CHUNK)
        tx.insert(calendarDays)
          .values(inserts.slice(i, i + INSERT_CHUNK))
          .run()
      const vanished = [
        ...[...generated.entries()]
          .filter(([key, row]) => !seen.has(key) && !row.cancelledAt)
          .map(([, row]) => row.id),
        ...foreign
      ]
      if (vanished.length)
        tx.update(calendarDays)
          .set({ cancelledAt: iso, updatedAt: iso })
          .where(inArray(calendarDays.id, vanished))
          .run()
      const before = tx.select().from(calendarGeneration).where(eq(calendarGeneration.year, year)).get()
      tx.insert(calendarGeneration)
        .values({ year, generatedAt: iso, sourceVersion: HOLIDAY_SOURCE_VERSION, country })
        .onConflictDoUpdate({
          target: calendarGeneration.year,
          set: { generatedAt: iso, sourceVersion: HOLIDAY_SOURCE_VERSION, country }
        })
        .run()
      const result = { year, generated: true, inserted: inserts.length, updated, cancelled: vanished.length }
      audit({
        entity: 'calendar_generation',
        entityId: String(year),
        action: before ? 'update' : 'create',
        before,
        after: { sourceVersion: HOLIDAY_SOURCE_VERSION, country, ...result }
      })
      return result
    })
  }

  /** The hotel's country (`hotel.country`); the generation of a year made for another one is made again. */
  const hotelCountry = (): string => readSetting(db, 'hotel.country')

  function ensureGenerated(ctx: Ctx, year: number): GenerationResult {
    const row = db.select().from(calendarGeneration).where(eq(calendarGeneration.year, year)).get()
    if (
      row &&
      row.sourceVersion === HOLIDAY_SOURCE_VERSION &&
      (row.country ?? HOLIDAY_COUNTRY) === hotelCountry()
    )
      return { year, generated: false, inserted: 0, updated: 0, cancelled: 0 }
    // A read-only copy (or the portfolio reading one) shows the days it has; it cannot make the year's holidays.
    if (ctx.readOnly) return { year, generated: false, inserted: 0, updated: 0, cancelled: 0 }
    return regenerate(ctx, year)
  }

  /** Calendar entries in [from, to) (yearly notes repeated); the years they touch are generated first. */
  function entriesBetween(ctx: Ctx, from: string, to: string): CalendarEntry[] {
    const range = parseInput(calendarRangeSchema, { from, to })
    const firstYear = yearOf(range.from)
    const lastYear = yearOf(addDays(range.to as LocalDate, -1))
    for (let y = firstYear; y <= lastYear; y++) ensureGenerated(ctx, y)

    const rows = db
      .select()
      .from(calendarDays)
      .where(
        and(
          isNull(calendarDays.cancelledAt),
          gte(calendarDays.date, range.from),
          lt(calendarDays.date, range.to)
        )
      )
      .all()
    const entries: CalendarEntry[] = rows.map((r) => ({ ...r, occurrenceDate: r.date, repeated: false }))
    const yearly = db
      .select()
      .from(calendarDays)
      .where(
        and(
          isNull(calendarDays.cancelledAt),
          eq(calendarDays.recurringYearly, true),
          lt(calendarDays.date, `${lastYear}-01-01`)
        )
      )
      .all()
    for (const row of yearly) {
      const month = Number(row.date.slice(5, 7))
      const day = Number(row.date.slice(8, 10))
      for (let y = Math.max(firstYear, yearOf(row.date) + 1); y <= lastYear; y++) {
        const occurrence = clampedDate(y, month, day)
        if (occurrence >= range.from && occurrence < range.to)
          entries.push({ ...row, occurrenceDate: occurrence, repeated: true })
      }
    }
    return entries.sort(
      (a, b) =>
        (a.occurrenceDate < b.occurrenceDate ? -1 : a.occurrenceDate > b.occurrenceDate ? 1 : 0) ||
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
    )
  }

  return {
    /**
     * Generates the year's public holidays once (idempotent); a newer rule set (HOLIDAY_SOURCE_VERSION)
     * regenerates it. Viewing the calendar is enough: the rows are derived, never typed.
     */
    ensureYearGenerated(ctx: Ctx, year: number): GenerationResult {
      requireCalendarRead(ctx)
      return ensureGenerated(ctx, parseInput(calendarYearSchema, year))
    },

    /** Re-runs the rule engine for a year now; `user` and `verified` rows are left alone. */
    regenerateYear(ctx: Ctx, year: number): GenerationResult {
      requirePermission(ctx, 'calendar.notes', 'edit')
      return regenerate(ctx, parseInput(calendarYearSchema, year))
    },

    /** Days in [from, to) for the calendar views; the years they touch are generated on the way. */
    listRange(ctx: Ctx, from: string, to: string): CalendarEntry[] {
      requireCalendarRead(ctx)
      return entriesBetween(ctx, from, to)
    },

    /**
     * Public-holiday dates in [from, to) for pay rules (holiday work, §6.6). Internal: the calling service
     * checks its own permission (the dates are derived and not sensitive).
     */
    holidayDatesBetween(ctx: Ctx, from: string, to: string): LocalDate[] {
      const dates = entriesBetween(ctx, from, to)
        .filter((e) => e.kind === 'holiday')
        .map((e) => e.occurrenceDate as LocalDate)
      return [...new Set(dates)].sort()
    },

    /**
     * One note on one day, a range, chosen weekdays of a range ("her cumartesi") or a pasted list — all rows
     * in one transaction; several rows share a `group_key` so they can be cancelled together.
     */
    addNote(ctx: Ctx, input: CalendarNoteInput): CalendarDayRow[] {
      requirePermission(ctx, 'calendar.notes', 'edit')
      const data = parseInput(calendarNoteInputSchema, input)
      const dates = expandTarget(data.target)
      if (dates.length === 0) throw invalid('errors.calendarNoDates')
      if (dates.length > CALENDAR_BULK_MAX)
        throw invalid('errors.calendarTooManyDates', { max: CALENDAR_BULK_MAX })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const groupKey = dates.length > 1 ? `note:${newId(now)}` : null
        const fields = {
          kind: data.kind,
          title: data.title,
          titleI18n: null,
          note: data.note ?? null,
          color: data.color ?? null,
          source: 'user' as const,
          estimated: false,
          generator: null,
          groupKey,
          recurringYearly: data.recurringYearly,
          generatedYear: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        const rows = dates.map((date) => ({ id: newId(now), date, ...fields }))
        for (let i = 0; i < rows.length; i += INSERT_CHUNK)
          tx.insert(calendarDays)
            .values(rows.slice(i, i + INSERT_CHUNK))
            .run()
        const first = rows[0] as (typeof rows)[number]
        audit({
          entity: 'calendar_day',
          entityId: groupKey ?? first.id,
          action: 'create',
          after: { ...fields, dates, mode: data.target.mode }
        })
        return tx
          .select()
          .from(calendarDays)
          .where(groupKey ? eq(calendarDays.groupKey, groupKey) : eq(calendarDays.id, first.id))
          .orderBy(asc(calendarDays.date))
          .all()
      })
    },

    /**
     * Changes a day. A generated (or verified) row becomes `user` and is kept by regeneration. Moving such a
     * row to another date leaves the original as a cancelled `user` row, so the rule engine does not bring
     * the old date back, and returns the new row.
     */
    editDay(ctx: Ctx, id: string, patch: CalendarDayEdit): CalendarDayRow {
      requirePermission(ctx, 'calendar.notes', 'edit')
      const p = parseInput(calendarDayEditSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getDay(tx, id)
        if (before.cancelledAt) throw invalid('errors.alreadyCancelled')
        const iso = now.toISOString()
        // Only real changes count: saving a generated holiday as it is keeps it generated (and corrected by the
        // yearly check). Its shown name is one of its translations, which is no rename.
        const sameTitle =
          p.title === undefined ||
          p.title === before.title ||
          (before.title === null && Object.values(before.titleI18n ?? {}).includes(p.title ?? ''))
        const fields = {
          ...(p.kind !== undefined && p.kind !== before.kind ? { kind: p.kind } : {}),
          // A renamed generated holiday no longer matches its translations.
          ...(!sameTitle ? { title: p.title, titleI18n: null } : {}),
          ...(p.note !== undefined && (p.note ?? null) !== before.note ? { note: p.note ?? null } : {}),
          ...(p.color !== undefined && p.color !== before.color ? { color: p.color } : {}),
          ...(p.recurringYearly !== undefined && p.recurringYearly !== before.recurringYearly
            ? { recurringYearly: p.recurringYearly }
            : {})
        }
        const moved = p.date !== undefined && p.date !== before.date
        if (!moved && Object.keys(fields).length === 0) return before
        if (moved && before.generatedYear !== null) {
          tx.update(calendarDays)
            .set({ source: 'user', cancelledAt: iso, updatedAt: iso })
            .where(eq(calendarDays.id, id))
            .run()
          const newRow = {
            ...before,
            ...fields,
            id: newId(now),
            date: p.date as string,
            source: 'user' as const,
            estimated: false,
            cancelledAt: null,
            createdBy: ctx.userId,
            ...stamps(now)
          }
          tx.insert(calendarDays).values(newRow).run()
          audit({ entity: 'calendar_day', entityId: id, action: 'cancel', before, reason: 'moved' })
          audit({ entity: 'calendar_day', entityId: newRow.id, action: 'create', after: newRow })
          return getDay(tx, newRow.id)
        }
        tx.update(calendarDays)
          .set({
            ...fields,
            ...(moved ? { date: p.date, estimated: false } : {}),
            source: 'user',
            updatedAt: iso
          })
          .where(eq(calendarDays.id, id))
          .run()
        const after = getDay(tx, id)
        audit({ entity: 'calendar_day', entityId: id, action: 'update', before, after })
        return after
      })
    },

    /** Cancels one day (kept with `cancelled_at`; a generated day stays cancelled after regeneration). */
    cancelDay(ctx: Ctx, id: string, reason?: string): CalendarDayRow {
      requirePermission(ctx, 'calendar.notes', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getDay(tx, id)
        if (before.cancelledAt) throw invalid('errors.alreadyCancelled')
        const iso = now.toISOString()
        tx.update(calendarDays)
          .set({ source: 'user', cancelledAt: iso, updatedAt: iso })
          .where(eq(calendarDays.id, id))
          .run()
        const after = getDay(tx, id)
        audit({ entity: 'calendar_day', entityId: id, action: 'cancel', before, after, reason })
        return after
      })
    },

    /** Cancels every live day of a bulk note or a generated holiday group. Returns how many were cancelled. */
    cancelGroup(ctx: Ctx, groupKey: string, reason?: string): number {
      requirePermission(ctx, 'calendar.notes', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const live = tx
          .select({ id: calendarDays.id, date: calendarDays.date })
          .from(calendarDays)
          .where(and(eq(calendarDays.groupKey, groupKey), isNull(calendarDays.cancelledAt)))
          .all()
        if (live.length === 0) throw notFound('calendar_group', groupKey)
        const iso = now.toISOString()
        tx.update(calendarDays)
          .set({ source: 'user', cancelledAt: iso, updatedAt: iso })
          .where(and(eq(calendarDays.groupKey, groupKey), isNull(calendarDays.cancelledAt)))
          .run()
        audit({
          entity: 'calendar_day',
          entityId: groupKey,
          action: 'cancel',
          before: { ids: live.map((r) => r.id), dates: live.map((r) => r.date) },
          reason
        })
        return live.length
      })
    },

    /**
     * The tape chart of [from, to) (faz-05 madde 1, 5): rooms, stays with their night statuses, blocks, and the
     * holidays, special days and notes of those days.
     */
    grid(ctx: Ctx, input: { from: string; to: string }): GridData {
      const base = tape.grid(ctx, input)
      const days = entriesBetween(ctx, base.from, base.to).map((e) => ({
        id: e.id,
        date: e.occurrenceDate,
        kind: e.kind,
        title: e.title,
        titleI18n: e.titleI18n ?? null,
        note: e.note,
        estimated: e.estimated
      }))
      return { ...base, days }
    },

    /**
     * Reservations cancelled or marked "gelmedi" in the last `days` days (nothing is deleted: the calendar's "Son
     * iptaller" list; the full record is on the guest card → Geçmiş). Newest first.
     */
    recentEnded(ctx: Ctx, input: { days?: number }): RecentEnded[] {
      requirePermission(ctx, 'calendar', 'view')
      const { days } = parseInput(recentEndedSchema, input)
      const cutoff = new Date(deps.clock().getTime() - days * 86_400_000).toISOString()
      // When the reservation ended: a cancellation's own stamp; for "gelmedi" (no stamp of its own) the audit row of
      // the status change. `updatedAt` moves with every later edit (a note, a payment) and would bring old rows back.
      const noShowAt = sql<
        string | null
      >`(select max(${auditLog.ts}) from ${auditLog} where ${auditLog.entity} = 'reservation' and ${auditLog.entityId} = ${reservations.id} and ${auditLog.action} = 'no_show')`
      const endedAt = sql<string>`coalesce(${reservations.cancelledAt}, ${noShowAt}, ${reservations.updatedAt})`
      const rows = deps.db
        .select({
          id: reservations.id,
          code: reservations.code,
          status: reservations.status,
          endedAt,
          reason: reservations.cancelReason,
          first: guests.firstName,
          last: guests.lastName
        })
        .from(reservations)
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(and(inArray(reservations.status, ['cancelled', 'no_show']), sql`${endedAt} >= ${cutoff}`))
        .orderBy(desc(endedAt))
        .limit(RECENT_ENDED_MAX)
        .all()
      if (rows.length === 0) return []
      const stays = deps.db
        .select({
          reservationId: reservationRooms.reservationId,
          number: rooms.number,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut
        })
        .from(reservationRooms)
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .where(
          inArray(
            reservationRooms.reservationId,
            rows.map((r) => r.id)
          )
        )
        .orderBy(asc(reservationRooms.checkIn))
        .all()
      return rows.map((r) => {
        const own = stays.filter((x) => x.reservationId === r.id)
        return {
          reservationId: r.id,
          code: r.code,
          guestName: `${r.first} ${r.last}`.trim(),
          status: r.status === 'no_show' ? 'no_show' : 'cancelled',
          endedAt: r.endedAt,
          reason: r.reason,
          rooms: [...new Set(own.map((x) => x.number))],
          checkIn: own[0]?.checkIn ?? null,
          checkOut: own.length ? own[own.length - 1]!.checkOut : null
        }
      })
    },

    /** Guest name, phone or reservation code → stays to jump to on the grid. */
    findStays: tape.findStays,
    bounds: tape.bounds,

    /** Rooms free for a whole stay ("boş oda bul"). */
    freeRooms: tape.freeRooms,

    /** Weekdays the calendar highlights (setting `calendar.highlightWeekdays`, 0 = Sunday; S-24). */
    highlightWeekdays(ctx: Ctx): number[] {
      return settings.get(ctx)['calendar.highlightWeekdays']
    }
  }
}

export type CalendarService = ReturnType<typeof createCalendarService>
