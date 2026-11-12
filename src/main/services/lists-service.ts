// The hotel's own lists (G-13…G-15, faz-04 madde 4 "Listeler"): payment methods, sales channels, extra services,
// expense sections, laundry item types, product categories and guest tags (G-50). Seeded rows come translated and keep their code;
// the hotel renames, switches off, orders or adds rows. Nothing is deleted (a row in use stays readable): a row
// the hotel no longer wants is switched off. Reading is open to every signed-in user (payment dialogs, expense
// forms) except expense sections, which follow their own permission (the owner's hidden section, G-67); changing
// needs `settings.lists`.
import { asc, eq } from 'drizzle-orm'
import {
  listCreateSchema,
  listUpdateSchema,
  type ListCreateInput,
  type ListItem,
  type ListKind,
  type ListUpdateInput
} from '@shared/contract/admin'
import {
  expenseSections,
  extraServices,
  guestTags,
  laundryItemTypes,
  paymentMethods,
  productCategories,
  salesChannels
} from '../db/schema'
import type { PermissionKey } from '@shared/permissions'
import type { Ctx } from './context'
import { nameKey } from '@shared/name-key'
import { permissionDenied } from './errors'
import {
  assertNameFree,
  conflict,
  hasAnyAccess,
  inTransaction,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'
import { readSetting } from './settings-service'

const TABLES = {
  paymentMethods,
  salesChannels,
  extraServices,
  expenseSections,
  laundryItemTypes,
  productCategories,
  guestTags
} as const

/** audit_log entity name of each list. */
const ENTITY: Record<ListKind, string> = {
  paymentMethods: 'payment_method',
  salesChannels: 'sales_channel',
  extraServices: 'extra_service',
  expenseSections: 'expense_section',
  laundryItemTypes: 'laundry_item_type',
  productCategories: 'product_category',
  guestTags: 'guest_tag'
}

type AnyRow = Record<string, unknown> & {
  id: string
  code: string | null
  name: string | null
  nameI18n: ListItem['nameI18n']
  active: boolean
  sort: number
}

/** Rows the hotel adds get a `custom_…` code; seeded rows keep theirs (their translations follow the UI language). */
const isSeeded = (code: string | null): boolean => !!code && !code.startsWith('custom_')

function view(kind: ListKind, row: AnyRow): ListItem {
  const base: ListItem = {
    id: row.id,
    code: row.code,
    name: row.name,
    nameI18n: row.nameI18n ?? null,
    active: row.active,
    sort: row.sort,
    seeded: isSeeded(row.code)
  }
  switch (kind) {
    case 'paymentMethods':
      return { ...base, group: row.group as string, isCash: row.isCash as boolean }
    case 'salesChannels':
      return {
        ...base,
        kind: row.kind as string,
        commissionBp: (row.commissionBp as number | null) ?? null,
        defaultCollectedBy: row.defaultCollectedBy as 'hotel' | 'channel'
      }
    case 'extraServices':
      return {
        ...base,
        defaultPriceMinor: (row.defaultPriceMinor as number | null) ?? null,
        defaultCurrency: (row.defaultCurrency as string | null) ?? null,
        unit: row.unit as string
      }
    case 'expenseSections':
      return { ...base, visibilityPermission: row.visibilityPermission as 'expenses' | 'expenses.owner' }
    default:
      return base
  }
}

export function createListsService(deps: ServiceDeps) {
  const { db } = deps

  const rows = (kind: ListKind): AnyRow[] => {
    const table = TABLES[kind]
    return db.select().from(table).orderBy(asc(table.sort), asc(table.createdAt)).all() as unknown as AnyRow[]
  }
  const rowOf = (kind: ListKind, id: string): AnyRow => {
    const table = TABLES[kind]
    const row = db.select().from(table).where(eq(table.id, id)).get() as unknown as AnyRow | undefined
    if (!row) throw notFound(ENTITY[kind], id)
    return row
  }

  /** An expense section is visible only with its own permission; every other row to anyone who may use the program. */
  const sectionPermission = (kind: ListKind, row: AnyRow): PermissionKey | null =>
    kind === 'expenseSections' ? (row.visibilityPermission as PermissionKey) : null
  const visible = (ctx: Ctx, kind: ListKind, row: AnyRow): boolean => {
    const permission = sectionPermission(kind, row)
    return permission === null || ctx.can(permission, 'view')
  }

  return {
    list(ctx: Ctx, kind: ListKind, opts: { includeInactive?: boolean } = {}): ListItem[] {
      if (!hasAnyAccess(ctx)) throw permissionDenied()
      return rows(kind)
        .filter((r) => (opts.includeInactive || r.active) && visible(ctx, kind, r))
        .map((r) => view(kind, r))
    },

    /** Adds the hotel's own row at the end of the list. */
    create(ctx: Ctx, input: ListCreateInput): ListItem {
      requirePermission(ctx, 'settings.lists', 'edit')
      const data = parseInput(listCreateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertNameFree(
          rows(data.kind).filter((r) => visible(ctx, data.kind, r)),
          data.name
        )
        const id = newId(now)
        const sort = Math.max(0, ...rows(data.kind).map((r) => r.sort)) + 1
        const common = {
          id,
          code: `custom_${id.toLowerCase()}`,
          name: data.name,
          nameI18n: null,
          active: true,
          sort,
          ...stamps(now)
        }
        const extra: Record<ListKind, Record<string, unknown>> = {
          paymentMethods: {
            group: data.group ?? (data.isCash ? 'cash' : 'other'),
            isCash: data.group ? data.group === 'cash' : (data.isCash ?? false)
          },
          salesChannels: {
            kind: 'custom',
            defaultCollectedBy: data.defaultCollectedBy ?? 'hotel',
            commissionBp: data.commissionBp ?? null
          },
          extraServices: {
            unit: data.unit ?? 'per_item',
            defaultPriceMinor: data.defaultPriceMinor ?? null,
            // A price is never without its currency (G-131): the hotel's base unless another is given.
            defaultCurrency:
              data.defaultPriceMinor != null
                ? (data.defaultCurrency ?? readSetting(tx, 'hotel.baseCurrency'))
                : (data.defaultCurrency ?? null)
          },
          expenseSections: { visibilityPermission: 'expenses' },
          laundryItemTypes: {},
          productCategories: {},
          guestTags: {}
        }
        const row = { ...common, ...extra[data.kind] }
        tx.insert(TABLES[data.kind])
          .values(row as never)
          .run()
        audit({ entity: ENTITY[data.kind], entityId: id, action: 'create', after: row })
        return view(data.kind, row as AnyRow)
      })
    },

    /** Rename (replaces the seeded translations), switch on/off, reorder; channel commission, service price. */
    update(ctx: Ctx, input: ListUpdateInput): ListItem {
      requirePermission(ctx, 'settings.lists', 'edit')
      const { kind, id, patch } = parseInput(listUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = rowOf(kind, id)
        if (patch.name !== undefined && nameKey(patch.name) !== nameKey(before.name ?? ''))
          assertNameFree(
            rows(kind).filter((r) => visible(ctx, kind, r)),
            patch.name,
            id
          )
        // Someone who cannot see a section cannot change it either (and does not learn it exists).
        const permission = sectionPermission(kind, before)
        if (permission !== null && !ctx.can(permission, 'edit')) throw notFound(ENTITY[kind], id)
        const set: Record<string, unknown> = {}
        if (patch.name !== undefined && (patch.name !== before.name || before.nameI18n !== null))
          Object.assign(set, { name: patch.name, nameI18n: null })
        if (patch.active !== undefined && patch.active !== before.active) set.active = patch.active
        if (patch.sort !== undefined && patch.sort !== before.sort) set.sort = patch.sort
        if (
          patch.commissionBp !== undefined &&
          kind === 'salesChannels' &&
          patch.commissionBp !== before.commissionBp
        )
          set.commissionBp = patch.commissionBp
        if (
          patch.defaultPriceMinor !== undefined &&
          kind === 'extraServices' &&
          patch.defaultPriceMinor !== before.defaultPriceMinor
        ) {
          set.defaultPriceMinor = patch.defaultPriceMinor
          if (patch.defaultPriceMinor !== null && before.defaultCurrency == null)
            set.defaultCurrency = readSetting(tx, 'hotel.baseCurrency')
        }
        // Nothing changes: no write, no audit row.
        if (Object.keys(set).length === 0) return view(kind, before)
        // The cash drawer needs a cash method (G-36): the last active one cannot be switched off.
        if (kind === 'paymentMethods' && set.active === false && before.isCash === true) {
          const otherCash = rows(kind).some((r) => r.id !== id && r.active && r.isCash === true)
          if (!otherCash) throw conflict('errors.cashMethodRequired')
        }
        set.updatedAt = now.toISOString()
        const table = TABLES[kind]
        tx.update(table)
          .set(set as never)
          .where(eq(table.id, id))
          .run()
        const after = rowOf(kind, id)
        audit({ entity: ENTITY[kind], entityId: id, action: 'update', before, after })
        return view(kind, after)
      })
    }
  }
}
