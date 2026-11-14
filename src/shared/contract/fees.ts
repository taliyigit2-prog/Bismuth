// P21d (Ö-22): late check-out and no-show fee lines, the damage deposit and the night report. Spread into the
// contract from procedures/booking.ts and procedures/reports.ts.
import * as z from 'zod'
import { amountSchema, idSchema, localDateSchema } from './rooms'
import { clockTime } from './settings'

const minor = z.number().int()
const reasonText = z.string().trim().min(3).max(200)

export const feeQuoteInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('lateCheckout'), stayId: idSchema, time: clockTime }).strict(),
  z.object({ kind: z.literal('noShow'), reservationId: idSchema }).strict()
])
export const feeQuoteSchema = z.object({
  suggestedMinor: minor,
  currency: z.string(),
  /** The night price the suggestion started from (0 when no night is priced). */
  nightlyMinor: minor,
  mode: z.string()
})
export type FeeQuote = z.infer<typeof feeQuoteSchema>

export const lateCheckoutInputSchema = z
  .object({
    stayId: idSchema,
    time: clockTime,
    amountMinor: amountSchema.positive(),
    note: z.string().trim().max(200).optional(),
    /** G-72: the reason to write into a closed day (needs `ledger.locked`). */
    dayClosedReason: reasonText.optional()
  })
  .strict()

export const feeVoidSchema = z
  .object({ chargeId: idSchema, reason: reasonText, dayClosedReason: reasonText.optional() })
  .strict()

export const folioLineSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  /** `late_checkout`, `no_show_fee`, `damage_fee` or the extra service's code; null for a free line. */
  code: z.string().nullable(),
  kind: z.string(),
  description: z.string(),
  amountMinor: minor,
  currency: z.string(),
  voided: z.boolean()
})
export const depositViewSchema = z.object({
  id: idSchema,
  amountMinor: minor,
  currency: z.string(),
  methodId: idSchema,
  takenDate: localDateSchema,
  status: z.enum(['held', 'refunded', 'converted']),
  settledDate: localDateSchema.nullable(),
  settleNote: z.string().nullable(),
  note: z.string().nullable()
})
export const folioLinesSchema = z.object({
  charges: z.array(folioLineSchema),
  /** Null for a user who may not see payments. */
  deposits: z.array(depositViewSchema).nullable()
})
export type FolioLines = z.infer<typeof folioLinesSchema>
export type DepositView = z.infer<typeof depositViewSchema>

export const depositTakeSchema = z
  .object({
    reservationId: idSchema,
    amountMinor: amountSchema.positive(),
    methodId: idSchema,
    note: z.string().trim().max(200).optional(),
    dayClosedReason: reasonText.optional()
  })
  .strict()
export const depositSettleSchema = z
  .object({
    id: idSchema,
    action: z.enum(['refund', 'convert', 'undoConvert']),
    /** Required for `convert` (what was damaged) and `undoConvert` (why it is taken back). */
    reason: z.string().trim().max(200).optional(),
    dayClosedReason: reasonText.optional()
  })
  .strict()
  .refine((v) => v.action === 'refund' || (v.reason?.length ?? 0) >= 3, { path: ['reason'] })

// Night report: one A4 page for a day.
const guestLine = z.object({
  reservationId: idSchema,
  code: z.string(),
  guest: z.string(),
  room: z.string(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  balanceMinor: minor.nullable(),
  currency: z.string()
})
export const nightReportSchema = z.object({
  date: localDateSchema,
  hotelName: z.string(),
  arrivals: z.array(guestLine),
  departures: z.array(guestLine),
  staying: z.array(guestLine),
  noShows: z.array(guestLine),
  rooms: z.object({
    total: z.number().int(),
    occupied: z.number().int(),
    clean: z.number().int(),
    dirty: z.number().int(),
    inspected: z.number().int(),
    outOfService: z.number().int()
  }),
  /** Null without the right to see money. */
  cash: z
    .object({
      byCurrency: z.array(
        z.object({
          currency: z.string(),
          incomeMinor: minor,
          refundMinor: minor,
          expenseMinor: minor,
          depositHeldMinor: minor
        })
      )
    })
    .nullable()
})
export type NightReport = z.infer<typeof nightReportSchema>
