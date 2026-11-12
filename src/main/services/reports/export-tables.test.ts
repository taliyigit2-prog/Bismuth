// Report files (faz-10 madde 8; kabul ölçütü: XLSX Türkçe karakterleri bozmaz): the workbook is read back and its
// sheets, headers and cells compared letter by letter; CSV keeps the UTF-8 mark Excel needs.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { expenseSections, paymentMethods, roomTypes, salesChannels } from '../../db/schema'
import { createServices } from '..'

const owner = roleCtx('owner')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const OCTOBER = { from: '2026-10-01', to: '2026-11-01' }
const TURKISH = 'Çamaşır suyu, ığdır şişe — İŞĞÜÖÇ'

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function hotel(saveFile?: (name: string, bytes: Buffer) => Promise<string | null>) {
  handle = await seededDatabase()
  const s = createServices(handle, runtime, {
    clock: testClock('2026-10-20T09:00:00.000Z'),
    saveExport: saveFile
  })
  const id = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    t: T,
    c: string
  ) => handle.db.select().from(t).where(eq(t.code, c)).get()!.id
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const room = s.rooms.createRoom(owner, {
    number: '101',
    roomTypeId: typeId,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const res = s.reservations.create(owner, {
    guest: { firstName: 'Şükrü', lastName: 'Güçlü' },
    channelId: id(salesChannels, 'direct'),
    stays: [{ roomId: room.id, checkIn: '2026-10-02', checkOut: '2026-10-04', nightlyPriceMinor: 250_000 }]
  })
  s.payments.create(owner, {
    reservationId: res.reservation.id,
    date: '2026-10-02',
    methodId: id(paymentMethods, 'cash'),
    amountMinor: 500_000,
    currency: 'TRY',
    kind: 'payment'
  })
  s.expenses.createExpense(owner, {
    date: '2026-10-05',
    sectionId: id(expenseSections, 'general'),
    amountMinor: 12_345,
    currency: 'TRY',
    description: TURKISH
  })
  return s
}

async function sheets(base64: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer)
  return wb
}

const texts = (ws: ExcelJS.Worksheet): string[] => {
  const out: string[] = []
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.text))))
  return out
}

describe('rapor dosyaları (CSV/XLSX)', () => {
  it('aylık özet Excel dosyası geri okununca Türkçe harfler aynen durur', async () => {
    const s = await hotel()
    const file = await s.reports.export(owner, {
      report: 'monthly',
      format: 'xlsx',
      locale: 'tr',
      ...OCTOBER
    })
    expect(file).toMatchObject({ delivery: 'download', savedPath: null })
    expect(file.fileName).toBe('Özet raporu 2026-10-01_2026-10-31.xlsx')
    const wb = await sheets(file.base64)
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Gelir detayları',
      'Satış kanalları',
      'Günlük ciro',
      'Gider bölümleri',
      'En çok harcama',
      'Sahip giderleri'
    ])
    const top = wb.getWorksheet('En çok harcama')!
    expect(texts(top).slice(0, 4)).toEqual(['Kalem', 'Tür', 'Tutar', 'Pay'])
    expect(texts(top)).toContain(TURKISH)
    expect(top.getRow(2).getCell(3).value).toBe(123.45)
    const daily = wb.getWorksheet('Günlük ciro')!
    expect(daily.getRow(2).getCell(2).value).toBe(5000)
    expect(daily.getRow(2).getCell(2).numFmt).toBe('"₺"#,##0.00')
  })

  it('tek tablo CSV: UTF-8 işareti, noktalı virgül, Türkçe başlık ve açıklama', async () => {
    const s = await hotel()
    const file = await s.reports.export(owner, {
      report: 'expenses',
      table: 'top',
      format: 'csv',
      locale: 'tr',
      ...OCTOBER
    })
    const text = Buffer.from(file.base64, 'base64').toString('utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain('Kalem;Tür;Tutar;Pay')
    expect(text).toContain(TURKISH)
    expect(file.fileName).toBe('En çok harcama 2026-10-01_2026-10-31.csv')
  })

  it('Rusça başlıklar ve yıllık tablo; doluluk tabloları sayıları sayı olarak yazar', async () => {
    const s = await hotel()
    const yearly = await sheets(
      (await s.reports.export(owner, { report: 'yearly', years: [2026], format: 'xlsx', locale: 'ru' }))
        .base64
    )
    expect(texts(yearly.worksheets[0]!).slice(0, 5)).toEqual([
      'Год',
      'Месяц',
      'Выручка',
      'Расходы',
      'Прибыль'
    ])
    const occ = await sheets(
      (await s.reports.export(owner, { report: 'occupancy', format: 'xlsx', locale: 'tr', ...OCTOBER }))
        .base64
    )
    const rooms = occ.getWorksheet('Odaya göre')!
    expect(rooms.getRow(2).getCell(1).value).toBe('101')
    expect(rooms.getRow(2).getCell(2).value).toBe(2)
  })

  it('programın penceresinde "Farklı kaydet" ile yazılır; vazgeçilirse dosya oluşmaz', async () => {
    const saved: string[] = []
    const s = await hotel(async (name) => {
      saved.push(name)
      return saved.length === 1 ? `/tmp/${name}` : null
    })
    const first = await s.reports.export(owner, {
      report: 'monthEnd',
      year: 2026,
      month: 10,
      format: 'xlsx',
      locale: 'tr'
    })
    expect(first).toMatchObject({
      delivery: 'saved',
      base64: '',
      savedPath: '/tmp/Ay sonu kontrolü 2026-10.xlsx'
    })
    const second = await s.reports.export(owner, {
      report: 'monthEnd',
      year: 2026,
      month: 10,
      format: 'xlsx',
      locale: 'tr'
    })
    expect(second.delivery).toBe('canceled')
  })

  it('bilinmeyen tablo ve CSV için tablo seçilmemesi doğrulama hatasıdır', async () => {
    const s = await hotel()
    await expect(
      s.reports.export(owner, { report: 'cash', table: 'yok', format: 'csv', locale: 'tr', ...OCTOBER })
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(
      s.reports.export(owner, { report: 'cash', format: 'csv', locale: 'tr', ...OCTOBER })
    ).rejects.toMatchObject({ code: 'VALIDATION' })
  })
})
