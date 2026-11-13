// Reservation, payment and occupant inputs (03-mimari.md §4.4, §6.1…§6.4, §6.15; G-35…G-46, G-53, G-54, G-61, G-64,
// G-68). Service-side validation; the same schemas serve the API in later phases.
import * as z from 'zod'
import { diffDays, type LocalDate } from '../date'
import { amountSchema, idSchema, localDateSchema } from './rooms'
import { currencyCode } from './settings'

const nightPriceSchema = z.object({ date: localDateSchema, priceMinor: amountSchema.nonnegative() })

/** Longest stay in one room (a long-stay guest beyond a year gets a new stay). */
export const MAX_STAY_NIGHTS = 400
// The field checks have run: invalid strings only make the result NaN, which fails the comparison below.
const nightsBetween = (checkIn: string, checkOut: string): number =>
  diffDays(checkIn as LocalDate, checkOut as LocalDate)
const stayLengthOk = (s: { checkIn: string; checkOut: string }): boolean =>
  nightsBetween(s.checkIn, s.checkOut) <= MAX_STAY_NIGHTS

export const stayInputSchema = z
  .object({
    roomId: idSchema,
    checkIn: localDateSchema,
    /** Equal to checkIn for a day-use. */
    checkOut: localDateSchema,
    /** One price copied to every night (G-36: editable night by night afterwards)… */
    nightlyPriceMinor: amountSchema.nonnegative().optional(),
    /** …or explicit prices per night. */
    prices: z.array(nightPriceSchema).max(400).optional()
  })
  .refine((s) => s.checkOut >= s.checkIn, { path: ['checkOut'], message: 'checkOut before checkIn' })
  .refine(stayLengthOk, { path: ['checkOut'], message: 'stay too long' })
  .refine((s) => s.nightlyPriceMinor !== undefined || (s.prices?.length ?? 0) > 0, {
    path: ['nightlyPriceMinor'],
    message: 'price required'
  })

export const newGuestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  phone: z.string().trim().max(40).nullish(),
  email: z.email().max(120).nullish()
})

export const reservationCreateSchema = z.object({
  guest: z.union([z.object({ id: idSchema }), newGuestSchema]),
  channelId: idSchema,
  channelRef: z.string().max(80).nullish(),
  status: z.enum(['tentative', 'confirmed']).default('confirmed'),
  stays: z.array(stayInputSchema).min(1).max(30),
  /** Folio currency (default: hotel base currency). */
  currency: currencyCode.optional(),
  adults: z.number().int().min(0).max(50).nullish(),
  children: z.number().int().min(0).max(50).nullish(),
  notes: z.string().max(2000).nullish(),
  tagIds: z.array(idSchema).max(20).optional(),
  soldByUserId: idSchema.nullish(),
  /** Write into a blocked range anyway ("yine de", §6.1): needs rooms.block edit and a reason. */
  overrideBlockReason: z.string().trim().min(3).max(200).optional()
})
export type ReservationCreateInput = z.input<typeof reservationCreateSchema>

export const changeDatesSchema = z
  .object({
    checkIn: localDateSchema,
    checkOut: localDateSchema,
    /** Price for added nights (default: the stay's last night price). */
    nightlyPriceMinor: amountSchema.nonnegative().optional(),
    overrideBlockReason: z.string().trim().min(3).max(200).optional()
  })
  .refine((s) => s.checkOut >= s.checkIn, { path: ['checkOut'], message: 'checkOut before checkIn' })
  .refine(stayLengthOk, { path: ['checkOut'], message: 'stay too long' })
export type ChangeDatesInput = z.input<typeof changeDatesSchema>

/**
 * Move a stay to other dates keeping its length (drag-and-drop on the calendar, faz-15 madde 12): every night goes
 * with its own price, so the total stays the same.
 */
export const moveDatesSchema = z
  .object({
    checkIn: localDateSchema,
    overrideBlockReason: z.string().trim().min(3).max(200).optional()
  })
  .strict()
export type MoveDatesInput = z.input<typeof moveDatesSchema>

export const nightPricesSchema = z.array(nightPriceSchema).min(1).max(400)

/** Status a reservation can be switched between by hand (opsiyon ↔ kesin). */
export const reservationStatusSchema = z.enum(['tentative', 'confirmed'])

/** The tape chart's window: [from, to), at most a little over a year (Faz 5 reads it page by page). */
export const dateRangeSchema = z
  .object({ from: localDateSchema, to: localDateSchema })
  .refine((r) => r.to > r.from, { path: ['to'], message: 'to before from' })
  .refine((r) => nightsBetween(r.from, r.to) <= MAX_STAY_NIGHTS, { path: ['to'], message: 'range too long' })

/** A parked reservation comes back with new stays (§6.1). */
export const unparkSchema = z.object({
  stays: z.array(stayInputSchema).min(1).max(30),
  overrideBlockReason: z.string().trim().min(3).max(200).optional()
})

export const changeRoomSchema = z.object({
  newRoomId: idSchema,
  /** First night in the new room (default: the stay's check-in = whole stay). */
  fromDate: localDateSchema.optional(),
  overrideBlockReason: z.string().trim().min(3).max(200).optional()
})
export type ChangeRoomInput = z.input<typeof changeRoomSchema>

/** Why a reservation or one of its rooms is cancelled (kept with it, G-24). */
export const cancelReasonSchema = z.string().trim().min(3).max(200)

/**
 * What happens to the money when a reservation is cancelled (K-55): give it back now (a refund row on the folio
 * in the same step; needs `payments.refund`) or keep it with a reason (cancellation fee). "Refund pending" is a
 * park (`booking.park`), not a cancellation.
 */
export const cancelRefundSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('refund'),
    methodId: idSchema,
    amountMinor: amountSchema.positive(),
    /** Default: the folio currency. */
    currency: currencyCode.optional(),
    note: z.string().max(500).nullish(),
    dayClosedReason: z.string().trim().min(3).max(200).optional()
  }),
  z.object({ mode: z.literal('keep'), note: z.string().trim().min(3).max(200) })
])
export type CancelRefundInput = z.input<typeof cancelRefundSchema>

export const parkSchema = z.object({
  reason: z.enum(['no_show_paid', 'refund_pending', 'postponed', 'other']),
  note: z.string().max(500).nullish()
})

/**
 * What follows a taken-back check-in in the same transaction (K-55, G-193): cancel the reservation with the money
 * settled, park it (e.g. "refund pending"), or give up only this room of a reservation with more rooms.
 */
export const undoThenSchema = z.discriminatedUnion('do', [
  z.object({ do: z.literal('cancel'), refund: cancelRefundSchema.optional() }),
  z.object({ do: z.literal('park'), park: parkSchema }),
  z.object({ do: z.literal('cancelStay') })
])
export type UndoThenInput = z.input<typeof undoThenSchema>

export const paymentCreateSchema = z
  .object({
    reservationId: idSchema.optional(),
    folioId: idSchema.optional(),
    /** Business day the money was taken. */
    date: localDateSchema,
    kind: z.enum(['payment', 'deposit', 'refund']).default('payment'),
    methodId: idSchema,
    channelId: idSchema.nullish(),
    amountMinor: amountSchema.positive(),
    currency: currencyCode,
    /**
     * K-43 typed rate, used only when no rate is known: base-currency units for 1 unit of the payment currency
     * × 1 000 000 ("1 USD = 34 TL" → 34 000 000).
     */
    manualRateMicro: z.number().int().positive().safe().optional(),
    /** Same for 1 unit of the folio currency, when the folio is in neither the base nor the payment currency. */
    manualFolioRateMicro: z.number().int().positive().safe().optional(),
    reference: z.string().max(120).nullish(),
    note: z.string().max(500).nullish(),
    soldByUserId: idSchema.nullish(),
    dayClosedReason: z.string().trim().min(3).max(200).optional()
  })
  .refine((p) => !!p.reservationId !== !!p.folioId, {
    path: ['reservationId'],
    message: 'reservationId xor folioId'
  })
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>

export const paymentUpdateSchema = z.object({
  date: localDateSchema.optional(),
  methodId: idSchema.optional(),
  channelId: idSchema.nullish(),
  amountMinor: amountSchema.positive().optional(),
  currency: currencyCode.optional(),
  /** K-43 typed rates (see paymentCreateSchema); also applied to a row saved without a known rate. */
  manualRateMicro: z.number().int().positive().safe().optional(),
  manualFolioRateMicro: z.number().int().positive().safe().optional(),
  reference: z.string().max(120).nullish(),
  note: z.string().max(500).nullish(),
  dayClosedReason: z.string().trim().min(3).max(200).optional()
})
export type PaymentUpdateInput = z.input<typeof paymentUpdateSchema>

export const handoverSchema = z.object({
  /** Explicit rows, or everything uncollected up to a day (optionally cash only). */
  paymentIds: z.array(idSchema).max(5000).optional(),
  upToDate: localDateSchema.optional(),
  onlyCash: z.boolean().default(false),
  note: z.string().max(500).nullish()
})
export type HandoverInput = z.input<typeof handoverSchema>

export const extraSaleSchema = z.object({
  extraServiceId: idSchema,
  date: localDateSchema,
  qty: z.number().int().min(1).max(1000).default(1),
  unitMinor: amountSchema.nonnegative(),
  currency: currencyCode,
  description: z.string().trim().max(200).optional(),
  /** On a guest's folio, or a stand-alone sale (luggage storage, "1 bag"). */
  reservationId: idSchema.optional(),
  payment: z
    .object({ methodId: idSchema, channelId: idSchema.nullish(), reference: z.string().max(120).nullish() })
    .optional(),
  /** K-43: base units for 1 unit of `currency` × 1 000 000, used only when no rate is known (offline). */
  manualRateMicro: z.number().int().positive().safe().optional(),
  /** Writing into a closed day (G-72): `ledger.locked` + this reason. */
  dayClosedReason: z.string().trim().min(3).max(200).optional()
})
export type ExtraSaleInput = z.input<typeof extraSaleSchema>

export const occupantInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  guestId: idSchema.nullish(),
  /** "kızıl saçlı" — staff only (§4.9-13). */
  descriptorNote: z.string().trim().max(200).nullish(),
  /** ISO instant; default now when the stay is already in the house. */
  arrivedAt: z.iso.datetime().nullish()
})
export type OccupantInput = z.input<typeof occupantInputSchema>
