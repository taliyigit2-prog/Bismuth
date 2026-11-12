import { integer, text } from 'drizzle-orm/sqlite-core'

// Shared column helpers (03-mimari.md §4): ULID text ids, ISO-8601 UTC timestamps, 0/1 booleans,
// local days as 'YYYY-MM-DD' text, money as integer minor units + ISO currency (G-131).
export const id = () => text('id').primaryKey()
export const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}
export const bool = (name: string) => integer(name, { mode: 'boolean' })

/** Translated label of a seeded list row ({tr, en, ru}); a user-renamed row keeps its plain `name`. */
export type I18nText = Partial<Record<'tr' | 'en' | 'ru', string>>
export const i18nJson = (name: string) => text(name, { mode: 'json' }).$type<I18nText>()

/** Local calendar day 'YYYY-MM-DD' (no time zone). */
export const day = (name: string) => text(name)

/** Integer minor units (kuruş, cent). Never REAL. */
export const minor = (name: string) => integer(name)
