import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { id, timestamps } from './columns'

/** Key/value settings; values are JSON validated by `src/shared/contract/settings.ts`. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by')
})

/**
 * A person's own display choices (K-37, G-47: language, theme, density, amounts, start screen). The hotel's value
 * in `settings` is the default (sign-in screen, accounts that never chose). Added in 0007.
 */
export const userPreferences = sqliteTable(
  'user_preferences',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    ...timestamps
  },
  (t) => [uniqueIndex('user_preferences_user_key_unique').on(t.userId, t.key)]
)
