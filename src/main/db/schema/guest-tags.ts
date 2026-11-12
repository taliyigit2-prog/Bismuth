import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, i18nJson, id, timestamps } from './columns'
import { guests } from './guests'

// Guest tags (G-50, K-46 (2)): the hotel's own list ("Ayarlar → Listeler → Misafir etiketleri") and the guests
// carrying them. A tag is never deleted, it is switched off: a guest who has it keeps showing it (faded), but it is
// no longer offered. Added in 0015.

export const guestTags = sqliteTable(
  'guest_tags',
  {
    id: id(),
    /** `custom_…` for the hotel's own rows (the list service's rule); nothing is seeded. */
    code: text('code'),
    name: text('name'),
    nameI18n: i18nJson('name_i18n_json'),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [uniqueIndex('guest_tags_code_unique').on(t.code)]
)

/**
 * Which guest carries which tag. An index row, like `reservation_tags`: taking a tag off removes the row (the
 * audit log keeps who did it and when); a merge moves the rows to the card that stays.
 */
export const guestTagLinks = sqliteTable(
  'guest_tag_links',
  {
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => guestTags.id),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull()
  },
  (t) => [primaryKey({ columns: [t.guestId, t.tagId] }), index('guest_tag_links_tag_idx').on(t.tagId)]
)
