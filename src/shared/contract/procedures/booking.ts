// Faz 5 (P5b): the reservation panel — create and edit, night prices, rooms, people and KBS marks, quick payments,
// park / restore, guest history and blacklist warnings. Writes answer with the panel's view of the reservation, so
// the panel and the tape chart (its `reservations.*` reads are refetched after every write) never disagree.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/booking.ts.
import * as z from 'zod'
import { byId, empty, proc, type Procedure } from '../proc'
import { amountSchema, idSchema, localDateSchema } from '../rooms'
import {
  addRoomSchema,
  availabilitySchema,
  availabilityInputSchema,
  blacklistHitSchema,
  bookingCreateSchema,
  bookingNoteTextSchema,
  bookingOptionsSchema,
  bookingViewSchema,
  guestCandidateInputSchema,
  guestHitSchema,
  guestSummarySchema,
  hourlyCheckInputSchema,
  hourlyCheckSchema,
  hourlyStaySchema,
  kbsMarkSchema,
  occupantAddSchema,
  parkedViewSchema,
  priceSuggestionInputSchema,
  priceSuggestionSchema,
  reservationUpdateSchema
} from '../booking'
import {
  groupCancelSchema,
  groupCreateSchema,
  groupNoteSchema,
  groupStaysSchema,
  groupViewSchema
} from '../groups'
import {
  cancelRefundSchema,
  undoThenSchema,
  changeDatesSchema,
  changeRoomSchema,
  moveDatesSchema,
  occupantInputSchema,
  parkSchema,
  paymentCreateSchema,
  stayInputSchema
} from '../reservations'

const okSchema = z.object({ ok: z.literal(true) })
const stayId = z.object({ stayId: idSchema }).strict()
const reason = z.string().trim().min(3).max(200)

export const bookingProcedures = {
  'booking.options': proc(empty, bookingOptionsSchema),
  'booking.get': proc(byId, bookingViewSchema),
  'booking.availability': proc(availabilityInputSchema, availabilitySchema),
  'booking.suggestPrices': proc(priceSuggestionInputSchema, priceSuggestionSchema),
  'booking.searchGuests': proc(
    z
      .object({
        q: z
          .string()
          .trim()
          .min(1)
          .transform((q) => q.slice(0, 80).trim()),
        limit: z.number().int().min(1).max(30).optional()
      })
      .strict(),
    z.array(guestHitSchema)
  ),
  'booking.guestSummary': proc(
    // The panel leaves out the reservation it shows (its own stay is not the guest's "last stay").
    z.object({ guestId: idSchema, excludeReservationId: idSchema.optional() }).strict(),
    guestSummarySchema
  ),
  'booking.checkBlacklist': proc(guestCandidateInputSchema, z.array(blacklistHitSchema)),

  'booking.create': proc(bookingCreateSchema, bookingViewSchema),
  /** An hourly stay sale (K-48): room, day, hours and the amount typed at the desk. */
  'booking.createHourlyStay': proc(hourlyStaySchema, bookingViewSchema),
  'booking.hourlyCheck': proc(hourlyCheckInputSchema, hourlyCheckSchema),
  'booking.update': proc(
    z.object({ id: idSchema, patch: reservationUpdateSchema }).strict(),
    bookingViewSchema
  ),
  'booking.addRoom': proc(addRoomSchema, bookingViewSchema),
  'booking.changeDates': proc(
    z.object({ stayId: idSchema, dates: changeDatesSchema }).strict(),
    bookingViewSchema
  ),
  /** Drag-and-drop to other dates: same length, every night with its own price (the total stays the same). */
  'booking.moveDates': proc(
    z.object({ stayId: idSchema, move: moveDatesSchema }).strict(),
    bookingViewSchema
  ),
  'booking.changeRoom': proc(
    z.object({ stayId: idSchema, change: changeRoomSchema }).strict(),
    bookingViewSchema
  ),
  'booking.setNightPrices': proc(
    z
      .object({
        stayId: idSchema,
        prices: z
          .array(z.object({ date: localDateSchema, priceMinor: amountSchema.nonnegative() }))
          .min(1)
          .max(400)
      })
      .strict(),
    bookingViewSchema
  ),
  'booking.checkIn': proc(stayId, bookingViewSchema),
  'booking.checkOut': proc(
    z
      .object({
        stayId: idSchema,
        kbsCheckoutIds: z.array(idSchema).max(50).default([]),
        /** Leaving on the check-in day (K-44): the day-use price instead of the first night's. */
        dayUsePriceMinor: amountSchema.nonnegative().optional(),
        /** 0 only with this (H-06): the desk said the same-day stay is free. */
        dayUseFreeConfirmed: z.boolean().optional()
      })
      .strict(),
    bookingViewSchema
  ),
  /** Cancel; `refund` settles the money in the same step (K-55): a refund row or "keep the payments" with a note. */
  'booking.cancel': proc(
    z.object({ id: idSchema, reason, refund: cancelRefundSchema.optional() }).strict(),
    bookingViewSchema
  ),
  /**
   * Take a check-in back (K-55): only on the check-in day; the stay is planned again. A person already reported to
   * KBS needs `kbsConfirmed` (the report itself stays; the KBS check-out is made there). `then` gives up in the same
   * transaction: cancel (with the money settled), park, or only this room; if it fails the take-back is not written.
   */
  'booking.undoCheckIn': proc(
    z
      .object({
        stayId: idSchema,
        reason,
        kbsConfirmed: z.boolean().optional(),
        then: undoThenSchema.optional()
      })
      .strict(),
    bookingViewSchema
  ),
  /** One room of the reservation that is still to come (G-35, G-42). */
  'booking.cancelStay': proc(z.object({ stayId: idSchema, reason }).strict(), bookingViewSchema),
  /** "Gelmedi" (G-42): the nights are freed, payments stay; also from the park area. */
  'booking.noShow': proc(z.object({ id: idSchema }).strict(), bookingViewSchema),
  'booking.park': proc(z.object({ id: idSchema, park: parkSchema }).strict(), bookingViewSchema),
  'booking.unpark': proc(
    z
      .object({
        id: idSchema,
        stays: z.array(stayInputSchema).min(1).max(30),
        overrideBlockReason: reason.optional()
      })
      .strict(),
    bookingViewSchema
  ),
  'booking.listParked': proc(empty, z.array(parkedViewSchema)),
  // On a reservation's folio only (stand-alone sales are the ledger's, Faz 7).
  'booking.addPayment': proc(
    paymentCreateSchema.refine((p) => !!p.reservationId, { path: ['reservationId'], message: 'required' }),
    bookingViewSchema
  ),
  'booking.addNote': proc(
    z.object({ reservationId: idSchema, text: bookingNoteTextSchema }).strict(),
    bookingViewSchema
  ),
  'booking.addOccupant': proc(occupantAddSchema, okSchema),
  'booking.updateOccupant': proc(
    z.object({ id: idSchema, patch: occupantInputSchema.partial() }).strict(),
    okSchema
  ),
  'booking.markKbs': proc(kbsMarkSchema, okSchema),

  // Group reservations (G-194, P17b): each room is its own reservation, linked by the group.
  'booking.group': proc(byId, groupViewSchema),
  'booking.createGroup': proc(groupCreateSchema, groupViewSchema),
  /** Every named room or none: one transaction. */
  'booking.checkInMany': proc(groupStaysSchema, groupViewSchema),
  'booking.checkOutMany': proc(groupStaysSchema, groupViewSchema),
  'booking.addGroupNote': proc(groupNoteSchema, groupViewSchema),
  'booking.cancelGroup': proc(groupCancelSchema, groupViewSchema)
} as const satisfies Record<string, Procedure>
