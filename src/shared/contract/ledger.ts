// Day ledger inputs: day note, day closing, month summary (03-mimari.md §4.5, §6.4, §6.10; G-62, G-63, G-72,
// G-100). Expense inputs live in ./expenses, staff inputs in ./staff.
import * as z from 'zod'
import { daySchema, reasonSchema } from './expenses'

export const dayNoteSchema = z.object({
  date: daySchema,
  /** Empty or null clears the note. */
  note: z.string().max(1000).nullable(),
  /** Needed only when the day is closed (G-72). */
  reason: reasonSchema.optional()
})
export type DayNoteInput = z.input<typeof dayNoteSchema>

export const closeDaySchema = z.object({ date: daySchema })
export type CloseDayInput = z.input<typeof closeDaySchema>

export const reopenDaySchema = z.object({ date: daySchema, reason: reasonSchema })
export type ReopenDayInput = z.input<typeof reopenDaySchema>

export const yearMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  /** 1–12 */
  month: z.number().int().min(1).max(12)
})
export type YearMonthInput = z.input<typeof yearMonthSchema>
