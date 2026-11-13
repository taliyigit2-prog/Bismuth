import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, minor, timestamps } from './columns'

// Rooms, room types, capacity history, blocks, issues and attachments (03-mimari.md §4.2; G-11, G-12, G-38,
// G-90, G-180, K-25, K-27).

export const roomTypes = sqliteTable(
  'room_types',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    nameI18n: i18nJson('name_i18n_json'),
    group: text('group', {
      enum: ['occupancy', 'tier', 'suite', 'view', 'building', 'feature', 'custom']
    }).notNull(),
    isCustom: bool('is_custom').notNull().default(false),
    maxAdults: integer('max_adults'),
    maxChildren: integer('max_children'),
    bedConfig: text('bed_config_json', { mode: 'json' }).$type<Record<string, number>>(),
    sizeM2: integer('size_m2'),
    /** Suggested nightly price (G-48); the user may change it on every reservation. */
    basePriceMinor: minor('base_price_minor'),
    /** Suggested price on highlighted days (weekend / special days); null = same as base. */
    weekendPriceMinor: minor('weekend_price_minor'),
    /** Suggested price of one hour of an hourly stay (K-48, S-102); null = none, the desk types it at the sale. */
    hourlyPriceMinor: minor('hourly_price_minor'),
    baseCurrency: text('base_currency'),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [uniqueIndex('room_types_code_unique').on(t.code)]
)

export const HK_STATUSES = ['clean', 'dirty', 'inspected', 'maintenance', 'out_of_order'] as const

export const rooms = sqliteTable(
  'rooms',
  {
    id: id(),
    number: text('number').notNull(),
    floor: text('floor'),
    roomTypeId: text('room_type_id')
      .notNull()
      .references(() => roomTypes.id),
    beds: integer('beds').notNull().default(1),
    sellable: bool('sellable').notNull().default(true),
    notes: text('notes'),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    hkStatus: text('hk_status', { enum: HK_STATUSES }).notNull().default('clean'),
    hkStatusAt: text('hk_status_at'),
    hkStatusBy: text('hk_status_by'),
    /** Short note on the room's state ("çarşaf eksik"); cleared when the state changes (added in 0008). */
    hkNote: text('hk_note'),
    ...timestamps
  },
  (t) => [uniqueIndex('rooms_number_unique').on(t.number)]
)

/** K-27: room added/removed or beds changed from a date; reports use the capacity valid on each day. */
export const roomCapacityChanges = sqliteTable(
  'room_capacity_changes',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    validFrom: day('valid_from').notNull(),
    active: bool('active').notNull(),
    sellable: bool('sellable').notNull(),
    beds: integer('beds').notNull(),
    note: text('note'),
    createdBy: text('created_by'),
    /** A planned change withdrawn (Ayarlar → Odalar) or replaced by an earlier-dated one; never deleted (K-27). */
    cancelledAt: text('cancelled_at'),
    cancelledBy: text('cancelled_by'),
    ...timestamps
  },
  (t) => [index('room_capacity_changes_room_idx').on(t.roomId, t.validFrom)]
)

export const roomBlocks = sqliteTable(
  'room_blocks',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    /** First blocked day. */
    dateFrom: day('date_from').notNull(),
    /** First free day (exclusive, like a check-out). */
    dateTo: day('date_to').notNull(),
    kind: text('kind', { enum: ['oos', 'ooo'] }).notNull(),
    reason: text('reason').notNull(),
    note: text('note'),
    roomIssueId: text('room_issue_id'),
    taskId: text('task_id'),
    /**
     * What opened the block: 'hk_status' = the room was set to maintenance / out of order on the status board and
     * the block ends when the state goes back (0008). null = by hand, an issue (roomIssueId) or a task (taskId).
     */
    source: text('source', { enum: ['hk_status'] }),
    /** A block is never deleted: it is cancelled (or ended early by shortening dateTo). */
    cancelledAt: text('cancelled_at'),
    cancelledBy: text('cancelled_by'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('room_blocks_room_idx').on(t.roomId, t.dateFrom, t.dateTo)]
)

export const roomIssues = sqliteTable(
  'room_issues',
  {
    id: id(),
    /** null = general area ("genel alan"). */
    roomId: text('room_id').references(() => rooms.id),
    /** Name of the general area ("Lobi", "Çatı") when there is no room (added in 0008). */
    area: text('area'),
    title: text('title').notNull(),
    description: text('description'),
    severity: text('severity', { enum: ['low', 'medium', 'urgent'] }).notNull(),
    status: text('status', { enum: ['open', 'planned', 'resolved'] }).notNull(),
    reportedBy: text('reported_by'),
    reportedAt: text('reported_at').notNull(),
    assignedTo: text('assigned_to'),
    plannedDate: day('planned_date'),
    resolvedAt: text('resolved_at'),
    resolvedBy: text('resolved_by'),
    resolutionNote: text('resolution_note'),
    /** "Odayı satışa kapat": an oos block exists while the issue is open (no cost field: S-76). */
    blocksRoom: bool('blocks_room').notNull().default(false),
    ...timestamps
  },
  (t) => [
    index('room_issues_room_idx').on(t.roomId),
    index('room_issues_status_idx').on(t.status),
    index('room_issues_reported_idx').on(t.reportedAt)
  ]
)

export const ATTACHMENT_ENTITIES = ['room_issue', 'expense', 'laundry_delivery', 'lost_item', 'task'] as const

/** K-25: files live in userData/attachments/; the row keeps path + sha256 and survives a file deletion. */
export const attachments = sqliteTable(
  'attachments',
  {
    id: id(),
    entity: text('entity', { enum: ATTACHMENT_ENTITIES }).notNull(),
    entityId: text('entity_id').notNull(),
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdBy: text('created_by'),
    deletedAt: text('deleted_at'),
    deletedBy: text('deleted_by'),
    ...timestamps
  },
  (t) => [index('attachments_entity_idx').on(t.entity, t.entityId)]
)
