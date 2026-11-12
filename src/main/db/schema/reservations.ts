import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, minor, timestamps } from './columns'
import { guests } from './guests'
import { rooms } from './rooms'

// Reservations, nights, occupants, folios, charges and payments (03-mimari.md §4.4; G-35…G-43, G-53, G-54,
// G-61, G-70, K-09, K-33). Reservation = folio; balance = Σ charges − Σ credits; night colour = allocation.

export const salesChannels = sqliteTable(
  'sales_channels',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameI18n: i18nJson('name_i18n_json'),
    kind: text('kind', { enum: ['direct', 'ota', 'agency', 'platform_service', 'custom'] }).notNull(),
    defaultCollectedBy: text('default_collected_by', { enum: ['hotel', 'channel'] })
      .notNull()
      .default('hotel'),
    /** Commission in basis points (15 % = 1500). */
    commissionBp: integer('commission_bp'),
    active: bool('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    ...timestamps
  },
  (t) => [uniqueIndex('sales_channels_code_unique').on(t.code)]
)

export const paymentMethods = sqliteTable(
  'payment_methods',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameI18n: i18nJson('name_i18n_json'),
    group: text('group', {
      enum: ['cash', 'bank', 'card', 'online', 'platform', 'account', 'other']
    }).notNull(),
    isCash: bool('is_cash').notNull().default(false),
    active: bool('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    ...timestamps
  },
  (t) => [uniqueIndex('payment_methods_code_unique').on(t.code)]
)

export const extraServices = sqliteTable(
  'extra_services',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameI18n: i18nJson('name_i18n_json'),
    defaultPriceMinor: minor('default_price_minor'),
    defaultCurrency: text('default_currency'),
    unit: text('unit', {
      enum: ['per_booking', 'per_night', 'per_person', 'per_item', 'per_bag_day']
    }).notNull(),
    active: bool('active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    ...timestamps
  },
  (t) => [uniqueIndex('extra_services_code_unique').on(t.code)]
)

export const RESERVATION_STATUSES = [
  'tentative',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show',
  'parked'
] as const

export const reservations = sqliteTable(
  'reservations',
  {
    id: id(),
    code: text('code').notNull(),
    primaryGuestId: text('primary_guest_id')
      .notNull()
      .references(() => guests.id),
    channelId: text('channel_id')
      .notNull()
      .references(() => salesChannels.id),
    channelRef: text('channel_ref'),
    status: text('status', { enum: RESERVATION_STATUSES }).notNull(),
    kind: text('kind', { enum: ['overnight', 'day_use'] }).notNull(),
    parkedReason: text('parked_reason', { enum: ['no_show_paid', 'refund_pending', 'postponed', 'other'] }),
    parkedNote: text('parked_note'),
    /** The status a parked reservation had (tentative / confirmed): taking it back onto the calendar restores it. */
    parkedFromStatus: text('parked_from_status', { enum: RESERVATION_STATUSES }),
    /** Only when no occupant list is kept (S-22); otherwise derived from stay_occupants. */
    adults: integer('adults'),
    children: integer('children'),
    notes: text('notes'),
    createdBy: text('created_by'),
    cancelledAt: text('cancelled_at'),
    cancelReason: text('cancel_reason'),
    soldByUserId: text('sold_by_user_id'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('reservations_code_unique').on(t.code),
    index('reservations_guest_idx').on(t.primaryGuestId),
    index('reservations_status_idx').on(t.status)
  ]
)

export const reservationRooms = sqliteTable(
  'reservation_rooms',
  {
    id: id(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    checkIn: day('check_in').notNull(),
    checkOut: day('check_out').notNull(),
    checkedInAt: text('checked_in_at'),
    checkedOutAt: text('checked_out_at'),
    status: text('status', { enum: ['planned', 'in_house', 'done', 'cancelled'] })
      .notNull()
      .default('planned'),
    /** Room order inside the reservation (payment allocation on the same night). */
    sort: integer('sort').notNull().default(0),
    /** When a park, cancel or no-show released the stay's nights (the restore dialog offers the last park's rooms). */
    releasedAt: text('released_at'),
    ...timestamps
  },
  (t) => [
    index('reservation_rooms_reservation_idx').on(t.reservationId),
    index('reservation_rooms_room_idx').on(t.roomId, t.checkIn, t.checkOut),
    index('reservation_rooms_dates_idx').on(t.checkIn, t.checkOut),
    // In-house stays (KBS checks, "Otelde kalanlar"). Added in 0002.
    index('reservation_rooms_status_idx').on(t.status)
  ]
)

/**
 * One row per occupied slot. UNIQUE(room_id, date, slot) makes a double booking impossible (§4.8-1). Rows are
 * derived schedule: cancelling a stay removes them (the charges are voided and the audit log keeps the past).
 */
export const roomNights = sqliteTable(
  'room_nights',
  {
    id: id(),
    reservationRoomId: text('reservation_room_id')
      .notNull()
      .references(() => reservationRooms.id),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    date: day('date').notNull(),
    slot: text('slot', { enum: ['night', 'day'] }).notNull(),
    priceMinor: minor('price_minor').notNull(),
    currency: text('currency').notNull(),
    ...timestamps
  },
  (t) => [
    uniqueIndex('room_nights_room_date_slot_unique').on(t.roomId, t.date, t.slot),
    index('room_nights_stay_idx').on(t.reservationRoomId),
    index('room_nights_date_idx').on(t.date)
  ]
)

export const reservationNotes = sqliteTable(
  'reservation_notes',
  {
    id: id(),
    reservationId: text('reservation_id')
      .notNull()
      .references(() => reservations.id),
    date: day('date'),
    text: text('text').notNull(),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('reservation_notes_reservation_idx').on(t.reservationId)]
)

/** K-33: every person in the room, with a descriptor for the night shift and KBS marks (G-53, G-54). */
export const stayOccupants = sqliteTable(
  'stay_occupants',
  {
    id: id(),
    reservationRoomId: text('reservation_room_id')
      .notNull()
      .references(() => reservationRooms.id),
    guestId: text('guest_id').references(() => guests.id),
    fullName: text('full_name').notNull(),
    /** "kızıl saçlı" — staff screens only; never in exports or the Drive summary (§4.9-13). */
    descriptorNote: text('descriptor_note'),
    isPrimary: bool('is_primary').notNull().default(false),
    arrivedAt: text('arrived_at'),
    leftAt: text('left_at'),
    kbsReportedAt: text('kbs_reported_at'),
    kbsReportedBy: text('kbs_reported_by'),
    kbsCheckoutAt: text('kbs_checkout_at'),
    kbsCheckoutBy: text('kbs_checkout_by'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    index('stay_occupants_stay_idx').on(t.reservationRoomId),
    // A guest's stays (history, merge). Added in 0002.
    index('stay_occupants_guest_idx').on(t.guestId)
  ]
)

export const folios = sqliteTable(
  'folios',
  {
    id: id(),
    kind: text('kind', { enum: ['reservation', 'sale', 'house'] }).notNull(),
    reservationId: text('reservation_id').references(() => reservations.id),
    title: text('title'),
    currency: text('currency').notNull(),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    closedAt: text('closed_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [uniqueIndex('folios_reservation_unique').on(t.reservationId)]
)

export const charges = sqliteTable(
  'charges',
  {
    id: id(),
    folioId: text('folio_id')
      .notNull()
      .references(() => folios.id),
    date: day('date').notNull(),
    kind: text('kind', { enum: ['room_night', 'extra', 'discount', 'penalty', 'adjustment'] }).notNull(),
    roomNightId: text('room_night_id'),
    extraServiceId: text('extra_service_id').references(() => extraServices.id),
    description: text('description').notNull(),
    qty: integer('qty').notNull().default(1),
    unitMinor: minor('unit_minor').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    /**
     * The amount in the base currency, frozen with the rate known when the charge was written (K-15, S-32; added
     * in 0014); null when no rate was known then (reports convert it later or count it as "kur yok").
     */
    amountBaseMinor: minor('amount_base_minor'),
    voidedAt: text('voided_at'),
    voidReason: text('void_reason'),
    reversalOfId: text('reversal_of_id'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    index('charges_folio_idx').on(t.folioId),
    index('charges_date_idx').on(t.date),
    uniqueIndex('charges_room_night_unique').on(t.roomNightId)
  ]
)

export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    folioId: text('folio_id')
      .notNull()
      .references(() => folios.id),
    /** Business day the money was taken. */
    date: day('date').notNull(),
    kind: text('kind', { enum: ['payment', 'deposit', 'refund'] }).notNull(),
    methodId: text('method_id')
      .notNull()
      .references(() => paymentMethods.id),
    channelId: text('channel_id').references(() => salesChannels.id),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    /** Amount credited to the folio in the folio currency (frozen like the base rate; allocation uses it). */
    amountFolioMinor: minor('amount_folio_minor').notNull(),
    /** Base-currency rate × 1 000 000 frozen at the minute of writing (K-15). */
    fxRateToBase: integer('fx_rate_to_base'),
    fxRateAt: text('fx_rate_at'),
    fxSource: text('fx_source'),
    amountBaseMinor: minor('amount_base_minor'),
    /** When the rate used was observed ("kur 9 saat önceki"); null = same currency or no rate. Added in 0002. */
    fxRateObservedAt: text('fx_rate_observed_at'),
    reference: text('reference'),
    note: text('note'),
    /** The owner's "x" (G-64). */
    collectedAt: text('collected_at'),
    collectedBy: text('collected_by'),
    handoverId: text('handover_id'),
    voidedAt: text('voided_at'),
    voidReason: text('void_reason'),
    reversalOfId: text('reversal_of_id'),
    createdBy: text('created_by'),
    soldByUserId: text('sold_by_user_id'),
    ...timestamps
  },
  (t) => [
    index('payments_folio_idx').on(t.folioId),
    index('payments_date_idx').on(t.date),
    index('payments_collected_idx').on(t.collectedAt),
    index('payments_handover_idx').on(t.handoverId)
  ]
)

export const reservationCodeSequences = sqliteTable('reservation_code_sequences', {
  year: integer('year').primaryKey(),
  lastNumber: integer('last_number').notNull()
})
