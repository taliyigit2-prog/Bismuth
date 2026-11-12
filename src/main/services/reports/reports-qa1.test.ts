// Son kontrol (QA-1): raporlarda kur kaynağı (Faz 11 teslimat 5) ve tedarik giderleri kartı (Faz 12 teslimat 2).
// The same role sees the same rows as in its ledger (K-42): an owner-only expense is neither counted in the rate
// sources nor in the supply costs of a manager.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { defaultPermissions } from '@shared/permissions'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import {
  expenseSections,
  fxRates,
  paymentMethods,
  productCategories,
  roomTypes,
  salesChannels
} from '../../db/schema'
import { createServices } from '..'
import { ctxFromPermissions } from '../context'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const OCTOBER = { from: '2026-10-01', to: '2026-11-01' }

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function hotel() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-20T09:00:00.000Z')
  const s = createServices(handle, runtime, { clock })
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  const category = (c: string) =>
    handle.db.select().from(productCategories).where(eq(productCategories.code, c)).get()!.id
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const room = s.rooms.createRoom(owner, {
    number: '101',
    roomTypeId: typeId,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const reservationId = s.reservations.create(owner, {
    guest: { firstName: 'Örnek', lastName: 'Misafir' },
    channelId: code(salesChannels, 'direct'),
    stays: [{ roomId: room.id, checkIn: '2026-10-02', checkOut: '2026-10-05', nightlyPriceMinor: 500_000 }]
  }).reservation.id
  // A market mid rate from Truncgil before every record of the month: 1 EUR = 50 TRY.
  handle.db
    .insert(fxRates)
    .values({
      id: '01JZZZZZZZZZZZZZZZZZZZZZA1',
      ts: '2026-10-01T08:00:00.000Z',
      base: 'EUR',
      quote: 'TRY',
      midRateMicro: 50_000_000,
      source: 'market_mid',
      provider: 'truncgil',
      createdAt: '2026-10-01T08:00:00.000Z'
    })
    .run()
  const pay = (amountMinor: number, currency: string, date: string) =>
    s.payments.create(owner, {
      reservationId,
      date,
      methodId: code(paymentMethods, 'cash'),
      amountMinor,
      currency,
      kind: 'payment'
    })
  return { s, code, category, pay }
}

/**
 * EUR payments with the market rate; EUR expenses (one owner-only), a GBP one with a typed rate and a USD one with
 * no rate yet (a payment always needs one: its folio amount is converted).
 */
async function foreignMonth() {
  const h = await hotel()
  h.pay(10_000, 'EUR', '2026-10-02')
  h.pay(20_000, 'EUR', '2026-10-03')
  h.pay(1_000_000, 'TRY', '2026-10-03')
  const expense = (section: string, amountMinor: number, currency: string, manualRateMicro?: number) =>
    h.s.expenses.createExpense(owner, {
      date: '2026-10-06',
      sectionId: h.code(expenseSections, section),
      amountMinor,
      currency,
      description: 'Yedek parça',
      ...(manualRateMicro ? { manualRateMicro } : {})
    })
  expense('general', 4_000, 'EUR')
  expense('general', 1_000, 'GBP', 60_000_000)
  expense('owner', 2_000, 'EUR')
  expense('general', 5_000, 'USD')
  return h
}

describe('raporlarda kur kaynağı (Faz 11 teslimat 5)', () => {
  it('dövizli satırlar kaynağa göre sayılır: piyasa kuru Truncgil, elle kur, kur yok; ana para birimi satırı sayılmaz', async () => {
    const { s } = await foreignMonth()
    const monthly = s.reports.monthly(owner, OCTOBER)
    expect(monthly.fxSources).toEqual([
      {
        kind: 'payment',
        source: 'market_mid',
        provider: 'truncgil',
        currency: 'EUR',
        rows: 2,
        amountMinor: 30_000,
        baseMinor: 1_500_000
      },
      {
        kind: 'expense',
        source: 'market_mid',
        provider: 'truncgil',
        currency: 'EUR',
        rows: 2,
        amountMinor: 6_000,
        baseMinor: 300_000
      },
      {
        kind: 'expense',
        source: 'manual',
        provider: null,
        currency: 'GBP',
        rows: 1,
        amountMinor: 1_000,
        baseMinor: 60_000
      },
      {
        kind: 'expense',
        source: 'none',
        provider: null,
        currency: 'USD',
        rows: 1,
        amountMinor: 5_000,
        baseMinor: 0
      }
    ])
    // The month-end check says the same; the expenses report has the expense rows only.
    expect(s.reports.monthEnd(owner, { year: 2026, month: 10 }).fxSources).toEqual(monthly.fxSources)
    expect(s.reports.expenses(owner, OCTOBER).fxSources).toEqual(
      monthly.fxSources.filter((r) => r.kind === 'expense')
    )
  })

  it('K-42: yöneticiye gizli bölümdeki dövizli gider kur kaynaklarında sayılmaz', async () => {
    const { s } = await foreignMonth()
    const eur = (rows: { kind: string; currency: string; rows: number }[]) =>
      rows.find((r) => r.kind === 'expense' && r.currency === 'EUR')?.rows
    expect(eur(s.reports.monthly(manager, OCTOBER).fxSources)).toBe(1)
    expect(eur(s.reports.monthEnd(manager, { year: 2026, month: 10 }).fxSources)).toBe(1)
    expect(eur(s.reports.expenses(manager, OCTOBER).fxSources)).toBe(1)
  })

  it('dövizli kayıt yoksa liste boştur', async () => {
    const h = await hotel()
    h.pay(1_000_000, 'TRY', '2026-10-03')
    expect(h.s.reports.monthly(owner, OCTOBER).fxSources).toEqual([])
  })

  it('Excel: "Kur kaynakları" sayfası kaynağı ve sağlayıcıyı yazar', async () => {
    const { s } = await foreignMonth()
    const file = await s.reports.export(owner, {
      report: 'monthly',
      format: 'xlsx',
      locale: 'tr',
      ...OCTOBER
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(file.base64, 'base64') as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Kur kaynakları')!
    expect(ws).toBeDefined()
    const rows: unknown[][] = []
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
    expect(rows[0]).toEqual([
      'Kayıt',
      'Para birimi',
      'Kur kaynağı',
      'Kaynak',
      'Kayıt sayısı',
      'Tutar (kendi para birimi)',
      'Ana para birimi karşılığı'
    ])
    expect(rows[1]?.slice(0, 5)).toEqual(['Gelir', 'EUR', 'Piyasa orta kuru', 'Truncgil', 2])
    expect(rows.some((r) => r[2] === 'Kur yok (toplamlara katılmadı)')).toBe(true)
    expect(rows.some((r) => r[2] === 'Elle girilen kur')).toBe(true)
    const csv = await s.reports.export(owner, {
      report: 'expenses',
      table: 'fxSources',
      format: 'csv',
      locale: 'en',
      ...OCTOBER
    })
    const text = Buffer.from(csv.base64, 'base64').toString('utf8')
    expect(text).toContain('Rate entered by hand')
    expect(text).not.toContain('Income')
  })
})

describe('raporlara tedarik giderleri kartı (Faz 12 teslimat 2)', () => {
  async function purchases() {
    const h = await hotel()
    const cleaning = h.category('cleaning')
    const drinks = h.category('drinks')
    const soap = h.s.supply.createProduct(owner, { name: 'Sıvı sabun', categoryId: cleaning, unit: 'piece' })
    const water = h.s.supply.createProduct(owner, { name: 'Damacana su', categoryId: drinks, unit: 'piece' })
    const buy = (
      section: string,
      date: string,
      amountMinor: number,
      currency: string,
      items: { productId: string; qtyMilli: number; unitPriceMinor: number }[]
    ) =>
      h.s.supply.recordPurchase(owner, {
        date,
        sectionId: h.code(expenseSections, section),
        amountMinor,
        currency,
        description: 'Market',
        items
      })
    // One slip with both categories, one with water only, one in EUR (market rate), one owner-only, one in USD
    // (no rate yet), one last month.
    buy('general', '2026-10-02', 100_000, 'TRY', [
      { productId: soap.id, qtyMilli: 2_000, unitPriceMinor: 30_000 },
      { productId: water.id, qtyMilli: 4_000, unitPriceMinor: 10_000 }
    ])
    buy('general', '2026-10-05', 26_000, 'TRY', [
      { productId: water.id, qtyMilli: 4_000, unitPriceMinor: 6_500 }
    ])
    buy('general', '2026-10-07', 1_000, 'EUR', [
      { productId: soap.id, qtyMilli: 1_000, unitPriceMinor: 1_000 }
    ])
    buy('owner', '2026-10-08', 50_000, 'TRY', [
      { productId: soap.id, qtyMilli: 1_000, unitPriceMinor: 50_000 }
    ])
    buy('general', '2026-10-09', 2_000, 'USD', [
      { productId: soap.id, qtyMilli: 1_000, unitPriceMinor: 2_000 }
    ])
    buy('general', '2026-09-28', 9_000, 'TRY', [
      { productId: water.id, qtyMilli: 1_000, unitPriceMinor: 9_000 }
    ])
    return { ...h, cleaning, drinks }
  }

  it('dönemin ürünlü alımları kategoriye göre ana para biriminde toplanır; kuru bilinmeyen alım ayrıca sayılır', async () => {
    const { s, cleaning, drinks } = await purchases()
    expect(s.reports.monthly(owner, OCTOBER).supply).toEqual({
      totalMinor: 60_000 + 50_000 + 50_000 + 40_000 + 26_000,
      purchases: 5,
      missingRate: 1,
      categories: [
        { categoryId: cleaning, totalMinor: 60_000 + 50_000 + 50_000, purchases: 3 },
        { categoryId: drinks, totalMinor: 40_000 + 26_000, purchases: 2 }
      ]
    })
  })

  it('K-42: yönetici gizli bölümdeki alımı görmez; tedarik yetkisi olmayan rol kartı almaz', async () => {
    const { s, cleaning } = await purchases()
    const m = s.reports.monthly(manager, OCTOBER).supply
    expect(m?.categories.find((c) => c.categoryId === cleaning)).toEqual({
      categoryId: cleaning,
      totalMinor: 60_000 + 50_000,
      purchases: 2
    })
    const noSupplies = ctxFromPermissions('u-qa1', 'dev', 'ipc', {
      ...defaultPermissions('manager'),
      supplies: 'none'
    })
    expect(s.reports.monthly(noSupplies, OCTOBER).supply).toBeNull()
  })

  it('Excel: "Tedarik giderleri" sayfası kategori, alım, tutar ve payı yazar; yetkisiz rolde sayfa yok', async () => {
    const { s } = await purchases()
    const file = await s.reports.export(owner, {
      report: 'monthly',
      format: 'xlsx',
      locale: 'tr',
      ...OCTOBER
    })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.from(file.base64, 'base64') as unknown as ArrayBuffer)
    const ws = wb.getWorksheet('Tedarik giderleri')!
    const rows: unknown[][] = []
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
    expect(rows[0]).toEqual(['Kategori', 'Alım', 'Tutar', 'Pay'])
    expect(rows[1]?.slice(1, 3)).toEqual([3, 1_600])
    const noSupplies = ctxFromPermissions('u-qa1', 'dev', 'ipc', {
      ...defaultPermissions('owner'),
      supplies: 'none'
    })
    const other = await s.reports.export(noSupplies, {
      report: 'monthly',
      format: 'xlsx',
      locale: 'tr',
      ...OCTOBER
    })
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(Buffer.from(other.base64, 'base64') as unknown as ArrayBuffer)
    expect(wb2.getWorksheet('Tedarik giderleri')).toBeUndefined()
  })
})
