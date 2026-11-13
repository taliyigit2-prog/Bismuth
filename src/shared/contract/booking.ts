// Reservation panel inputs and views (faz-05 madde 2, 3, 4, 7b; G-34…G-48, G-53, G-54, G-180, G-190, G-192).
// The procedures are in ./procedures/booking.ts; the service validates the same inputs (G-23: rules there).
import * as z from 'zod'
import { isValidHourRange } from '../domain/stays'
import { amountSchema, localDateSchema, idSchema, minorSchema } from './rooms'
import { occupantInputSchema, reservationCreateSchema, stayInputSchema } from './reservations'

const i18n = z.object({ tr: z.string(), en: z.string(), ru: z.string() }).partial().nullable()
const iso = z.string()

/** New reservation; `blacklistConfirmed` = the user saw the blacklist warning and goes on (G-45). */
export const bookingCreateSchema = reservationCreateSchema.extend({
  blacklistConfirmed: z.boolean().optional()
})
export type BookingCreateInput = z.input<typeof bookingCreateSchema>

/**
 * An hourly stay sale (K-48): one room, one day, a start and an end time and the amount the desk types (required;
 * the room type's hour price is only a suggestion). Becomes a reservation with one day-use stay carrying the hours.
 */
export const hourlyStaySchema = z
  .object({
    guest: reservationCreateSchema.shape.guest,
    channelId: idSchema,
    channelRef: z.string().max(80).nullish(),
    status: z.enum(['tentative', 'confirmed']).default('confirmed'),
    roomId: idSchema,
    date: localDateSchema,
    startTime: z.string(),
    endTime: z.string(),
    priceMinor: amountSchema.positive(),
    currency: reservationCreateSchema.shape.currency,
    adults: z.number().int().min(0).max(50).nullish(),
    notes: z.string().max(2000).nullish(),
    soldByUserId: idSchema.nullish(),
    overrideBlockReason: z.string().trim().min(3).max(200).optional(),
    blacklistConfirmed: z.boolean().optional()
  })
  .strict()
  .refine((s) => isValidHourRange(s.startTime, s.endTime), {
    path: ['endTime'],
    message: 'end must be after start'
  })
export type HourlyStayInput = z.input<typeof hourlyStaySchema>

/** Whether an hour range fits a room's day: clashes, cleaning-gap warnings, the suggested price. */
export const hourlyCheckInputSchema = z
  .object({
    roomId: idSchema,
    date: localDateSchema,
    startTime: z.string(),
    endTime: z.string(),
    excludeReservationId: idSchema.optional()
  })
  .strict()
  .refine((s) => isValidHourRange(s.startTime, s.endTime), {
    path: ['endTime'],
    message: 'end must be after start'
  })

export const hourlyCheckSchema = z.object({
  /** Another stay holds the hours (or the night through the day): the sale is refused. */
  taken: z.boolean(),
  /** Hours of the clashing day ranges, 'HH:MM–HH:MM'; empty when it is a whole day or a night. */
  hours: z.array(z.string()),
  blocked: z.boolean(),
  /** Day ranges that leave less than the cleaning time before or after (a warning, never a block, S-103). */
  warnings: z.array(
    z.object({ startTime: z.string(), endTime: z.string(), gapMinutes: z.number().int().min(0) })
  ),
  turnoverMinutes: z.number().int().min(0),
  /** The room type's hour price × the hours; null when the type has none. */
  suggestedMinor: minorSchema.nullable(),
  currency: z.string()
})
export type HourlyCheck = z.output<typeof hourlyCheckSchema>
export type HourlyCheckInput = z.input<typeof hourlyCheckInputSchema>

/** One line of the reservation's note log. */
export const bookingNoteTextSchema = z.string().trim().min(1).max(2000)

/** The panel's own fields of a reservation (dates, rooms and prices have their own calls). */
export const reservationUpdateSchema = z
  .object({
    channelId: idSchema.optional(),
    channelRef: z.string().trim().max(80).nullish(),
    notes: z.string().max(2000).nullish(),
    adults: z.number().int().min(0).max(50).nullish(),
    children: z.number().int().min(0).max(50).nullish(),
    status: z.enum(['tentative', 'confirmed']).optional(),
    tagIds: z
      .array(idSchema)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, 'tag ids must be unique')
      .optional()
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'empty patch')
export type ReservationUpdateInput = z.input<typeof reservationUpdateSchema>

export const guestCandidateInputSchema = z
  .object({
    name: z.string().trim().max(160),
    phone: z.string().trim().max(40).nullish(),
    guestId: idSchema.optional()
  })
  .strict()

export const priceSuggestionInputSchema = z
  .object({ roomId: idSchema, checkIn: localDateSchema, checkOut: localDateSchema })
  .strict()
  .refine((s) => s.checkOut >= s.checkIn, { path: ['checkOut'], message: 'checkOut before checkIn' })

export const availabilityInputSchema = z
  .object({ from: localDateSchema, to: localDateSchema, excludeReservationId: idSchema.optional() })
  .strict()
  .refine((s) => s.to >= s.from, { path: ['to'], message: 'to before from' })

export const addRoomSchema = z
  .object({
    reservationId: idSchema,
    stay: stayInputSchema,
    /** Into a blocked range or a room not for sale anyway (§6.1 "yine de"): rooms.block edit and a reason. */
    overrideBlockReason: z.string().trim().min(3).max(200).optional()
  })
  .strict()

export const kbsMarkSchema = z
  .object({ occupantId: idSchema, mark: z.enum(['reported', 'checkout', 'clearReported', 'left']) })
  .strict()

export const occupantAddSchema = z
  .object({
    stayId: idSchema,
    occupant: occupantInputSchema,
    /** Reported to KBS at the desk already (G-53): marked in the same step. */
    kbsReported: z.boolean().optional(),
    /** The user saw the blacklist warning for this person and goes on (G-45, §6.9). */
    blacklistConfirmed: z.boolean().optional()
  })
  .strict()

// ---- views ----

const cellPaint = z
  .union([
    z.object({ kind: z.literal('auto'), code: z.string() }),
    z.object({ kind: z.literal('custom'), tagId: z.string() })
  ])
  .nullable()

export const openIssueSchema = z.object({
  id: idSchema,
  roomId: z.string(),
  title: z.string(),
  severity: z.enum(['low', 'medium', 'urgent']),
  status: z.enum(['open', 'planned']),
  blocksRoom: z.boolean()
})

export const occupantViewSchema = z.object({
  id: idSchema,
  guestId: z.string().nullable(),
  fullName: z.string(),
  isPrimary: z.boolean(),
  descriptorNote: z.string().nullable(),
  arrivedAt: iso.nullable(),
  leftAt: iso.nullable(),
  kbsReportedAt: iso.nullable(),
  kbsCheckoutAt: iso.nullable()
})

const nightSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  slot: z.enum(['night', 'day']),
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  priceMinor: minorSchema,
  currency: z.string(),
  payStatus: z.enum(['paid', 'partial', 'unpaid']),
  allocatedMinor: minorSchema,
  style: z.object({
    auto: z.string().nullable(),
    fill: cellPaint,
    border: cellPaint,
    depositIcon: z.boolean()
  })
})

const stayViewSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  roomNumber: z.string(),
  roomTypeName: z.string(),
  roomTypeNameI18n: i18n,
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  status: z.enum(['planned', 'in_house', 'done', 'cancelled']),
  checkedInAt: iso.nullable(),
  checkedOutAt: iso.nullable(),
  dayUse: z.boolean(),
  /** Hours of an hourly stay ('HH:MM', K-48); null/absent = no hours. */
  startTime: z.string().nullish(),
  endTime: z.string().nullish(),
  /** What leaving today makes of the stay's first night (K-44): hours and suggested price; null = n/a (H-06). */
  sameDay: z
    .object({
      startTime: z.string().nullable(),
      endTime: z.string().nullable(),
      suggestedMinor: minorSchema.nullable()
    })
    .nullish(),
  nights: z.array(nightSchema),
  occupants: z.array(occupantViewSchema),
  kbsIssues: z.array(
    z.object({
      occupantId: z.string().nullable(),
      fullName: z.string().nullable(),
      kind: z.enum(['checkin', 'checkout', 'unnamed'])
    })
  ),
  openIssues: z.array(openIssueSchema)
})

const standingNoteSchema = z
  .object({ text: z.string(), level: z.enum(['info', 'warn']), requiresConfirm: z.boolean() })
  .nullable()

export const bookingViewSchema = z.object({
  reservation: z.object({
    id: idSchema,
    code: z.string(),
    status: z.enum(['tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'parked']),
    kind: z.enum(['overnight', 'day_use']),
    channelId: idSchema,
    channelRef: z.string().nullable(),
    adults: z.number().int().nullable(),
    children: z.number().int().nullable(),
    notes: z.string().nullable(),
    parkedReason: z.enum(['no_show_paid', 'refund_pending', 'postponed', 'other']).nullable(),
    parkedNote: z.string().nullable(),
    cancelReason: z.string().nullable(),
    createdAt: iso
  }),
  guest: z.object({
    id: idSchema,
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    nationality: z.string().nullable(),
    vip: z.boolean()
  }),
  standingNote: standingNoteSchema,
  stays: z.array(stayViewSchema),
  /** Credits and balance are null for a user who may not see payments. */
  folio: z.object({
    id: idSchema,
    currency: z.string(),
    chargesMinor: minorSchema,
    creditedMinor: minorSchema.nullable(),
    balanceMinor: minorSchema.nullable()
  }),
  payments: z
    .array(
      z.object({
        id: idSchema,
        date: localDateSchema,
        kind: z.enum(['payment', 'deposit', 'refund']),
        methodId: idSchema,
        channelId: z.string().nullable(),
        amountMinor: minorSchema,
        currency: z.string(),
        amountFolioMinor: minorSchema,
        /**
         * The market rate frozen with the payment (S-32) was already old when it was written (no internet then):
         * the panel shows a small "eski kur" badge with the rate's time.
         */
        rateStale: z.boolean(),
        rateObservedAt: z.string().nullable(),
        voided: z.boolean(),
        collected: z.boolean(),
        reference: z.string().nullable(),
        note: z.string().nullable(),
        createdAt: iso
      })
    )
    .nullable(),
  occupantsVisible: z.boolean(),
  tagIds: z.array(z.string()),
  notes: z.array(
    z.object({
      id: idSchema,
      text: z.string(),
      date: z.string().nullable(),
      createdAt: iso,
      createdBy: z.string().nullable()
    })
  )
})
export type BookingViewDto = z.output<typeof bookingViewSchema>

export const bookingOptionsSchema = z.object({
  today: localDateSchema,
  baseCurrency: z.string(),
  currencies: z.array(z.string()),
  highlightWeekdays: z.array(z.number().int()),
  /** Nights that take the weekend price (`pricing.weekendNights`, K-44). */
  weekendNights: z.array(z.number().int()),
  rooms: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      floor: z.string().nullable(),
      roomTypeId: idSchema,
      typeName: z.string(),
      typeNameI18n: i18n,
      beds: z.number().int(),
      sellable: z.boolean(),
      hkStatus: z.string(),
      basePriceMinor: minorSchema.nullable(),
      weekendPriceMinor: minorSchema.nullable(),
      hourlyPriceMinor: minorSchema.nullish(),
      priceCurrency: z.string().nullable(),
      openIssues: z.array(openIssueSchema)
    })
  ),
  channels: z.array(z.object({ id: idSchema, code: z.string(), name: z.string(), nameI18n: i18n })),
  methods: z.array(
    z.object({ id: idSchema, code: z.string(), name: z.string(), nameI18n: i18n, isCash: z.boolean() })
  )
})
export type BookingOptionsDto = z.output<typeof bookingOptionsSchema>

export const guestHitSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  nationality: z.string().nullable(),
  vip: z.boolean(),
  stays: z.number().int()
})

const moneyMap = z.record(z.string(), minorSchema)

export const guestSummarySchema = z.object({
  guestId: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  vip: z.boolean(),
  standingNote: standingNoteSchema,
  lastStayDate: localDateSchema.nullable(),
  lastNightly: z.object({ amountMinor: minorSchema, currency: z.string() }).nullable(),
  averageNightly: moneyMap,
  totalSpent: moneyMap,
  totalNights: z.number().int(),
  stayCount: z.number().int(),
  /** Guest tags (G-50), shown in the reservation panel (read only). */
  tagIds: z.array(idSchema),
  recent: z.array(
    z.object({
      reservationId: idSchema,
      roomNumber: z.string(),
      checkIn: localDateSchema,
      checkOut: localDateSchema,
      status: z.string(),
      paidMinor: minorSchema,
      currency: z.string(),
      nightlyMinor: minorSchema.nullable()
    })
  )
})
export type GuestSummaryDto = z.output<typeof guestSummarySchema>

export const blacklistHitSchema = z.object({
  entryId: idSchema,
  name: z.string(),
  severity: z.enum(['warn', 'block']),
  reasons: z.array(z.enum(['guest', 'name', 'id', 'phone'])),
  reasonText: z.string().nullable()
})
export type BlacklistHitDto = z.output<typeof blacklistHitSchema>

export const priceSuggestionSchema = z
  .object({
    currency: z.string(),
    nights: z.array(
      z.object({
        date: localDateSchema,
        priceMinor: minorSchema,
        reason: z.enum(['base', 'weekend', 'special'])
      })
    )
  })
  .nullable()

export const availabilitySchema = z.object({
  occupied: z.array(idSchema),
  blocked: z.array(idSchema),
  /** Rooms the hotel does not sell (they take a stay only with a reason, like a block). */
  notForSale: z.array(idSchema)
})

export const parkedViewSchema = z.object({
  id: idSchema,
  code: z.string(),
  guestName: z.string(),
  parkedReason: z.enum(['no_show_paid', 'refund_pending', 'postponed', 'other']).nullable(),
  parkedNote: z.string().nullable(),
  currency: z.string(),
  creditedMinor: minorSchema,
  stays: z.array(
    z.object({
      roomId: idSchema,
      roomNumber: z.string(),
      checkIn: localDateSchema,
      checkOut: localDateSchema
    })
  ),
  lastNightlyMinor: minorSchema.nullable(),
  parkedAt: iso
})
export type ParkedViewDto = z.output<typeof parkedViewSchema>
