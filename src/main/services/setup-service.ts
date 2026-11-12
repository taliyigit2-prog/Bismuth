// First-run setup (G-10, faz-04 madde 1): while no account exists the window is the wizard. Progress is kept
// after every step (without passwords) so a closed wizard resumes; "Kurulumu bitir" applies everything in ONE
// transaction through the regular services (their checks and audit rows), creates the owner account and its
// recovery codes. After that the wizard is closed for good.
import { eq } from 'drizzle-orm'
import {
  appModeSchema,
  setupDraftSchema,
  setupProgressSchema,
  type AppMode,
  type ListKind,
  type SetupDraft,
  type SetupProgress
} from '@shared/contract/admin'
import type { SettingsKey, SettingsPatch } from '@shared/contract'
import { localDate, localDateOf, type LocalDate } from '@shared/date'
import { localDateIn } from '@shared/domain/weather'
import { taskSuggestedIn } from '@shared/domain/task-country'
import type { BismuthDb } from '../db/client'
import { settings, users } from '../db/schema'
import type { createAuthService } from './auth-service'
import type { createCalendarService } from './calendar-service'
import { writeAudit } from './audit'
import { generateTurkishHolidays } from './calendar/holidays'
import { ctxKind, type Ctx } from './context'
import { nameKey } from '@shared/name-key'
import { conflict, parseInput, type ServiceDeps } from './kit'
import type { createListsService } from './lists-service'
import type { createRoomsService } from './rooms-service'
import type { SettingsService } from './settings-service'
import type { createShiftService } from './shift-service'
import type { createStaffService } from './staff-service'
import type { createTasksService } from './tasks-service'
import type { createUsersService } from './users-service'
import { readSetting } from './settings-service'

/** Rows of the settings table outside the user settings (not in `settingsShape`, never sent to the UI as such). */
const COMPLETED_KEY = 'internal.setup.completedAt'
const PROGRESS_KEY = 'internal.setup.progress'
/** The saved draft stays small: a wizard draft is a few kilobytes. */
const MAX_PROGRESS_BYTES = 256 * 1024

export interface SetupServiceParts {
  settings: SettingsService
  rooms: ReturnType<typeof createRoomsService>
  lists: ReturnType<typeof createListsService>
  users: ReturnType<typeof createUsersService>
  auth: ReturnType<typeof createAuthService>
  staff: ReturnType<typeof createStaffService>
  shifts: ReturnType<typeof createShiftService>
  tasks: ReturnType<typeof createTasksService>
  calendar: ReturnType<typeof createCalendarService>
}

/** Field names that may hold a secret anywhere in the draft: password(s), PIN(s), secrets, recovery codes. */
const SECRET_KEY = /[pP]assword|[sS]ecret|[rR]ecovery|^pin(?![a-z])|Pin(?![a-z])/

/** Never keep a secret in the saved draft: passwords and PINs are typed again after a restart. */
export function withoutSecrets(draft: Record<string, unknown>): Record<string, unknown> {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip)
    if (value === null || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) if (!SECRET_KEY.test(key)) out[key] = strip(v)
    return out
  }
  return strip(draft) as Record<string, unknown>
}

const isSetupCaller = (ctx: Ctx): boolean => {
  const kind = ctxKind(ctx)
  return kind === 'setup' || kind === 'system'
}
const requireSetupCtx = (ctx: Ctx): void => {
  if (!isSetupCaller(ctx)) throw conflict('errors.setupDone')
}
/**
 * Rooms set up by the wizard count from long before the hotel's first record, so a past day typed in later
 * (old reservations, Excel import) finds its rooms (default).
 */
const ROOMS_VALID_FROM = '2000-01-01' as LocalDate

export function createSetupService(deps: ServiceDeps, parts: SetupServiceParts) {
  const db = deps.db as BismuthDb
  let doneCache = false
  /** True while `finish` runs: the owner row it just wrote is not committed yet, the wizard keeps its rights. */
  let finishing = false

  const readRow = (key: string): string | null =>
    db.select().from(settings).where(eq(settings.key, key)).get()?.valueJson ?? null
  // Outside the write gate on purpose: the wizard runs only before the hotel exists (a replaced main computer is
  // always set up already, so `finish` is refused by `isDone` long before it gets here).
  const writeRow = (key: string, valueJson: string, userId: string | null): void => {
    const updatedAt = deps.clock().toISOString()
    db.insert(settings)
      .values({ key, valueJson, updatedAt, updatedBy: userId })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson, updatedAt, updatedBy: userId } })
      .run()
  }

  /** Set up = an account exists (older databases and test fixtures have accounts but no completion mark). */
  function isDone(): boolean {
    if (doneCache) return true
    // Not cached mid-finish: a failed finish rolls the owner back and the wizard stays open.
    if (finishing) return false
    doneCache =
      readRow(COMPLETED_KEY) !== null || db.select({ id: users.id }).from(users).limit(1).get() !== undefined
    return doneCache
  }

  function progress(): SetupProgress | null {
    const raw = readRow(PROGRESS_KEY)
    if (!raw) return null
    try {
      const parsed = setupProgressSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      // A damaged row: the wizard starts over rather than not opening.
      return null
    }
  }

  return {
    isDone,

    /** The wizard may still write: not set up, and this computer is not set to use another one (client mode). */
    isOpen(): boolean {
      return !isDone() && readSetting(db, 'app.mode') !== 'client'
    },

    state(ctx: Ctx): { done: boolean; mode: AppMode; progress: SetupProgress | null } {
      const done = isDone()
      // The answers so far only to the wizard itself (the procedure is public).
      const mine = !done && isSetupCaller(ctx)
      return { done, mode: readSetting(db, 'app.mode'), progress: mine ? progress() : null }
    },

    /** The wizard's choices: seeded lists in every language, roles for employee accounts, default pay rules. */
    options(ctx: Ctx) {
      requireSetupCtx(ctx)
      const year = Number(localDateOf(deps.clock()).slice(0, 4))
      const list = (kind: ListKind) => parts.lists.list(ctx, kind, { includeInactive: true })
      return {
        roomTypes: parts.rooms.listRoomTypes(ctx, { includeInactive: true }),
        paymentMethods: list('paymentMethods'),
        salesChannels: list('salesChannels'),
        extraServices: list('extraServices'),
        shifts: parts.shifts.listShifts(ctx, { includeInactive: true }),
        taskTemplates: parts.tasks
          .listTemplates(ctx, { includeInactive: true })
          .filter((t) => t.suggested || t.kind === 'legal'),
        roles: parts.users.listRoles(ctx),
        payPolicy: parts.staff.getPolicy(ctx, null).values,
        holidays: [year, year + 1].flatMap((y) =>
          generateTurkishHolidays(y).map(({ date, kind, titleI18n, estimated }) => ({
            date,
            kind,
            titleI18n,
            estimated
          }))
        )
      }
    },

    /** Keeps the wizard's place and answers (no secrets) so it resumes after a restart. */
    saveProgress(ctx: Ctx, input: SetupProgress): void {
      requireSetupCtx(ctx)
      if (isDone()) throw conflict('errors.setupDone')
      const data = parseInput(setupProgressSchema, input)
      const json = JSON.stringify({ step: data.step, draft: withoutSecrets(data.draft) })
      if (Buffer.byteLength(json, 'utf8') > MAX_PROGRESS_BYTES)
        throw conflict('errors.validation', { reason: 'progress too large' })
      writeRow(PROGRESS_KEY, json, ctx.userId)
    },

    /**
     * Work mode is chosen early: "client" ends the wizard here and the window goes to the connection screen.
     * Written directly (not through the settings permission check): in client mode the wizard has no other right,
     * yet the person may still go back and pick another mode.
     */
    setMode(ctx: Ctx, mode: AppMode): void {
      requireSetupCtx(ctx)
      if (isDone()) throw conflict('errors.setupDone')
      const value = parseInput(appModeSchema, mode)
      const before = readSetting(db, 'app.mode')
      if (before === value) return
      const now = deps.clock()
      db.transaction((tx) => {
        writeRow('app.mode', JSON.stringify(value), ctx.userId)
        writeAudit(
          tx,
          ctx,
          { entity: 'settings', entityId: 'app.mode', action: 'update', before, after: value },
          now
        )
      })
      parts.settings.announce(['app.mode'])
    },

    /**
     * Applies the whole wizard in one transaction and creates the owner. Returns the owner's id and the recovery
     * codes (shown once). Any failure leaves the database as it was and the wizard where it was.
     */
    finish(ctx: Ctx, input: SetupDraft): { ownerId: string; recoveryCodes: string[] } {
      requireSetupCtx(ctx)
      if (isDone()) throw conflict('errors.setupDone')
      const draft = parseInput(setupDraftSchema, input)
      if (readSetting(db, 'app.mode') === 'client') throw conflict('errors.setupClientMode')
      const today = localDate(localDateIn(deps.clock().toISOString(), draft.hotel.timezone))
      const settingsPatch = {
        'ui.language': draft.language,
        'ui.theme': draft.theme,
        'hotel.name': draft.hotel.name,
        'hotel.country': draft.hotel.country,
        'hotel.city': draft.hotel.city,
        'hotel.timezone': draft.hotel.timezone,
        'hotel.checkinTime': draft.hotel.checkinTime,
        'hotel.checkoutTime': draft.hotel.checkoutTime,
        'hotel.baseCurrency': draft.money.baseCurrency,
        'hotel.currencies': [...new Set([draft.money.baseCurrency, ...draft.money.currencies])],
        'calendar.highlightWeekdays': draft.calendar.highlightWeekdays,
        'businessDay.closingEnabled': draft.calendar.dayClosing,
        'staff.advanceFromDrawer': draft.staff.advanceFromDrawer
      } satisfies SettingsPatch

      finishing = true
      let result: { ownerId: string; recoveryCodes: string[] }
      try {
        result = db.transaction(() => {
          const { settings: settingsSvc, rooms, lists, users: usersSvc, staff, shifts, tasks } = parts

          settingsSvc.set(ctx, settingsPatch, { notify: false })

          // Room types: the picked seeded ones on with their prices, every other seeded one off, the hotel's own added.
          const picked = new Map(draft.roomTypes.selected.map((t) => [t.id, t]))
          const typeIds = new Map<string, string>()
          for (const type of rooms.listRoomTypes(ctx, { includeInactive: true })) {
            const choice = picked.get(type.id)
            if (choice) {
              rooms.updateRoomType(ctx, type.id, {
                active: true,
                basePriceMinor: choice.basePriceMinor ?? null,
                weekendPriceMinor: choice.weekendPriceMinor ?? null,
                baseCurrency: draft.money.baseCurrency
              })
            } else if (type.active) rooms.updateRoomType(ctx, type.id, { active: false })
          }
          for (const custom of draft.roomTypes.custom) {
            // A name the hotel typed that a ready type already has (any letter case) is that type: it is switched
            // on with the typed prices instead of being added twice.
            const same = rooms
              .listRoomTypes(ctx, { includeInactive: true })
              .find((t) =>
                [t.name, t.nameI18n?.tr, t.nameI18n?.en, t.nameI18n?.ru].some(
                  (n) => n && nameKey(n) === nameKey(custom.name)
                )
              )
            if (same) {
              rooms.updateRoomType(ctx, same.id, {
                active: true,
                basePriceMinor: custom.basePriceMinor ?? null,
                weekendPriceMinor: custom.weekendPriceMinor ?? null,
                baseCurrency: draft.money.baseCurrency
              })
              typeIds.set(custom.tempKey, same.id)
              continue
            }
            const created = rooms.createRoomType(ctx, {
              name: custom.name,
              group: 'custom',
              basePriceMinor: custom.basePriceMinor ?? null,
              weekendPriceMinor: custom.weekendPriceMinor ?? null,
              baseCurrency: draft.money.baseCurrency
            })
            typeIds.set(custom.tempKey, created.id)
          }
          const roomTypeId = (ref: { id: string } | { tempKey: string }): string => {
            if ('id' in ref) {
              if (!picked.has(ref.id)) throw conflict('errors.validation', { reason: 'room type not picked' })
              return ref.id
            }
            const id = typeIds.get(ref.tempKey)
            if (!id) throw conflict('errors.validation', { reason: 'unknown room type' })
            return id
          }
          rooms.createMany(
            ctx,
            draft.rooms.map((r, i) => ({
              number: r.number,
              floor: r.floor ?? null,
              roomTypeId: roomTypeId(r.roomType),
              beds: r.beds,
              sellable: r.sellable,
              sort: i,
              validFrom: ROOMS_VALID_FROM
            }))
          )

          // Payment methods, sales channels, extra services: keep the picked seeded rows on, add the hotel's own.
          const lists3: [ListKind, string[], string[]][] = [
            ['paymentMethods', draft.lists.paymentMethods, draft.lists.customPaymentMethods],
            ['salesChannels', draft.lists.salesChannels, draft.lists.customSalesChannels],
            ['extraServices', draft.lists.extraServices, draft.lists.customExtraServices]
          ]
          for (const [kind, keep, custom] of lists3) {
            const keepSet = new Set(keep)
            for (const row of lists.list(ctx, kind, { includeInactive: true })) {
              const active = keepSet.has(row.id)
              if (row.active !== active) lists.update(ctx, { kind, id: row.id, patch: { active } })
            }
            for (const name of custom) {
              // Same rule as room types: a name the list already has is that row, switched on.
              const same = lists
                .list(ctx, kind, { includeInactive: true })
                .find((r) =>
                  [r.name, r.nameI18n?.tr, r.nameI18n?.en, r.nameI18n?.ru].some(
                    (n) => n && nameKey(n) === nameKey(name)
                  )
                )
              if (!same) lists.create(ctx, { kind, name })
              else if (!same.active) lists.update(ctx, { kind, id: same.id, patch: { active: true } })
            }
          }
          // The cash drawer needs a cash method (G-36): at least one picked payment method must be cash.
          const cashLeft = lists.list(ctx, 'paymentMethods').some((m) => m.isCash)
          if (!cashLeft) throw conflict('errors.cashMethodRequired')

          if (Object.keys(draft.staff.policy).length > 0) staff.setPolicy(ctx, { values: draft.staff.policy })

          // Shifts: seeded ones updated or switched off, new ones added.
          const givenIds = new Set(draft.shifts.flatMap((s) => (s.id ? [s.id] : [])))
          const seededShifts = new Map(
            shifts.listShifts(ctx, { includeInactive: true }).map((x) => [x.id, x])
          )
          for (const existing of seededShifts.values())
            if (!givenIds.has(existing.id) && existing.active)
              shifts.updateShift(ctx, existing.id, { active: false })
          draft.shifts.forEach((s, sort) => {
            const times = { startTime: s.startTime, endTime: s.endTime, sort, active: true }
            if (!s.id) return void shifts.createShift(ctx, { name: s.name, ...times })
            // A seeded name left as shown keeps its translations (Gündüz / Day / День); only a new name replaces them.
            const before = seededShifts.get(s.id)
            const shown = [before?.name, ...Object.values(before?.displayName ?? {})]
            shifts.updateShift(ctx, s.id, shown.includes(s.name) ? times : { name: s.name, ...times })
          })

          // Suggested tasks the hotel picked (G-94) and the legal reminders on or off.
          const wanted = new Set(draft.tasks.suggestions)
          for (const template of tasks.listTemplates(ctx, { includeInactive: true })) {
            // A reminder bound to another country (Turkish legal ones, K-46 (7)) stays off and is not offered.
            const here = taskSuggestedIn(template.code, draft.hotel.country)
            const on = !here
              ? false
              : template.kind === 'legal'
                ? draft.tasks.legalReminders
                : template.suggested
                  ? wanted.has(template.id)
                  : null
            if (on === null || on === template.active) continue
            if (on) tasks.activateTemplate(ctx, template.id, { firstDueAt: template.firstDueAt ?? today })
            else tasks.deactivateTemplate(ctx, template.id)
          }
          // The hotel's own repeating tasks: active templates from today, like the suggestions picked above.
          for (const own of draft.tasks.custom)
            tasks.createTemplate(ctx, { ...own, kind: 'general', active: true, firstDueAt: today })

          const owner = usersSvc.createFirstOwner(ctx, draft.owner)

          // Employees, each with an optional sign-in account (must change the password at first sign-in, G-25).
          // The owner role is the person finishing the wizard; another owner is added later from Settings.
          const ownerRoleIds = new Set(
            usersSvc.listRoles(ctx).flatMap((r) => (r.code === 'owner' ? [r.id] : []))
          )
          for (const e of draft.employees) {
            if (e.account && ownerRoleIds.has(e.account.roleId))
              throw conflict('errors.validation', { reason: 'employee account cannot have the owner role' })
            const employee = staff.createEmployee(ctx, {
              firstName: e.firstName,
              lastName: e.lastName,
              position: e.position ?? null,
              startDate: e.startDate
            })
            if (e.account)
              usersSvc.createUser(ctx, {
                username: e.account.username,
                displayName: `${e.firstName} ${e.lastName}`,
                roleId: e.account.roleId,
                employeeId: employee.id,
                password: e.account.password
              })
          }

          const recoveryCodes = parts.auth.generateRecoveryCodes(ctx, owner.id)
          const completedAt = deps.clock()
          writeRow(COMPLETED_KEY, JSON.stringify(completedAt.toISOString()), null)
          writeRow(PROGRESS_KEY, 'null', null)
          writeAudit(
            db,
            ctx,
            { entity: 'setup', entityId: 'setup', action: 'done', after: { ownerId: owner.id } },
            completedAt
          )
          return { ownerId: owner.id, recoveryCodes }
        })
      } finally {
        finishing = false
      }
      doneCache = true
      parts.settings.announce(Object.keys(settingsPatch) as SettingsKey[])
      // The calendar's holidays for this year and next (generated offline, G-16); a failure here is not fatal.
      try {
        const year = Number(today.slice(0, 4))
        parts.calendar.ensureYearGenerated(ctx, year)
        parts.calendar.ensureYearGenerated(ctx, year + 1)
      } catch {
        // Generated again when the calendar opens those years.
      }
      return result
    }
  }
}
export type SetupService = ReturnType<typeof createSetupService>
