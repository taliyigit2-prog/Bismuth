// QA2x (G-122 "tüm tablolar", S-43): the tables the first export list left out — rooms and their history, room
// blocks, cash and shift handovers, board notes, calendar days, exchange rates, laundry prices and settlements,
// product categories, imports, charges, reservation notes, ledger days, employment periods. Each one comes out
// with its rows and titles in the person's language, follows the screen's permission, keeps K-42's partial view
// of the drawer and never carries anyone's personal note. All services wired as in the program; names and
// amounts are invented.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { ExportDataset } from '@shared/contract/backup'
import type { AppLocale } from '@shared/format'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import { tempDataDir } from '../../../tests/factories/runtime'
import type { DatabaseHandle } from '../db/client'
import {
  expenses,
  expenseSections,
  laundryItemTypes,
  paymentMethods,
  roomTypes,
  salesChannels
} from '../db/schema'
import { createServices } from '.'
import type { Ctx } from './context'
import { DATASETS, datasetOf } from './data-transfer/export-catalog'
import { translator } from './data-transfer/labels'

const owner = roleCtx('owner', 'u-owner')
const manager = roleCtx('manager', 'u-manager')

/** The datasets this package added (QA2x). */
const ADDED: readonly ExportDataset[] = [
  'folioCharges',
  'reservationNotes',
  'roomTypes',
  'rooms',
  'roomCapacity',
  'roomBlocks',
  'cashHandovers',
  'ledgerDays',
  'employmentPeriods',
  'shiftHandovers',
  'boardNotes',
  'calendarDays',
  'fxRates',
  'laundryPrices',
  'laundrySettlements',
  'productCategories',
  'importBatches'
]

let handle: DatabaseHandle | undefined
let dir: string | undefined
afterEach(() => {
  handle?.close()
  handle = undefined
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

async function setup() {
  handle = await seededDatabase()
  dir = tempDataDir()
  const db = handle.db
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const svc = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: dir, electron: null, chrome: null },
    { clock, attachmentsDir: join(dir, 'attachments') }
  )
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => db.select().from(table).where(eq(table.code, c)).get()!.id
  const standard = db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = svc.rooms.createRoom(owner, {
    number: '301',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const booking = svc.reservations.create(owner, {
    guest: { firstName: 'Deniz', lastName: 'Yıldırım' },
    channelId: code(salesChannels, 'booking'),
    stays: [{ roomId: room.id, checkIn: '2026-10-03', checkOut: '2026-10-06', nightlyPriceMinor: 250_000 }]
  })
  const pay = (amountMinor: number) =>
    svc.payments.create(owner, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: code(paymentMethods, 'cash'),
      amountMinor,
      currency: 'TRY'
    })
  const spend = (amountMinor: number, description: string, section = code(expenseSections, 'general')) =>
    svc.expenses.createExpense(owner, {
      date: '2026-10-04',
      sectionId: section,
      amountMinor,
      currency: 'TRY',
      description,
      paidFromDrawer: section === code(expenseSections, 'general')
    })
  const text = async (ctx: Ctx, dataset: ExportDataset, locale: AppLocale = 'tr', range = {}) => {
    const file = await svc.dataExport.run(ctx, { dataset, format: 'csv', locale, ...range })
    return { ...file, csv: Buffer.from(file.base64, 'base64').toString('utf8') }
  }
  return { db, clock, svc, code, room, booking, pay, spend, text }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** One row (at least) in every added table. */
async function fillEverything(s: Setup) {
  const { svc, room, booking } = s
  svc.reservations.addNote(owner, booking.reservation.id, 'Geç gelecek', '2026-10-03')
  const corporate = svc.statusTags.createCustom(owner, { name: 'Firma misafiri', color: '#7c3aed' })
  svc.reservations.update(owner, booking.reservation.id, { tagIds: [corporate.id] })
  svc.rooms.createBlock(owner, {
    roomId: room.id,
    dateFrom: '2026-10-10',
    dateTo: '2026-10-12',
    kind: 'oos',
    reason: 'Boya'
  })
  s.pay(300_000)
  s.spend(40_000, 'Market')
  svc.shifts.saveHandover(owner, { text: 'Kapı kartı 301 yenilendi' })
  svc.payments.handover(owner, { upToDate: '2026-10-04' })
  svc.ledger.setDayNote(owner, '2026-10-04', 'Sakin bir gün')
  svc.staff.createEmployee(owner, {
    firstName: 'Selin',
    lastName: 'Kaya',
    position: 'Resepsiyon',
    startDate: '2026-01-01',
    salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
  })
  svc.shifts.addNote(owner, { kind: 'board', text: 'Herkese duyuru: asansör bakımı' })
  svc.calendar.addNote(owner, {
    kind: 'special',
    title: 'Fuar haftası',
    target: { mode: 'single', date: '2026-10-08' }
  })
  svc.currency.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 49_250_000, source: 'hotel' })
  const laundry = svc.contacts.create(owner, { name: 'Örnek Çamaşırhane', category: 'laundry' })
  const sheet = s.db.select().from(laundryItemTypes).get()!.id
  svc.laundry.setPrice(owner, {
    contactId: laundry.id,
    itemTypeId: sheet,
    validFrom: '2026-09-01',
    unitPriceMinor: 1_000
  })
  svc.laundry.recordDelivery(owner, {
    date: '2026-09-10',
    direction: 'out',
    contactId: laundry.id,
    items: [{ itemTypeId: sheet, qty: 10 }]
  })
  svc.laundry.settle(owner, { contactId: laundry.id, year: 2026, month: 9, invoicedTotalMinor: 10_000 })
  const csv = 'Tarih;Ücret;Birim;İsim;Ödeme Yöntemi\n02.10.2026;100;TL;Deneme Gelir;Nakit\n'
  await svc.dataImport.run(owner, {
    template: 'ledgerRows',
    fileName: 'defter-ekim.csv',
    contentBase64: Buffer.from(csv, 'utf8').toString('base64')
  })
}

describe('dışa aktarmada eksik tablolar (G-122, S-43; QA2x)', () => {
  it('her yeni tablo en az bir satırla, başlıkları dosyanın dilinde dışa aktarılır', async () => {
    const s = await setup()
    await fillEverything(s)
    const listed = new Map(s.svc.dataExport.datasets(owner).map((d) => [d.id, d.rows]))
    for (const locale of ['tr', 'en', 'ru'] as const) {
      const t = translator(locale)
      for (const id of ADDED) {
        const file = await s.text(owner, id, locale)
        expect(file.rows, `${id} ${locale}`).toBeGreaterThan(0)
        expect(file.fileName).toBe(
          `${t(`dataTransfer.dataset.${id}`)} 2026-10-04.csv`.replace(/[\\/:*?"<>|]/g, '-')
        )
        const header = file.csv.split('\r\n')[0]!
        for (const col of datasetOf(id).columns) {
          const title = t(col.label)
          expect(title, `${id}.${col.key} ${locale}`).not.toBe(col.label)
          expect(header).toContain(title)
        }
        // The row count next to the name is the count of what the file holds (B20).
        if (locale === 'tr') expect(listed.get(id), id).toBe(file.rows)
      }
    }
    const tr = (id: ExportDataset) => s.text(owner, id, 'tr').then((f) => f.csv)
    expect(await tr('reservationNotes')).toContain('Geç gelecek')
    expect(await tr('roomBlocks')).toContain('301;10.10.2026;11.10.2026;Satılmaz;Boya')
    expect(await tr('ledgerDays')).toContain('Sakin bir gün')
    expect(await tr('shiftHandovers')).toContain('Kapı kartı 301 yenilendi')
    expect(await tr('calendarDays')).toContain('08.10.2026;Özel gün;Fuar haftası')
    expect(await tr('fxRates')).toContain('EUR;TRY;49,25;Otel kuru')
    expect(await tr('importBatches')).toContain('Defter (günlük satırlar);defter-ekim.csv')
    expect(await tr('folioCharges')).toContain('Gece ücreti')
    // The reservation's own colour tags travel with it (reservation_tags).
    expect(await tr('reservations')).toContain('Firma misafiri')
    expect((await s.text(owner, 'fxRates', 'ru')).csv.split('\r\n')[0]).toContain('Курс (за 1 единицу)')
    expect((await s.text(owner, 'roomBlocks', 'en')).csv).toContain('Not for sale')
  })

  it('G4: güvence bedeli, maaş dönemi, maaş kuralı ve liste tabloları da dosyaya çıkar; başlıklar üç dilde çevrilmiştir', async () => {
    const s = await setup()
    const ids: ExportDataset[] = [
      'damageDeposits',
      'salaryPeriods',
      'payPolicies',
      'paymentMethods',
      'salesChannels',
      'extraServices',
      'statusTags'
    ]
    for (const locale of ['tr', 'en', 'ru'] as const) {
      const t = translator(locale)
      for (const id of ids) {
        const file = await s.text(owner, id, locale)
        const header = file.csv.split('\r\n')[0]!
        expect(t(`dataTransfer.dataset.${id}`)).not.toBe(`dataTransfer.dataset.${id}`)
        for (const col of datasetOf(id).columns) {
          expect(t(col.label), `${id}.${col.key} ${locale}`).not.toBe(col.label)
          expect(header).toContain(t(col.label))
        }
      }
    }
    expect((await s.text(owner, 'paymentMethods')).rows).toBeGreaterThan(0)
    expect((await s.text(owner, 'salesChannels')).csv).toContain('booking')
  })

  it('"Tüm tablolar" XLSX dosyası yeni tabloları da ayrı sayfa olarak içerir; kur sayı olarak yazılır', async () => {
    const s = await setup()
    await fillEverything(s)
    const all = await s.svc.dataExport.run(owner, { dataset: 'all', format: 'xlsx', locale: 'tr' })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(new Uint8Array(Buffer.from(all.base64, 'base64')).buffer)
    const names = book.worksheets.map((w) => w.name)
    expect(names).toHaveLength(DATASETS.length)
    const t = translator('tr')
    for (const id of ADDED) expect(names).toContain(t(`dataTransfer.dataset.${id}`))
    const fx = book.getWorksheet('Kur geçmişi')!
    const header = (fx.getRow(1).values as unknown[]).slice(1)
    const rate = fx.getRow(2).getCell(header.indexOf('Kur (1 birim)') + 1)
    expect(rate.value).toBe(49.25)
    expect(rate.numFmt).toBe('#,##0.00####')
  })

  it('K-42: Sahip bölümü ve personel parası görmeyen rolün kasa teslimi ve vardiya devri dosyasında gizli tutar yok', async () => {
    const s = await setup()
    s.pay(300_000)
    s.spend(40_000, 'Market')
    // K-42 (1): the owner's section is no longer paid from the drawer; a row written before that (old data) must
    // still stay out of every figure a partial view exports.
    const old = s.spend(100_000, 'Sahip kişisel', s.code(expenseSections, 'owner'))
    s.db.update(expenses).set({ paidFromDrawer: true }).where(eq(expenses.id, old.id)).run()
    s.svc.shifts.saveHandover(owner, { text: 'Devir' })
    s.svc.payments.handover(owner, { upToDate: '2026-10-04' })

    const full = (await s.text(owner, 'cashHandovers')).csv
    expect(full).toContain('₺1.600,00')
    const partial = await s.text(manager, 'cashHandovers')
    expect(partial.rows).toBe(1)
    expect(partial.csv).toContain(';₺2.600,00;1;1;') // drawer without the hidden row; 1 income, 1 expense row
    expect(partial.csv).not.toContain('₺1.600,00')
    expect(partial.csv).not.toContain('Sahip kişisel')
    const shift = (await s.text(manager, 'shiftHandovers')).csv
    expect(shift).toContain('₺2.600,00')
    expect(shift).not.toContain('₺1.600,00')
    expect((await s.text(owner, 'shiftHandovers')).csv).toContain('₺1.600,00')
  })

  it('kişisel not (kendime not) hiçbir dosyada yok; pano notu kendi tablosunda', async () => {
    const s = await setup()
    await fillEverything(s)
    s.svc.shifts.addNote(owner, { kind: 'personal', text: 'Gizli kişisel hatırlatma' })
    s.svc.shifts.addNote(manager, { kind: 'personal', text: 'Müdürün kendi notu' })
    expect(s.svc.dataExport.datasets(owner).find((d) => d.id === 'boardNotes')?.rows).toBe(1)
    const board = (await s.text(owner, 'boardNotes')).csv
    expect(board).toContain('Herkese duyuru: asansör bakımı')
    const all = await s.svc.dataExport.run(owner, { dataset: 'all', format: 'xlsx', locale: 'tr' })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(new Uint8Array(Buffer.from(all.base64, 'base64')).buffer)
    const cells: string[] = []
    book.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value)))))
    expect(cells.join('\n')).toContain('Herkese duyuru')
    expect(cells.join('\n')).not.toContain('Gizli kişisel hatırlatma')
    expect(cells.join('\n')).not.toContain('Müdürün kendi notu')
    for (const id of DATASETS.map((d) => d.id)) {
      const csv = (await s.text(owner, id)).csv
      expect(csv, id).not.toContain('Gizli kişisel hatırlatma')
    }
  })

  it('tarih aralığı: oda bloğu [ilk gün, boş gün) gibi süzülür; kur ve teslimler otelin gününe göre', async () => {
    const s = await setup()
    await fillEverything(s)
    const range = (from: string, to: string) => ({ from, to })
    // The block covers the 10th and 11th; the 12th is free again.
    expect((await s.text(owner, 'roomBlocks', 'tr', range('2026-10-12', '2026-10-20'))).rows).toBe(0)
    expect((await s.text(owner, 'roomBlocks', 'tr', range('2026-10-11', '2026-10-20'))).rows).toBe(1)
    expect((await s.text(owner, 'roomBlocks', 'tr', range('2026-10-01', '2026-10-09'))).rows).toBe(0)
    expect((await s.text(owner, 'calendarDays', 'tr', range('2026-10-08', '2026-10-08'))).csv).toContain(
      'Fuar haftası'
    )
    expect((await s.text(owner, 'fxRates', 'tr', range('2026-10-05', '2026-10-06'))).rows).toBe(0)
    expect((await s.text(owner, 'cashHandovers', 'tr', range('2026-10-04', '2026-10-04'))).rows).toBe(1)
    expect((await s.text(owner, 'laundrySettlements', 'tr', range('2026-10-01', '2026-10-31'))).rows).toBe(0)
    expect((await s.text(owner, 'laundrySettlements', 'tr', range('2026-09-15', '2026-10-31'))).rows).toBe(1)
  })
})
