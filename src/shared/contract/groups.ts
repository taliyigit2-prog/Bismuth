// Group reservations (P17b, G-194, S-101, S-106): several rooms booked together under one group, each room its own
// reservation with its own guest name. The group links them; check-in/out and notes act on the whole group in one
// transaction. Procedures: ./procedures/booking.ts; service: reservations-service.ts.
import * as z from 'zod'
import { amountSchema, idSchema, localDateSchema, minorSchema } from './rooms'
import { currencyCode } from './settings'
import { newGuestSchema, reservationCreateSchema, stayInputSchema } from './reservations'
import { bookingNoteTextSchema } from './booking'

/** At most as many rooms as one reservation may hold. */
export const MAX_GROUP_ROOMS = 30

export const folioModeSchema = z.enum(['single', 'per_room'])
export type FolioMode = z.output<typeof folioModeSchema>

/** One room of a group: its stay and the name of the guest in it (none = the group leader). */
export const groupRoomInputSchema = z.object({
  stay: stayInputSchema,
  guest: z.union([z.object({ id: idSchema }), newGuestSchema]).optional(),
  adults: z.number().int().min(0).max(50).nullish()
})

export const groupCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** The guest who books and pays for the group (G-194); also the default guest of a room without a name. */
  leader: reservationCreateSchema.shape.guest,
  channelId: idSchema,
  channelRef: z.string().max(80).nullish(),
  status: z.enum(['tentative', 'confirmed']).default('confirmed'),
  rooms: z.array(groupRoomInputSchema).min(2).max(MAX_GROUP_ROOMS),
  currency: reservationCreateSchema.shape.currency,
  notes: z.string().max(2000).nullish(),
  tagIds: z.array(idSchema).max(20).optional(),
  soldByUserId: idSchema.nullish(),
  overrideBlockReason: z.string().trim().min(3).max(200).optional(),
  blacklistConfirmed: z.boolean().optional()
})
export type GroupCreateInput = z.input<typeof groupCreateSchema>

/** Check in / out some rooms of a group: all of them are done or none (one transaction). */
export const groupStaysSchema = z
  .object({ groupId: idSchema, stayIds: z.array(idSchema).min(1).max(MAX_GROUP_ROOMS) })
  .strict()
export type GroupStaysInput = z.input<typeof groupStaysSchema>

export const groupNoteSchema = z.object({ groupId: idSchema, text: bookingNoteTextSchema }).strict()
export type GroupNoteInput = z.input<typeof groupNoteSchema>

export const groupCancelSchema = z
  .object({ groupId: idSchema, reason: z.string().trim().min(3).max(200) })
  .strict()
export type GroupCancelInput = z.input<typeof groupCancelSchema>

/**
 * One payment on a group's single account (S-106): the amount is spread over the rooms' open balances, in booking
 * order, in one transaction. The currency is the one every room's folio is in.
 */
export const groupPaySchema = z
  .object({
    groupId: idSchema,
    date: localDateSchema,
    methodId: idSchema,
    amountMinor: amountSchema.positive(),
    currency: currencyCode,
    reference: z.string().max(120).nullish(),
    note: z.string().max(500).nullish(),
    dayClosedReason: z.string().trim().min(3).max(200).optional()
  })
  .strict()
export type GroupPayInput = z.input<typeof groupPaySchema>

/**
 * Link reservations that already exist to a group (G-194): an existing one (`groupId`) or a new one named here
 * (`name`; the first reservation's guest leads it). A reservation already in a group is not moved.
 */
export const groupAttachSchema = z
  .object({
    groupId: idSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    reservationIds: z.array(idSchema).min(1).max(MAX_GROUP_ROOMS)
  })
  .strict()
  .refine((g) => !!g.groupId !== !!g.name, { path: ['groupId'], message: 'groupId xor name' })
export type GroupAttachInput = z.input<typeof groupAttachSchema>

const reservationStatus = z.enum([
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
  'parked'
])

export const groupViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  folioMode: folioModeSchema,
  /** Set once the whole group is cancelled (voided_at; nothing is deleted). */
  voided: z.boolean(),
  leader: z.object({ id: idSchema, name: z.string() }).nullable(),
  /** One row per room (= per reservation of the group), in booking order. */
  rooms: z.array(
    z.object({
      reservationId: idSchema,
      code: z.string(),
      status: reservationStatus,
      guestId: idSchema,
      guestName: z.string(),
      stays: z.array(
        z.object({
          stayId: idSchema,
          roomId: idSchema,
          roomNumber: z.string(),
          checkIn: localDateSchema,
          checkOut: localDateSchema,
          status: z.enum(['planned', 'in_house', 'done', 'cancelled'])
        })
      ),
      currency: z.string(),
      chargesMinor: minorSchema,
      /** Null for a user who may not see payments. */
      balanceMinor: minorSchema.nullable()
    })
  ),
  /** Sum over the group's rooms in one currency; null when the folios use different currencies. */
  totals: z
    .object({
      currency: z.string(),
      chargesMinor: minorSchema,
      /** Cancelled / no-show rooms are left out. */
      balanceMinor: minorSchema.nullable(),
      /** What one group payment may cover (Σ open balances of payable rooms); null without payment rights. */
      payableMinor: minorSchema.nullable()
    })
    .nullable(),
  notes: z.array(z.object({ id: idSchema, reservationId: idSchema, text: z.string(), createdAt: z.string() }))
})
export type GroupViewDto = z.output<typeof groupViewSchema>
