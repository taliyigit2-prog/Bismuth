// Test helper (imported by tests only): an in-memory stand-in for the Faz 12 procedures — phone book, lost and found,
// products and purchases, laundry — over the shared settings fake (render.tsx). It keeps the rules the screens
// show by calling the same shared domain functions as the services (price change, monthly consumption, laundry
// balance and settlement); the service tests cover the rest. Names and amounts are invented.
import { SETTINGS_DEFAULTS, type ListItem, type ProcedureName, type ProcedureOutput } from '@shared/contract'
import type { ContactView, LostItemView } from '@shared/contract/procedures/contacts'
import type {
  LaundryDeliveryView,
  LaundryPriceView,
  ProductCategoryView,
  PurchaseView
} from '@shared/contract/procedures/supply'
import type { LocalDate } from '@shared/date'
import { isInMonth } from '@shared/domain/local-datetime'
import {
  laundryLineAmount,
  laundryOutstanding,
  laundrySettlement,
  withInvoice,
  type LaundryDelivery,
  type LaundryPrice
} from '@shared/domain/laundry'
import { normalizeName } from '@shared/domain/normalize'
import { monthlyConsumption, priceChange, priceHistory, type PurchaseLine } from '@shared/domain/supply'
import { money, multiplyRatio } from '@shared/money'
import { ApiError, type Transport } from '@/lib/transport/types'
import { fakeTransport } from './render'

type Product = ProcedureOutput<'supply.products'>[number]
type Room = ProcedureOutput<'rooms.list'>[number]
type RoomType = ProcedureOutput<'rooms.listTypes'>[number]
type Attachment = ProcedureOutput<'lostItems.photos'>[number]
type Settlement = NonNullable<ProcedureOutput<'laundry.month'>['settled']>

const STAMP = '2026-10-01T09:00:00.000Z'
const denied = (): ApiError => new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')

export interface Faz12State {
  contacts: ContactView[]
  lost: LostItemView[]
  rooms: Room[]
  roomTypes: RoomType[]
  categories: ProductCategoryView[]
  products: Product[]
  purchases: PurchaseView[]
  methods: ListItem[]
  itemTypes: ListItem[]
  prices: LaundryPriceView[]
  deliveries: LaundryDeliveryView[]
  settlements: (Settlement & { contactId: string; year: number; month: number })[]
  photos: Record<string, Attachment[]>
}

const listItem = (id: string, code: string, tr: string, sort: number): ListItem => ({
  id,
  code,
  name: null,
  nameI18n: { tr, en: tr, ru: tr },
  active: true,
  sort,
  seeded: true
})

export function contact(partial: Partial<ContactView> & Pick<ContactView, 'id' | 'name'>): ContactView {
  return {
    category: 'other',
    customCategory: null,
    phones: [],
    address: null,
    email: null,
    note: null,
    favorite: false,
    active: true,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial
  }
}

/** An empty hotel with the seeded lists (payment methods, laundry item types, product categories). */
export function emptyFaz12(): Faz12State {
  return {
    contacts: [],
    lost: [],
    rooms: [],
    roomTypes: [],
    categories: [
      {
        id: 'cat-drinks',
        code: 'drinks',
        name: null,
        displayName: { tr: 'Su ve içecek', en: 'Water and drinks', ru: 'Вода и напитки' },
        sort: 1,
        active: true
      },
      {
        id: 'cat-cleaning',
        code: 'cleaning',
        name: null,
        displayName: { tr: 'Temizlik malzemeleri', en: 'Cleaning supplies', ru: 'Моющие средства' },
        sort: 2,
        active: true
      }
    ],
    products: [],
    purchases: [],
    methods: [listItem('m-cash', 'cash', 'Nakit', 1), listItem('m-card', 'card', 'Kredi kartı', 2)],
    itemTypes: [
      listItem('lt-sheet', 'sheet', 'Çarşaf', 1),
      listItem('lt-duvet', 'duvet_cover', 'Nevresim / yorgan kılıfı', 2),
      listItem('lt-pillow', 'pillowcase', 'Yastık kılıfı', 3),
      listItem('lt-big', 'bath_towel', 'Büyük havlu', 4),
      listItem('lt-small', 'hand_towel', 'Küçük havlu', 5),
      listItem('lt-foot', 'bath_mat', 'Ayak havlusu', 6)
    ],
    prices: [],
    deliveries: [],
    settlements: [],
    photos: {}
  }
}

const linesOf = (state: Faz12State): PurchaseLine[] =>
  state.purchases
    .filter((p) => !p.voidedAt)
    .flatMap((p) =>
      p.items.map((i) => ({
        productId: i.productId,
        date: p.date as LocalDate,
        qty: i.qtyMilli,
        unitPriceMinor: i.unitPriceMinor,
        amountMinor: i.amountMinor,
        currency: p.currency
      }))
    )

const asDelivery = (d: LaundryDeliveryView): LaundryDelivery => ({
  id: d.id,
  date: d.date as LocalDate,
  direction: d.direction,
  contactId: d.laundryContactId,
  items: d.items
})

const asPrice = (p: LaundryPriceView): LaundryPrice => ({
  contactId: p.laundryContactId,
  itemTypeId: p.itemTypeId,
  validFrom: p.validFrom as LocalDate,
  unitPriceMinor: p.unitPriceMinor,
  currency: p.currency
})

/**
 * The fake transport. `canWrite: false` refuses every write like the service would for a viewer; `calls` records
 * every call (name, input) for assertions.
 */
export function faz12Transport(state: Faz12State = emptyFaz12(), opts: { canWrite?: boolean } = {}) {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  let next = 1
  const id = (prefix: string): string => `${prefix}-${next++}`
  const calls: { name: ProcedureName; input: unknown }[] = []
  const write = (): void => {
    if (opts.canWrite === false) throw denied()
  }
  const contactOf = (cid: string): ContactView => {
    const c = state.contacts.find((x) => x.id === cid)
    if (!c) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return c
  }

  // Each branch reads the input of its own procedure as the contract defines it (the router has parsed it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (name: ProcedureName, input: any): unknown => {
    switch (name) {
      // ── phone book ──
      case 'contacts.list':
        return state.contacts.filter(
          (c) => (input.includeInactive || c.active) && (!input.category || c.category === input.category)
        )
      case 'contacts.favorites':
        return state.contacts.filter((c) => c.active && c.favorite)
      case 'contacts.create': {
        write()
        const c = contact({ ...input, id: id('c'), phones: input.phones ?? [], favorite: !!input.favorite })
        state.contacts.push(c)
        return c
      }
      case 'contacts.update': {
        write()
        Object.assign(contactOf(input.id), input.patch)
        return contactOf(input.id)
      }
      case 'contacts.setActive': {
        write()
        contactOf(input.id).active = input.active
        return contactOf(input.id)
      }
      case 'contacts.import': {
        write()
        const known = new Set(state.contacts.map((c) => normalizeName(c.name)))
        const created: ContactView[] = []
        const skipped: string[] = []
        for (const row of input.contacts) {
          if (known.has(normalizeName(row.name))) {
            skipped.push(row.name)
            continue
          }
          const c = contact({ ...row, id: id('c'), phones: row.phones ?? [] })
          state.contacts.push(c)
          created.push(c)
        }
        return { created, skipped }
      }

      // ── lost and found ──
      case 'lostItems.list':
        return state.lost
      case 'lostItems.create': {
        write()
        const item: LostItemView = {
          id: id('lost'),
          foundAt:
            input.foundAt?.length === 10 ? `${input.foundAt}T00:00` : (input.foundAt ?? '2026-10-04T09:00'),
          roomId: input.roomId ?? null,
          roomNumber: state.rooms.find((r) => r.id === input.roomId)?.number ?? null,
          locationText: input.locationText ?? null,
          foundBy: input.foundBy ?? null,
          description: input.description,
          storageLocation: input.storageLocation ?? null,
          status: 'stored',
          returnedTo: null,
          returnedAt: null,
          note: input.note ?? null,
          createdByName: 'Otel Sahibi',
          createdAt: STAMP,
          statusChange: null
        }
        state.lost.unshift(item)
        return { id: item.id }
      }
      case 'lostItems.markReturned': {
        write()
        const item = state.lost.find((x) => x.id === input.id)!
        Object.assign(item, {
          status: 'returned',
          returnedTo: input.input.returnedTo,
          returnedAt: input.input.returnedAt ?? '2026-10-04T12:00',
          statusChange: { at: '2026-10-04T09:30:00.000Z', byName: 'Otel Sahibi', reason: null }
        })
        return { ok: true }
      }
      case 'lostItems.markDisposed':
      case 'lostItems.restore': {
        write()
        const item = state.lost.find((x) => x.id === input.id)!
        Object.assign(item, {
          status: name === 'lostItems.markDisposed' ? 'disposed' : 'stored',
          ...(name === 'lostItems.restore' ? { returnedTo: null, returnedAt: null } : {}),
          statusChange: { at: '2026-10-04T09:30:00.000Z', byName: 'Otel Sahibi', reason: input.reason }
        })
        return { ok: true }
      }
      case 'lostItems.photos':
      case 'supply.photos':
        return state.photos[input.id] ?? []
      case 'lostItems.addPhoto':
      case 'supply.addPhoto': {
        write()
        const row: Attachment = {
          id: id('att'),
          mime: input.mime,
          bytes: input.dataBase64.length,
          width: null,
          height: null,
          createdAt: STAMP,
          deletedAt: null
        }
        state.photos[input.id] = [...(state.photos[input.id] ?? []), row]
        return row
      }
      case 'lostItems.readPhoto':
      case 'supply.readPhoto':
        return { id: input.id, mime: 'image/png', dataBase64: 'iVBORw0KGgo=' }
      case 'rooms.list':
        return state.rooms
      case 'rooms.listTypes':
        return state.roomTypes

      // ── supplies ──
      case 'supply.categories':
        return state.categories
      case 'supply.products':
        return state.products.filter((p) => p.active)
      case 'supply.createProduct': {
        write()
        const p: Product = {
          id: id('p'),
          supplierContactId: null,
          trackStock: false,
          stockQtyMilli: null,
          active: true,
          ...input
        }
        state.products.push(p)
        return p
      }
      case 'supply.updateProduct': {
        write()
        const p = state.products.find((x) => x.id === input.id)!
        Object.assign(p, input.patch)
        return p
      }
      case 'supply.overview': {
        const lines = linesOf(state)
        const prev =
          input.month === 1
            ? { year: input.year - 1, month: 12 }
            : { year: input.year, month: input.month - 1 }
        return state.products
          .filter((p) => input.includeInactive || p.active)
          .map((p) => {
            const last = priceHistory(lines, p.id).at(-1)
            return {
              ...p,
              supplierName: state.contacts.find((c) => c.id === p.supplierContactId)?.name ?? null,
              priceChange: priceChange(lines, p.id),
              lastPurchase: last
                ? { date: last.date, unitPriceMinor: last.unitPriceMinor, currency: last.currency }
                : null,
              thisMonth: monthlyConsumption(lines, p.id, input.year, input.month),
              lastMonth: monthlyConsumption(lines, p.id, prev.year, prev.month)
            }
          })
      }
      case 'supply.priceHistory':
        return state.purchases
          .filter((p) => !p.voidedAt)
          .flatMap((p) =>
            p.items
              .filter((i) => i.productId === input.productId)
              .map((i) => ({
                date: p.date,
                qty: i.qtyMilli,
                unitPriceMinor: i.unitPriceMinor,
                amountMinor: i.amountMinor,
                currency: p.currency,
                expenseId: p.id,
                supplierName: p.vendorName
              }))
          )
          .sort((a, b) => a.date.localeCompare(b.date))
      case 'supply.purchases':
        return state.purchases
          .filter((p) => p.date >= input.from && p.date <= input.to && (input.includeVoided || !p.voidedAt))
          .sort((a, b) => b.date.localeCompare(a.date))
      case 'supply.monthSummary': {
        const month = state.purchases.filter(
          (p) => !p.voidedAt && isInMonth(p.date as LocalDate, input.year, input.month)
        )
        const total = month.reduce((s, p) => s + p.amountMinor, 0)
        return {
          year: input.year,
          month: input.month,
          purchaseCount: month.length,
          totals: month.length ? [{ amountMinor: total, currency: 'TRY' }] : [],
          byProduct: [],
          bySupplier: []
        }
      }
      case 'supply.sections':
        return [
          {
            id: 'sec-general',
            code: 'general',
            name: null,
            nameI18n: { tr: 'Genel', en: 'General', ru: 'Общие' },
            canEdit: true
          }
        ]
      case 'supply.recordPurchase': {
        write()
        const items = input.items.map(
          (i: { productId: string; qtyMilli: number; unitPriceMinor: number }) => ({
            id: id('item'),
            ...i,
            amountMinor: multiplyRatio(money(i.unitPriceMinor, input.currency), i.qtyMilli, 1000).amountMinor
          })
        )
        const p: PurchaseView = {
          id: id('exp'),
          date: input.date,
          amountMinor: input.amountMinor,
          currency: input.currency,
          description: input.description,
          vendorContactId: input.vendorContactId ?? null,
          vendorName: state.contacts.find((c) => c.id === input.vendorContactId)?.name ?? null,
          paidFromDrawer: !!input.paidFromDrawer,
          methodId: input.methodId ?? null,
          sectionCode: 'general',
          voidedAt: null,
          voidReason: null,
          createdAt: STAMP,
          items
        }
        state.purchases.push(p)
        return p
      }
      case 'supply.voidPurchase': {
        write()
        const p = state.purchases.find((x) => x.id === input.id)!
        Object.assign(p, { voidedAt: STAMP, voidReason: input.reason })
        return p
      }
      case 'lists.list':
        return input.kind === 'paymentMethods'
          ? state.methods
          : input.kind === 'laundryItemTypes'
            ? state.itemTypes
            : []

      // ── laundry ──
      case 'laundry.prices':
        return state.prices.filter((p) => p.laundryContactId === input.contactId)
      case 'laundry.setPrice': {
        write()
        const p: LaundryPriceView = {
          id: id('price'),
          laundryContactId: input.contactId,
          itemTypeId: input.itemTypeId,
          validFrom: input.validFrom,
          unitPriceMinor: input.unitPriceMinor,
          currency: 'TRY',
          createdAt: STAMP
        }
        state.prices.push(p)
        return p
      }
      case 'laundry.deliveries':
        return state.deliveries.filter(
          (d) =>
            (!input.contactId || d.laundryContactId === input.contactId) &&
            (!input.from || d.date >= input.from) &&
            (!input.to || d.date <= input.to) &&
            (input.includeVoided || !d.voidedAt)
        )
      case 'laundry.recordDelivery': {
        write()
        const prices = state.prices.map(asPrice)
        const d: LaundryDeliveryView = {
          id: id('del'),
          date: input.date,
          direction: input.direction,
          laundryContactId: input.contactId,
          slipNo: input.slipNo ?? null,
          note: input.note ?? null,
          voidedAt: null,
          createdAt: STAMP,
          items: input.items.map(
            (i: {
              itemTypeId: string
              qty: number
              stainedQty?: number
              slipUnitPriceMinor?: number | null
            }) => {
              const item = {
                itemTypeId: i.itemTypeId,
                qty: i.qty,
                stainedQty: i.stainedQty ?? 0,
                slipUnitPriceMinor: i.slipUnitPriceMinor ?? null
              }
              return {
                ...item,
                amountMinor:
                  input.direction === 'in'
                    ? (laundryLineAmount(item, input.date, input.contactId, prices, 'TRY')?.amountMinor ??
                      null)
                    : null
              }
            }
          )
        }
        state.deliveries.push(d)
        return d
      }
      case 'laundry.voidDelivery': {
        write()
        state.deliveries.find((d) => d.id === input.id)!.voidedAt = STAMP
        return { ok: true }
      }
      case 'laundry.outstanding':
        return laundryOutstanding(
          state.deliveries.filter((d) => !d.voidedAt).map(asDelivery),
          input.contactId,
          (input.until ?? '2026-10-04') as LocalDate
        )
      case 'laundry.month': {
        const s = laundrySettlement(
          state.deliveries.filter((d) => !d.voidedAt).map(asDelivery),
          state.prices.map(asPrice),
          input.contactId,
          input.year,
          input.month,
          { currency: 'TRY' }
        )
        const settled = state.settlements.find(
          (x) => x.contactId === input.contactId && x.year === input.year && x.month === input.month
        )
        return { ...withInvoice(s, settled?.invoicedTotalMinor ?? 0), settled: settled ?? null }
      }
      case 'laundry.settle': {
        write()
        const s = laundrySettlement(
          state.deliveries.filter((d) => !d.voidedAt).map(asDelivery),
          state.prices.map(asPrice),
          input.contactId,
          input.year,
          input.month,
          { currency: 'TRY' }
        )
        const check = withInvoice(s, input.invoicedTotalMinor)
        state.settlements = state.settlements.filter(
          (x) => !(x.contactId === input.contactId && x.year === input.year && x.month === input.month)
        )
        const settled = {
          contactId: input.contactId,
          year: input.year,
          month: input.month,
          id: id('set'),
          invoicedTotalMinor: input.invoicedTotalMinor,
          differenceMinor: check.differenceMinor,
          computedTotalMinor: s.totalAmountMinor ?? 0,
          note: input.note ?? null,
          expenseId: input.paid === false ? null : id('exp'),
          settledAt: STAMP
        }
        state.settlements.push(settled)
        return { ...check, settled }
      }
      case 'laundry.trend':
        return [
          {
            year: 2026,
            month: 10,
            qty: 0,
            stainedQty: 0,
            amountMinor: 0,
            currency: 'TRY',
            invoicedTotalMinor: null
          }
        ]
      default:
        return undefined
    }
  }

  const transport: Transport & {
    calls: typeof calls
    callsTo: (n: ProcedureName) => unknown[]
    state: Faz12State
  } = {
    kind: 'ipc',
    calls,
    state,
    callsTo: (n) => calls.filter((c) => c.name === n).map((c) => c.input),
    async call(name, input) {
      calls.push({ name, input })
      const answer = handle(name, input ?? {})
      if (answer !== undefined) return structuredClone(answer) as never
      return base.call(name, input)
    }
  }
  return transport
}

export type Faz12Transport = ReturnType<typeof faz12Transport>
