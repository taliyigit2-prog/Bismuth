import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, timestamps } from './columns'

// Calendar days, tasks, shifts and handovers, notes, lost items, notifications (03-mimari.md §4.8;
// G-16, G-40, G-55, G-91…G-95, K-04, K-34). Local date-times are 'YYYY-MM-DDTHH:MM' text.

export const calendarDays = sqliteTable(
  'calendar_days',
  {
    id: id(),
    date: day('date').notNull(),
    kind: text('kind', { enum: ['holiday', 'half_holiday', 'special', 'note', 'event'] }).notNull(),
    title: text('title'),
    titleI18n: i18nJson('title_i18n_json'),
    note: text('note'),
    color: text('color'),
    /** generated rows may be regenerated/verified; editing one makes it `user` and protects it (K-04). */
    source: text('source', { enum: ['generated', 'verified', 'user'] }).notNull(),
    estimated: bool('estimated').notNull().default(false),
    generator: text('generator', { enum: ['date-holidays', 'intl-umalqura'] }),
    groupKey: text('group_key'),
    recurringYearly: bool('recurring_yearly').notNull().default(false),
    generatedYear: integer('generated_year'),
    cancelledAt: text('cancelled_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('calendar_days_date_idx').on(t.date), index('calendar_days_group_idx').on(t.groupKey)]
)

export const calendarGeneration = sqliteTable('calendar_generation', {
  year: integer('year').primaryKey(),
  generatedAt: text('generated_at').notNull(),
  verifiedAt: text('verified_at'),
  sourceVersion: text('source_version').notNull(),
  /** The hotel's country the year was generated for (null: before 0015, Türkiye); another country regenerates. */
  country: text('country')
})

export const shiftDefinitions = sqliteTable('shift_definitions', {
  id: id(),
  code: text('code'),
  name: text('name'),
  nameI18n: i18nJson('name_i18n_json'),
  /** 'HH:MM'; end < start means the shift ends the next day. */
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  sort: integer('sort').notNull().default(0),
  active: bool('active').notNull().default(true),
  ...timestamps
})

/** K-34: repeating tasks, maintenance and legal reminders, and suggestions offered at setup. */
export const taskTemplates = sqliteTable(
  'task_templates',
  {
    id: id(),
    code: text('code'),
    title: text('title'),
    titleI18n: i18nJson('title_i18n_json'),
    description: text('description'),
    kind: text('kind', { enum: ['general', 'maintenance', 'legal'] }).notNull(),
    assigneeUserId: text('assignee_user_id'),
    assigneeRoleId: text('assignee_role_id'),
    assigneeShiftId: text('assignee_shift_id'),
    roomId: text('room_id'),
    /** Recurrence rule (src/shared/domain/task-recurrence.ts). */
    recurrence: text('recurrence_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    firstDueAt: text('first_due_at'),
    remindMinutesBefore: integer('remind_minutes_before'),
    /** Seed suggestions stay inactive until the hotel picks them (G-94). */
    suggested: bool('suggested').notNull().default(false),
    active: bool('active').notNull().default(true),
    lastDoneAt: text('last_done_at'),
    materializedUntil: text('materialized_until'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [uniqueIndex('task_templates_code_unique').on(t.code)]
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: id(),
    templateId: text('template_id'),
    title: text('title').notNull(),
    description: text('description'),
    assigneeUserId: text('assignee_user_id'),
    assigneeRoleId: text('assignee_role_id'),
    assigneeShiftId: text('assignee_shift_id'),
    roomId: text('room_id'),
    dueAt: text('due_at'),
    status: text('status', { enum: ['open', 'done', 'cancelled'] })
      .notNull()
      .default('open'),
    doneAt: text('done_at'),
    doneBy: text('done_by'),
    cancelReason: text('cancel_reason'),
    note: text('note'),
    /** Overdue tasks notify once (§6.8). */
    overdueNotifiedAt: text('overdue_notified_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('tasks_template_due_unique').on(t.templateId, t.dueAt),
    index('tasks_status_due_idx').on(t.status, t.dueAt)
  ]
)

export const shiftHandovers = sqliteTable(
  'shift_handovers',
  {
    id: id(),
    businessDate: day('business_date').notNull(),
    fromShiftId: text('from_shift_id'),
    toShiftId: text('to_shift_id'),
    writtenBy: text('written_by'),
    writtenAt: text('written_at').notNull(),
    text: text('text'),
    /** Snapshot of the automatic summary at the moment of writing (§6.16; never typed by hand). */
    summary: text('summary_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    acknowledgedBy: text('acknowledged_by'),
    acknowledgedAt: text('acknowledged_at'),
    ...timestamps
  },
  (t) => [index('shift_handovers_date_idx').on(t.businessDate)]
)

/** personal notes are readable only by `owner_user_id` — not even the owner role (§4.9-12). */
export const notes = sqliteTable(
  'notes',
  {
    id: id(),
    kind: text('kind', { enum: ['personal', 'board'] }).notNull(),
    ownerUserId: text('owner_user_id'),
    text: text('text').notNull(),
    remindAt: text('remind_at'),
    pinned: bool('pinned').notNull().default(false),
    doneAt: text('done_at'),
    archivedAt: text('archived_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('notes_owner_idx').on(t.kind, t.ownerUserId)]
)

export const lostItems = sqliteTable(
  'lost_items',
  {
    id: id(),
    foundAt: text('found_at').notNull(),
    roomId: text('room_id'),
    locationText: text('location_text'),
    foundBy: text('found_by'),
    description: text('description').notNull(),
    storageLocation: text('storage_location'),
    status: text('status', { enum: ['stored', 'returned', 'disposed'] })
      .notNull()
      .default('stored'),
    returnedTo: text('returned_to'),
    returnedAt: text('returned_at'),
    note: text('note'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('lost_items_found_idx').on(t.foundAt)]
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: id(),
    kind: text('kind').notNull(),
    refId: text('ref_id'),
    userId: text('user_id'),
    title: text('title').notNull(),
    body: text('body'),
    dueAt: text('due_at').notNull(),
    readAt: text('read_at'),
    dismissedAt: text('dismissed_at'),
    ...timestamps
  },
  (t) => [index('notifications_due_idx').on(t.dueAt)]
)
