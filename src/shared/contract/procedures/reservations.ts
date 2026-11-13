// Faz 5: reservation calendar, reservation panel, occupants, quick payments, parking, blocks.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/reservations.ts.
// Types are what the services return (zod input); the renderer reads `ProcedureOutput`.
// This file holds the tape chart's reads (P5a): the grid of a date range, guest search, free rooms, and one
// calendar note from the grid's day header (calendar notes grow in Faz 9); P5c: closing a room by hand (G-38).
import * as z from 'zod'
import { calendarNoteInputSchema } from '../operations'
import { proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema, localDateSchema, minorSchema } from '../rooms'

/** Longest window one grid read covers (the calendar reads month by month). */
export const GRID_RANGE_MAX_DAYS = 400

const dayDiff = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 86_400_000

export const gridRangeSchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .strict()
  .refine((r) => r.to > r.from, { path: ['to'], message: 'to must be after from' })
  .refine((r) => dayDiff(r.from, r.to) <= GRID_RANGE_MAX_DAYS, { path: ['to'], message: 'range too long' })

export const HK_STATES = ['clean', 'dirty', 'inspected', 'maintenance', 'out_of_order'] as const

export const gridRoomSchema = z.object({
  id: idSchema,
  number: z.string(),
  floor: z.string().nullable(),
  typeId: idSchema,
  typeName: z.string(),
  typeNameI18n: i18nTextSchema.nullable(),
  beds: z.int(),
  sellable: z.boolean(),
  hk: z.enum(HK_STATES)
})
export type GridRoom = z.input<typeof gridRoomSchema>

export const gridNightSchema = z.object({
  date: localDateSchema,
  /** Payment status of the night (§6.3, `deriveFolioNights`). */
  pay: z.enum(['paid', 'partial', 'unpaid']),
  priceMinor: minorSchema
})

export const gridStaySchema = z.object({
  /** reservation_rooms.id */
  id: idSchema,
  reservationId: idSchema,
  /** The group booking the reservation belongs to (G-194); null/absent = none. Data only for now. */
  groupId: idSchema.nullish(),
  code: z.string(),
  roomId: idSchema,
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  dayUse: z.boolean(),
  /** Hours of an hourly stay ('HH:MM', K-48); null/absent = a night stay or a day-use of the whole day. */
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  reservationStatus: z.enum(['tentative', 'confirmed', 'checked_in', 'checked_out']),
  stayStatus: z.enum(['planned', 'in_house', 'done']),
  guestName: z.string(),
  currency: z.string(),
  nights: z.array(gridNightSchema),
  tagIds: z.array(idSchema),
  vip: z.boolean(),
  /** Someone in the room is not reported to KBS, or left without the KBS check-out (G-53, §6.15). */
  kbsMissing: z.boolean(),
  /** The guest's standing request (G-192): "info" shows as a request icon, "warn" as a warning. */
  standingNote: z.object({ text: z.string(), level: z.enum(['info', 'warn']) }).nullable(),
  hasNotes: z.boolean(),
  children: z.int()
})
export type GridStay = z.input<typeof gridStaySchema>

export const gridBlockSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  dateFrom: localDateSchema,
  dateTo: localDateSchema,
  kind: z.enum(['oos', 'ooo']),
  reason: z.string(),
  note: z.string().nullable(),
  /**
   * Closed by hand on the calendar (G-38) and lifted there too. A block opened by the room status board, an issue
   * or a task ends with its cause (the status goes back, the issue is resolved).
   */
  manual: z.boolean(),
  /** Days the room is not in use by its capacity history (not opened yet / taken out of use; Ayarlar → Odalar). */
  closed: z.boolean().optional()
})
export type GridBlock = z.input<typeof gridBlockSchema>

/** Longest block typed on the calendar (a longer closure is a room taken out of use: Settings → Rooms). */
export const BLOCK_MAX_DAYS = 400

/** "Satılmaz" / "Kullanım dışı" from the calendar (G-38): [dateFrom, dateTo), like a stay's nights. */
export const blockCreateSchema = z
  .object({
    roomId: idSchema,
    dateFrom: localDateSchema,
    /** Exclusive: the first day the room is sold again. */
    dateTo: localDateSchema,
    kind: z.enum(['oos', 'ooo']),
    reason: z.string().trim().min(1).max(200),
    note: z.string().trim().max(500).nullish()
  })
  .strict()
  .refine((b) => b.dateTo > b.dateFrom, { path: ['dateTo'], message: 'dateTo must be after dateFrom' })
  .refine((b) => dayDiff(b.dateFrom, b.dateTo) <= BLOCK_MAX_DAYS, { path: ['dateTo'], message: 'too long' })
export type BlockCreateInput = z.input<typeof blockCreateSchema>

export const blockCancelSchema = z
  .object({ id: idSchema, reason: z.string().trim().max(500).nullish() })
  .strict()

/** A holiday, special day, event or note on a date (yearly notes repeat with their occurrence date). */
export const gridDayEntrySchema = z.object({
  id: idSchema,
  date: localDateSchema,
  kind: z.enum(['holiday', 'half_holiday', 'special', 'note', 'event']),
  title: z.string().nullable(),
  titleI18n: i18nTextSchema.nullable(),
  note: z.string().nullable(),
  estimated: z.boolean()
})
export type GridDayEntry = z.input<typeof gridDayEntrySchema>

export const gridSchema = z.object({
  /** The hotel's business day (the main computer's clock). */
  today: localDateSchema,
  from: localDateSchema,
  to: localDateSchema,
  rooms: z.array(gridRoomSchema),
  stays: z.array(gridStaySchema),
  blocks: z.array(gridBlockSchema),
  days: z.array(gridDayEntrySchema)
})
export type GridData = z.input<typeof gridSchema>

// A longer text is cut, not refused (QA3c1 #6): nothing a person types in a search box is an error.
export const findStaysInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(2)
      .transform((q) => q.slice(0, 80).trim())
  })
  .strict()

export const foundStaySchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  code: z.string(),
  guestName: z.string(),
  roomId: idSchema,
  roomNumber: z.string(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  reservationStatus: z.enum(['tentative', 'confirmed', 'checked_in', 'checked_out'])
})
export type FoundStay = z.input<typeof foundStaySchema>

/** Years the grid scrolls through (G-31, K-46; `shared/domain/calendar-range.ts`). */
export const calendarBoundsSchema = z.object({ firstYear: z.int(), lastYear: z.int() })
export type CalendarBounds = z.input<typeof calendarBoundsSchema>

/** Most matches a guest search returns. */
export const FIND_STAYS_MAX = 20

export const freeRoomsInputSchema = z
  .object({
    checkIn: localDateSchema,
    /** Equal to checkIn: a day-use. */
    checkOut: localDateSchema,
    roomTypeId: idSchema.nullish()
  })
  .strict()
  .refine((r) => r.checkOut >= r.checkIn, { path: ['checkOut'], message: 'checkOut before checkIn' })
  .refine((r) => dayDiff(r.checkIn, r.checkOut) <= GRID_RANGE_MAX_DAYS, {
    path: ['checkOut'],
    message: 'range too long'
  })

export const reservationsProcedures = {
  /** The tape chart of [from, to): rooms, stays with night statuses, blocks, holidays and notes. */
  'reservations.grid': proc(gridRangeSchema, gridSchema),
  /** First and last year of the grid: the start-year setting or the oldest stay, ten years on or the furthest record. */
  'calendar.bounds': proc(z.object({}).strict(), calendarBoundsSchema),
  /**
   * Room number (exact; tried first), guest name, phone or reservation code → stays to jump to (the room's stays
   * first, then the others; nearest to today first).
   */
  'reservations.findStays': proc(findStaysInputSchema, z.array(foundStaySchema)),
  /** Rooms free for the whole stay (no night, no block), optionally of one room type. */
  'reservations.freeRooms': proc(freeRoomsInputSchema, z.object({ roomIds: z.array(idSchema) })),
  /** One note on a day, a range, chosen weekdays or a pasted date list (calendar service `addNote`). */
  'calendar.addNote': proc(calendarNoteInputSchema, z.object({ count: z.int() })),
  /** Close a room on the calendar: not for sale or out of order (needs `rooms.block`; never over sold nights). */
  'reservations.createBlock': proc(blockCreateSchema, gridBlockSchema),
  /** Lift a block made on the calendar: a running one ends today, a future one is cancelled (never deleted). */
  'reservations.cancelBlock': proc(blockCancelSchema, gridBlockSchema)
} as const satisfies Record<string, Procedure>
