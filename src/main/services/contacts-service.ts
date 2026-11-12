// Phone book (G-160, "Rehber"): suppliers, the laundry, plumber, taxi… with several phone numbers each.
// Contacts are never deleted: they are switched off (their expenses and laundry records keep pointing at them).
import { and, eq, type SQL } from 'drizzle-orm'
import * as z from 'zod'
import {
  contactInputSchema,
  contactListSchema,
  contactUpdateSchema,
  type ContactInput,
  type ContactListInput,
  type ContactUpdate
} from '@shared/contract/supply'
import { normalizeName, normalizePhone } from '@shared/domain/normalize'
import { contacts } from '../db/schema'
import type { Ctx } from './context'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'

export type ContactRow = typeof contacts.$inferSelect

const collator = new Intl.Collator('tr')

/** At most this many rows in one import (the screen previews them first). */
export const CONTACT_IMPORT_MAX = 500
const contactImportSchema = z.array(contactInputSchema).min(1).max(CONTACT_IMPORT_MAX)

function newRow(ctx: Ctx, data: z.output<typeof contactInputSchema>, now: Date): ContactRow {
  return {
    id: newId(now),
    name: data.name,
    nameNormalized: normalizeName(data.name),
    category: data.category,
    customCategory: data.category === 'custom' ? (data.customCategory ?? null) : null,
    phones: data.phones,
    address: data.address ?? null,
    email: data.email ?? null,
    note: data.note ?? null,
    favorite: data.favorite,
    active: true,
    createdBy: ctx.userId,
    ...stamps(now)
  }
}

export function createContactsService(deps: ServiceDeps) {
  const { db } = deps

  const contactOf = (tx: Pick<Tx, 'select'>, id: string): ContactRow => {
    const row = tx.select().from(contacts).where(eq(contacts.id, id)).get()
    if (!row) throw notFound('contact', id)
    return row
  }

  const setActive = (ctx: Ctx, id: string, active: boolean): ContactRow => {
    requirePermission(ctx, 'contacts', 'edit')
    return inTransaction(deps, ctx, (tx, audit, now) => {
      const before = contactOf(tx, id)
      tx.update(contacts).set({ active, updatedAt: now.toISOString() }).where(eq(contacts.id, id)).run()
      const after = contactOf(tx, id)
      audit({ entity: 'contact', entityId: id, action: active ? 'restore' : 'cancel', before, after })
      return after
    })
  }

  return {
    /**
     * Favourites first, then by name (Turkish order); `q` matches the name, the hotel's own category label, the
     * note ("sucu", "7/24") or any phone number. Seeded category names are translated in the UI, which matches them.
     */
    list(ctx: Ctx, input: ContactListInput = {}): ContactRow[] {
      requirePermission(ctx, 'contacts', 'view')
      const q = parseInput(contactListSchema, input)
      const where: (SQL | undefined)[] = [
        q.includeInactive ? undefined : eq(contacts.active, true),
        q.category ? eq(contacts.category, q.category) : undefined
      ]
      const rows = db
        .select()
        .from(contacts)
        .where(and(...where))
        .all()
      const name = q.q ? normalizeName(q.q) : ''
      // Typed digits without the trunk 0 ("0532…" finds "+90 532…"); stored numbers are compared normalised.
      const digits = q.q ? q.q.replace(/\D/g, '').replace(/^0+/, '') : ''
      return rows
        .filter(
          (c) =>
            !q.q ||
            c.nameNormalized.includes(name) ||
            [c.customCategory, c.note].some((v) => !!v && normalizeName(v).includes(name)) ||
            (digits.length >= 3 && c.phones.some((p) => normalizePhone(p.number).includes(digits)))
        )
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || collator.compare(a.name, b.name))
    },

    /** The favourite numbers (Bugün → "Acil numaralar"): active favourites, by name. */
    favorites(ctx: Ctx): ContactRow[] {
      requirePermission(ctx, 'contacts', 'view')
      return db
        .select()
        .from(contacts)
        .where(and(eq(contacts.active, true), eq(contacts.favorite, true)))
        .all()
        .sort((a, b) => collator.compare(a.name, b.name))
    },

    get(ctx: Ctx, id: string): ContactRow {
      requirePermission(ctx, 'contacts', 'view')
      return contactOf(db, id)
    },

    create(ctx: Ctx, input: ContactInput): ContactRow {
      requirePermission(ctx, 'contacts', 'edit')
      const data = parseInput(contactInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const row = newRow(ctx, data, now)
        tx.insert(contacts).values(row).run()
        audit({ entity: 'contact', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    /**
     * Phone-book import (CSV "ad; telefon; kategori"): every row in one transaction, all or nothing. A row whose
     * name is already in the book (same normalised name) is skipped, so pasting the same list twice adds nothing.
     */
    importMany(ctx: Ctx, inputs: readonly ContactInput[]): { created: ContactRow[]; skipped: string[] } {
      requirePermission(ctx, 'contacts', 'edit')
      const data = parseInput(contactImportSchema, inputs)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const known = new Set(
          tx
            .select({ key: contacts.nameNormalized })
            .from(contacts)
            .all()
            .map((c) => c.key)
        )
        const created: ContactRow[] = []
        const skipped: string[] = []
        for (const item of data) {
          const key = normalizeName(item.name)
          if (known.has(key)) {
            skipped.push(item.name)
            continue
          }
          known.add(key)
          const row = newRow(ctx, item, now)
          tx.insert(contacts).values(row).run()
          audit({ entity: 'contact', entityId: row.id, action: 'create', after: row, reason: 'import' })
          created.push(row)
        }
        return { created, skipped }
      })
    },

    update(ctx: Ctx, id: string, patch: ContactUpdate): ContactRow {
      requirePermission(ctx, 'contacts', 'edit')
      const data = parseInput(contactUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = contactOf(tx, id)
        const category = data.category ?? before.category
        const customCategory =
          data.customCategory !== undefined ? (data.customCategory ?? null) : before.customCategory
        if (category === 'custom' && !customCategory)
          throw invalid('errors.validation', {
            fields: { customCategory: ['custom category label required'] }
          })
        tx.update(contacts)
          .set({
            ...data,
            ...(data.name !== undefined ? { nameNormalized: normalizeName(data.name) } : {}),
            customCategory: category === 'custom' ? customCategory : null,
            updatedAt: now.toISOString()
          })
          .where(eq(contacts.id, id))
          .run()
        const after = contactOf(tx, id)
        audit({ entity: 'contact', entityId: id, action: 'update', before, after })
        return after
      })
    },

    deactivate(ctx: Ctx, id: string): ContactRow {
      return setActive(ctx, id, false)
    },

    reactivate(ctx: Ctx, id: string): ContactRow {
      return setActive(ctx, id, true)
    }
  }
}

export type ContactsService = ReturnType<typeof createContactsService>
