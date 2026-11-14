// Faz 9: in-house guests and KBS marks, Today screen, calendar notes and special days.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/today.ts.
import * as z from 'zod'
import { proc, type Procedure } from '../proc'
import { idSchema, localDateSchema } from '../rooms'
import { calendarDayEditSchema, calendarDayKindSchema, calendarNoteInputSchema } from '../operations'

const okSchema = z.object({ ok: z.literal(true) })
const iso = z.string()
const i18n = z.object({ tr: z.string(), en: z.string(), ru: z.string() }).partial().nullable()
const money = z.number().int().safe()

// ---- Otelde kalanlar (G-53, G-54) ----

export const inHouseOccupantSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  isPrimary: z.boolean(),
  /** "kızıl saçlı": staff screens only, never in exports (§4.9-13). */
  descriptorNote: z.string().nullable(),
  arrivedAt: iso.nullable(),
  leftAt: iso.nullable(),
  kbsReportedAt: iso.nullable(),
  kbsReportedByName: z.string().nullable(),
  kbsCheckoutAt: iso.nullable(),
  kbsCheckoutByName: z.string().nullable()
})
export type InHouseOccupant = z.infer<typeof inHouseOccupantSchema>

export const inHouseRoomSchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  reservationCode: z.string(),
  roomId: idSchema,
  roomNumber: z.string(),
  roomTypeName: z.string(),
  roomTypeNameI18n: i18n,
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  people: z.number().int(),
  guestName: z.string(),
  note: z.string().nullable(),
  /** null: the caller may not see payments. */
  balanceMinor: money.nullable(),
  currency: z.string().nullable(),
  /** KBS work left in the room (unmarked people; 1 when nobody is recorded). */
  kbsGaps: z.number().int(),
  occupants: z.array(inHouseOccupantSchema)
})
export type InHouseRoomDto = z.infer<typeof inHouseRoomSchema>

export const kbsCheckoutPendingSchema = z.object({
  occupantId: idSchema,
  stayId: idSchema,
  fullName: z.string(),
  roomNumber: z.string(),
  /** false: the KBS entry was never marked either; "KBS çıkışını yaptım" then sets both marks. */
  kbsReported: z.boolean(),
  leftAt: iso.nullable()
})

export const inHouseViewSchema = z.object({
  today: localDateSchema,
  showMoney: z.boolean(),
  /** The hotel's setting kbs.checksEnabled: off → no person is shown as "KBS eksik". */
  kbsChecks: z.boolean(),
  rooms: z.array(inHouseRoomSchema),
  checkoutPending: z.array(kbsCheckoutPendingSchema)
})
export type InHouseViewDto = z.infer<typeof inHouseViewSchema>

export const inHouseAddPersonSchema = z
  .object({
    stayId: idSchema,
    fullName: z.string().trim().min(1).max(120),
    descriptorNote: z.string().trim().max(200).nullish(),
    /** Reported to KBS at the desk already (G-53): marked in the same step, with who and when. */
    kbsReported: z.boolean().optional(),
    /** The user saw the blacklist warning for this person and goes on (G-45, §6.9). */
    blacklistConfirmed: z.boolean().optional()
  })
  .strict()

export const inHouseMarkSchema = z
  .object({ occupantId: idSchema, mark: z.enum(['reported', 'checkout', 'clearReported']) })
  .strict()

// ---- Bugün (G-92) ----

export const dayStaySchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  reservationCode: z.string(),
  roomNumber: z.string(),
  guestName: z.string(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  nights: z.number().int(),
  checkedInAt: iso.nullable(),
  checkedOutAt: iso.nullable(),
  overdue: z.boolean(),
  note: z.string().nullable(),
  balanceMinor: money.nullable(),
  currency: z.string().nullable()
})
export type DayStayDto = z.infer<typeof dayStaySchema>

export const todayTaskSchema = z.object({
  id: idSchema,
  title: z.string(),
  titleI18n: i18n,
  dueAt: z.string().nullable(),
  overdue: z.boolean(),
  roomNumber: z.string().nullable(),
  /** Seed code of the task's template (a legal reminder links to its screen). */
  templateCode: z.string().nullable()
})
export type TodayTaskDto = z.infer<typeof todayTaskSchema>

export const todaySpecialDaySchema = z.object({
  id: idSchema,
  kind: calendarDayKindSchema,
  title: z.string().nullable(),
  titleI18n: i18n,
  note: z.string().nullable(),
  color: z.string().nullable(),
  estimated: z.boolean()
})
export type TodaySpecialDayDto = z.infer<typeof todaySpecialDaySchema>

export const todayReminderSchema = z.object({
  kind: z.literal('tourism'),
  period: z.string(),
  dueDate: localDateSchema,
  daysLeft: z.number().int()
})

/** Each part is null when the caller's role may not see it (the screen hides that card). */
export const todaySummarySchema = z.object({
  at: iso,
  today: localDateSchema,
  nowTime: z.string(),
  checkoutTime: z.string(),
  sellableRooms: z.number().int(),
  soldTonight: z.number().int(),
  arrivals: z.array(dayStaySchema).nullable(),
  departures: z.array(dayStaySchema).nullable(),
  inHouse: z.object({ rooms: z.number().int(), people: z.number().int() }).nullable(),
  kbsMissing: z
    .array(
      z.object({
        occupantId: idSchema.nullable(),
        stayId: idSchema,
        roomNumber: z.string(),
        fullName: z.string().nullable(),
        kind: z.enum(['checkin', 'checkout', 'unnamed'])
      })
    )
    .nullable(),
  dirtyRooms: z.array(z.object({ id: idSchema, number: z.string() })).nullable(),
  tasks: z.array(todayTaskSchema).nullable(),
  handovers: z
    .object({
      count: z.number().int(),
      latest: z.object({ id: idSchema, writtenAt: iso, text: z.string().nullable() }).nullable()
    })
    .nullable(),
  /** Cash that should be in the drawer, per currency (cash viewers). */
  drawer: z.array(z.object({ currency: z.string(), amountMinor: money })).nullable(),
  specialDays: z.array(todaySpecialDaySchema),
  /** Camera alarms nobody looked at and a crashed sidecar (K-50); null without the camera right. */
  camera: z.object({ newAlerts: z.number().int(), problem: z.boolean() }).nullable().optional(),
  reminders: z.array(todayReminderSchema)
})
export type TodaySummaryDto = z.infer<typeof todaySummarySchema>

// ---- Takvim notları ve özel günler (G-16, G-40) ----

export const calendarEntrySchema = z.object({
  id: idSchema,
  date: localDateSchema,
  /** The day it is shown on (a yearly note's later years). */
  occurrenceDate: localDateSchema,
  kind: calendarDayKindSchema,
  title: z.string().nullable(),
  titleI18n: i18n,
  note: z.string().nullable(),
  color: z.string().nullable(),
  source: z.enum(['generated', 'verified', 'user']),
  estimated: z.boolean(),
  groupKey: z.string().nullable(),
  recurringYearly: z.boolean(),
  /** A later-year repeat of a yearly note (edit the original). */
  repeated: z.boolean(),
  /** Set on holiday rows the rule engine made (also after a person edited them). */
  generatedYear: z.number().int().nullable()
})
export type CalendarEntryDto = z.infer<typeof calendarEntrySchema>

export const calendarNotesListSchema = z.object({
  /** Weekdays the calendar highlights (0 = Sunday; setting, S-24). */
  highlightWeekdays: z.array(z.number().int()),
  days: z.array(calendarEntrySchema)
})

export const todayProcedures = {
  'inHouse.list': proc(z.object({ q: z.string().trim().max(80).optional() }).strict(), inHouseViewSchema),
  'inHouse.addPerson': proc(inHouseAddPersonSchema, okSchema),
  'inHouse.markKbs': proc(inHouseMarkSchema, okSchema),

  'today.summary': proc(z.object({}).strict(), todaySummarySchema),
  /** "Yapıldı" on a task of the Today card (same service as the Görevler screen). */
  'today.completeTask': proc(z.object({ id: idSchema }).strict(), okSchema),

  'calendarNotes.list': proc(
    z.object({ from: localDateSchema, to: localDateSchema }).strict(),
    calendarNotesListSchema
  ),
  // Same service as `calendar.addNote` (the tape chart's day and bulk dialogs).
  'calendarNotes.add': proc(calendarNoteInputSchema, z.object({ count: z.number().int() })),
  'calendarNotes.edit': proc(
    z.object({ id: idSchema, patch: calendarDayEditSchema }).strict(),
    calendarEntrySchema
  ),
  'calendarNotes.cancel': proc(
    z.object({ id: idSchema, reason: z.string().trim().max(200).optional() }).strict(),
    okSchema
  ),
  'calendarNotes.cancelGroup': proc(
    z.object({ groupKey: z.string().min(1).max(80), reason: z.string().trim().max(200).optional() }).strict(),
    z.object({ count: z.number().int() })
  )
} as const satisfies Record<string, Procedure>
