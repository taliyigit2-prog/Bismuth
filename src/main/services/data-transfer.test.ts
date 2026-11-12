import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'
import { eq, isNotNull } from 'drizzle-orm'
import { EXPORT_DATASETS } from '@shared/contract/backup'
import { addDays, type LocalDate } from '@shared/date'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  expenses,
  paymentMethods,
  payments,
  reservations,
  roomNights,
  roomTypes,
  salesChannels,
  stayOccupants
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createDataExportService } from './data-export-service'
import { createDataImportService } from './data-import-service'
import { createExpensesService } from './expenses-service'
import { createGuestsService } from './guests-service'
import { createListsService } from './lists-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createTasksService } from './tasks-service'

const owner = roleCtx('owner', 'u-owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

/** The 19 rooms of the first hotel (02-excel-analizi.md §2.1). */
const ROOMS = ['101', '102', '103', '104', '201', '202', '203', '204', '301', '302', '303', '304'].concat([
  '401',
  '402',
  '403',
  '404',
  '501',
  '502',
  '503'
])

async function setup(start = '2026-10-01T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(start)
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  for (const n of ROOMS)
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const res = createReservationsService(deps)
  const pay = createPaymentsService(deps)
  const exp = createExpensesService(deps)
  const out = createDataExportService(deps)
  const imp = createDataImportService({ ...deps, reservations: res, payments: pay, expenses: exp })
  const id = (table: typeof salesChannels | typeof paymentMethods, code: string) =>
    handle.db.select().from(table).where(eq(table.code, code)).get()!.id
  const roomId = (n: string) => roomsSvc.listRooms(owner).find((r) => r.number === n)!.id
  return {
    clock,
    res,
    pay,
    exp,
    out,
    imp,
    id,
    roomId,
    guests: createGuestsService(deps),
    lists: createListsService(deps)
  }
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')

describe('dışa aktarma (G-122, S-43)', () => {
  it('XLSX Türkçe başlık ve harfleri korur, tutar ₺2.500,00 biçiminde sayıdır; CSV aynı metni yazar', async () => {
    const s = await setup()
    const r = s.res.create(owner, {
      guest: { firstName: 'Çağrı', lastName: 'Işıkoğlu' },
      channelId: s.id(salesChannels, 'direct'),
      stays: [
        { roomId: s.roomId('101'), checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 250_000 }
      ]
    })
    s.pay.create(owner, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: s.id(paymentMethods, 'cash'),
      amountMinor: 250_000,
      currency: 'TRY'
    })
    const file = await s.out.run(owner, { dataset: 'ledgerIncome', format: 'xlsx', locale: 'tr' })
    expect(file.fileName).toBe('Defter gelirleri 2026-10-01.xlsx')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(Buffer.from(file.base64, 'base64')).buffer)
    const ws = wb.worksheets[0]!
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    expect(header.slice(0, 3)).toEqual(['Tarih', 'Rezervasyon / satış', 'Misafir'])
    const row = ws.getRow(2)
    const col = (title: string) => header.indexOf(title) + 1
    expect(row.getCell(col('Misafir')).value).toBe('Çağrı Işıkoğlu')
    const amount = row.getCell(col('Tutar'))
    expect(amount.value).toBe(2500)
    expect(amount.numFmt).toBe('"₺"#,##0.00')
    expect(row.getCell(col('Tarih')).value).toEqual(new Date(Date.UTC(2026, 9, 1)))
    expect(row.getCell(col('Tarih')).numFmt).toBe('dd.mm.yyyy')

    const csv = Buffer.from(
      (await s.out.run(owner, { dataset: 'ledgerIncome', format: 'csv', locale: 'tr' })).base64,
      'base64'
    ).toString('utf8')
    expect(csv.startsWith('﻿Tarih;')).toBe(true)
    expect(csv).toContain('01.10.2026;R-2026-000001;Çağrı Işıkoğlu;')
    expect(csv).toContain('₺2.500,00')
    const en = Buffer.from(
      (await s.out.run(owner, { dataset: 'ledgerIncome', format: 'csv', locale: 'en' })).base64,
      'base64'
    ).toString('utf8')
    expect(en).toContain('"₺2,500.00"')
    // Every table the role sees, as sheets of one workbook; the export is in the audit log.
    const all = await s.out.run(owner, { dataset: 'all', format: 'xlsx', locale: 'tr' })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(new Uint8Array(Buffer.from(all.base64, 'base64')).buffer)
    expect(book.worksheets.length).toBe(EXPORT_DATASETS.length)
    expect(book.worksheets.map((w) => w.name)).toContain('Misafirler')
    expect(
      handle.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'export'))
        .all()
        .map((a) => a.entityId)
    ).toEqual(['export:ledgerIncome', 'export:ledgerIncome', 'export:ledgerIncome', 'export:all'])
  })

  it('programın penceresinde dosyayı "Farklı kaydet" yazar; vazgeçilirse hiçbir şey yazılmaz ve kaydedilmez', async () => {
    const s = await setup()
    const written: { name: string; bytes: Buffer }[] = []
    let answer: string | null = '/belgeler/defter.xlsx'
    const local = createDataExportService({
      ...depsOf(handle, s.clock),
      saveFile: async (name, bytes) => {
        written.push({ name, bytes })
        return answer
      }
    })
    const saved = await local.run(owner, { dataset: 'guests', format: 'xlsx', locale: 'tr' })
    expect(saved).toMatchObject({ delivery: 'saved', savedPath: '/belgeler/defter.xlsx', base64: '' })
    expect(written[0]?.name).toBe('Misafirler 2026-10-01.xlsx')
    expect(written[0]?.bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    answer = null
    expect(await local.run(owner, { dataset: 'guests', format: 'csv', locale: 'tr' })).toMatchObject({
      delivery: 'canceled',
      savedPath: null
    })
    expect(handle.db.select().from(auditLog).where(eq(auditLog.action, 'export')).all()).toHaveLength(1)
    // A phone or browser (HTTP) gets the bytes even when the dialog exists.
    const remote = ctxFromPermissions('u-owner', 'd', 'http', defaultPermissions('owner'))
    expect((await local.run(remote, { dataset: 'guests', format: 'csv', locale: 'tr' })).delivery).toBe(
      'download'
    )
  })

  it('kimlik no yalnız kimlik yetkisi olan rolde çıkar; yetkisiz tablo listede yoktur', async () => {
    const s = await setup()
    s.guests.create(owner, {
      firstName: 'Deneme',
      lastName: 'Yolcu',
      idDocType: 'passport',
      idDocNumber: 'U1234567'
    })
    const asCsv = async (ctx: ReturnType<typeof roleCtx>) =>
      Buffer.from(
        (await s.out.run(ctx, { dataset: 'guests', format: 'csv', locale: 'tr' })).base64,
        'base64'
      ).toString('utf8')
    expect(await asCsv(owner)).toContain('U1234567')
    const accountant = roleCtx('accountant')
    const hidden = await asCsv(accountant)
    expect(hidden).not.toContain('U1234567')
    expect(hidden.split('\r\n')[0]).not.toContain('Kimlik no')
    expect(s.out.datasets(accountant).find((d) => d.id === 'guests')).toMatchObject({ sensitiveHidden: true })
    // The accountant sees no overtime hours and no in-house list.
    expect(s.out.datasets(accountant).map((d) => d.id)).not.toContain('workHours')
    await expect(
      s.out.run(accountant, { dataset: 'workHours', format: 'csv', locale: 'tr' })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
  })

  it('misafir satır sayısı birleştirilmiş kartları saymaz: listedeki sayı dosyadakiyle aynıdır (P14fix #15)', async () => {
    const s = await setup()
    const a = s.guests.create(owner, { firstName: 'Deneme', lastName: 'Bir' })
    const b = s.guests.create(owner, { firstName: 'Deneme', lastName: 'Biir' })
    s.guests.merge(owner, a.id, b.id)
    const listed = s.out.datasets(owner).find((d) => d.id === 'guests')!.rows
    const file = await s.out.run(owner, { dataset: 'guests', format: 'csv', locale: 'tr' })
    expect(listed).toBe(file.rows)
    expect(listed).toBe(1)
  })

  it('tarih aralığı konaklamada [giriş, çıkış): aralığın ilk günü çıkan konaklama alınmaz; kişiler de aynı süzgeçten geçer (P14fix #16)', async () => {
    const s = await setup()
    const stay = (room: string, checkIn: string, checkOut: string, name: string) =>
      s.res.create(owner, {
        guest: { firstName: 'Deneme', lastName: name },
        channelId: s.id(salesChannels, 'direct'),
        stays: [{ roomId: s.roomId(room), checkIn, checkOut, nightlyPriceMinor: 100_000 }]
      })
    stay('101', '2026-10-01', '2026-10-05', 'Biten') // leaves on the 5th: no night in the range
    stay('102', '2026-10-03', '2026-10-07', 'Suren') // started before, still in
    stay('103', '2026-10-05', '2026-10-05', 'Gunluk') // same-day stay on the first day
    const rows = async (dataset: 'reservations' | 'occupants') =>
      Buffer.from(
        (
          await s.out.run(owner, {
            dataset,
            format: 'csv',
            locale: 'tr',
            from: '2026-10-05',
            to: '2026-10-06'
          })
        ).base64,
        'base64'
      ).toString('utf8')
    const reservationsCsv = await rows('reservations')
    expect(reservationsCsv).not.toContain('Biten')
    expect(reservationsCsv).toContain('Suren')
    expect(reservationsCsv).toContain('Gunluk')
    const occupantsCsv = await rows('occupants')
    expect(occupantsCsv).not.toContain('Biten')
    expect(occupantsCsv).toContain('Suren')
    expect(occupantsCsv).toContain('Gunluk')
  })

  it('misafir dosyasında etiketler liste sırasıyla tek sütunda (G-50, K-46)', async () => {
    const s = await setup()
    const g = s.guests.create(owner, { firstName: 'Deneme', lastName: 'Etiketli' })
    const regular = s.lists.create(owner, { kind: 'guestTags', name: 'Düzenli' }).id
    const vip = s.lists.create(owner, { kind: 'guestTags', name: 'Firma misafiri' }).id
    s.guests.setTags(owner, { id: g.id, tagIds: [vip, regular] })
    const csv = Buffer.from(
      (await s.out.run(owner, { dataset: 'guests', format: 'csv', locale: 'tr' })).base64,
      'base64'
    ).toString('utf8')
    expect(csv).toContain('Düzenli, Firma misafiri')
  })

  it('odadaki kişiler dosyasına tanıtıcı not girmez (03-mimari §4.9-13, K-46)', async () => {
    const s = await setup()
    s.res.create(owner, {
      guest: { firstName: 'Deneme', lastName: 'Kisi' },
      channelId: s.id(salesChannels, 'direct'),
      stays: [
        { roomId: s.roomId('101'), checkIn: '2026-10-05', checkOut: '2026-10-07', nightlyPriceMinor: 100_000 }
      ]
    })
    handle.db.update(stayOccupants).set({ descriptorNote: 'Kirmizi sapkali' }).run()
    const csv = Buffer.from(
      (await s.out.run(owner, { dataset: 'occupants', format: 'csv', locale: 'tr' })).base64,
      'base64'
    ).toString('utf8')
    expect(csv).toContain('Kisi')
    expect(csv).not.toContain('Kirmizi sapkali')
    expect(csv).not.toContain('Tanıtıcı')
  })

  it('zamanı olan tablolarda tarih süzgeci otelin gününe göredir: 22:30 UTC İstanbul’da ertesi gündür (P14fix #14)', async () => {
    const s = await setup('2026-10-04T22:30:00.000Z')
    createTasksService(depsOf(handle, s.clock)).createTask(owner, { title: 'Gece görevi' })
    const tasksOn = async (day: string) =>
      (await s.out.run(owner, { dataset: 'tasks', format: 'csv', locale: 'tr', from: day, to: day })).rows
    expect(await tasksOn('2026-10-05')).toBe(1)
    expect(await tasksOn('2026-10-04')).toBe(0)
  })
})

/** The owner's reservation sheet: a row per room, a column per day of October; three-night stays. */
function gridCsv(days = 30): string {
  const dates = Array.from({ length: days }, (_, i) => addDays('2026-10-01' as LocalDate, i))
  const head = [
    'ODA NO',
    'ODA ÖZELLİĞİ',
    ...dates.map((d) => `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(0, 4)}`)
  ]
  const lines = [head.join(';')]
  for (const room of ROOMS) {
    const cells = dates.map((_, i) => `DENEME ${room} K${Math.floor(i / 3)} (${2000 + Number(room)} TL)`)
    lines.push([room, 'Standard', ...cells].join(';'))
  }
  return lines.join('\r\n')
}

/** The owner's ledger: income and expense columns side by side, one day per 10 rows. */
function ledgerCsv(): string {
  const lines = ['Tarih;Kasa;Ücret;Birim;İsim;Ödeme Yöntemi;Oda;Platform;Kasa;Gider;Birim;Gider Açıklaması']
  for (let i = 0; i < 100; i++) {
    const day = String(1 + Math.floor(i / 10)).padStart(2, '0')
    const income = i % 10 < 7
    lines.push(
      income
        ? `${day}.10.2026;${i % 2 ? 'x' : ''};2.500;${i % 3 ? 'TL' : 'Euro'};Deneme Gelir ${i};${['Nakit', 'Kredi Kartı', 'İban'][i % 3]};10${1 + (i % 4)};${i % 4 ? '---' : 'Booking'};;;;`
        : `${day}.10.2026;;;;;;;;${i % 2 ? 'x' : ''};1.250,50;TL;Deneme gider ${i}`
    )
  }
  return lines.join('\n')
}

describe('içe aktarma sihirbazı (G-123, K-30)', () => {
  it('19 oda × 30 gün rezervasyon tablosu hatasız içe alınır: ardışık günler tek konaklama olur', async () => {
    const s = await setup()
    const input = {
      template: 'reservationGrid' as const,
      fileName: 'Rezervasyon 2026 Ekim.csv',
      contentBase64: b64(gridCsv())
    }
    const preview = await s.imp.preview(owner, input)
    expect(preview).toMatchObject({
      headerRow: 1,
      mapping: { room: 0, firstDay: 2 },
      errorCount: 0,
      recordCount: 190
    })
    expect(preview.records[0]).toMatchObject({
      kind: 'stay',
      date: '2026-10-01',
      until: '2026-10-04',
      room: '101',
      name: 'Deneme 101 K0',
      amountMinor: 3 * 210_100,
      currency: 'TRY'
    })
    const report = await s.imp.run(owner, input)
    expect(report).toMatchObject({ reservations: 190, nights: 570, errorCount: 0, guestsCreated: 190 })
    expect(handle.db.select().from(roomNights).all()).toHaveLength(570)
    // The same file again: every stay was taken in already (P14fix #2) — skipped, nothing is doubled.
    const again = await s.imp.run(owner, input)
    expect(again).toMatchObject({ reservations: 0, skipped: 190, errorCount: 0, batchId: null })
    expect(handle.db.select().from(roomNights).all()).toHaveLength(570)
  }, 90_000)

  it('hatalı satırlar raporlanır, sağlamlar alınır; isimler düzeltilir, olası tekrarlar işaretlenir', async () => {
    const s = await setup('2026-11-15T09:00:00.000Z')
    s.guests.create(owner, { firstName: 'Gadir', lastName: 'Garibov' })
    const csv = [
      'ODA NO;1 (cts);2;3;4;TOPLAM',
      '101;GADİR GADİROV (2000 TL);GADİR GADİROV (2000 TL);;Ali Kaya (35 euro);',
      '999;Bilinmeyen Oda (1000 TL);;;;',
      '102;Ayşe Demir (25x0 TL);;SEBAHATTİN SEVEN (2500 TL);SEBAHATTİN SEVEN (2500 TL) sonra Serdar Işık (2500 TL);',
      '103;SATILMAZ;SATILMAZ;(1500 TL);Fiyatsız Misafir;',
      '104;Ali (100 TL);Ali (200 EURO);;;'
    ].join('\n')
    const input = {
      template: 'reservationGrid' as const,
      fileName: 'ekim.csv',
      contentBase64: b64(csv),
      month: '2026-10'
    }
    const preview = await s.imp.preview(owner, input)
    expect(preview.errors.map((e) => [e.row, e.code])).toEqual([
      [1, 'badDate'],
      [3, 'unknownRoom'],
      [4, 'badAmount'],
      [5, 'emptyName'],
      [5, 'noPrice'],
      [6, 'mixedCurrency']
    ])
    expect(preview.blockedCells).toBe(2)
    expect(preview.duplicates).toContainEqual({ name: 'Gadir Gadirov', similar: ['Gadir Garibov'] })
    const report = await s.imp.run(owner, input)
    // Gadir (2 nights), Ali (1 night, EUR), Sebahattin (night of the 3rd, leaves on the 4th), Serdar (the 4th).
    expect(report).toMatchObject({ reservations: 4, nights: 5 })
    const ali = handle.db.select().from(roomNights).where(eq(roomNights.currency, 'EUR')).all()
    expect(ali).toEqual([expect.objectContaining({ date: '2026-10-04', priceMinor: 3_500 })])
    // October is over on 15 November: imported stays are closed as checked out.
    expect(
      new Set(
        handle.db
          .select()
          .from(reservations)
          .all()
          .map((r) => r.status)
      )
    ).toEqual(new Set(['checked_out']))
  })

  it('XLSX hücre rengi ödeme durumudur: kırmızı geceler için ödeme yazılır', async () => {
    const s = await setup()
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Ekim')
    ws.addRow([
      'ODA NO',
      new Date(Date.UTC(2026, 9, 1)),
      new Date(Date.UTC(2026, 9, 2)),
      new Date(Date.UTC(2026, 9, 3))
    ])
    ws.addRow(['201', 'Salih Çelik (2000 TL)', 'Salih Çelik (2000 TL)', 'Salih Çelik (2000 TL)'])
    const red = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFF0000' } }
    const yellow = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFF00' } }
    ws.getRow(2).getCell(2).fill = red
    ws.getRow(2).getCell(3).fill = yellow
    ws.getRow(2).getCell(4).fill = yellow
    const bytes = Buffer.from(await wb.xlsx.writeBuffer())
    const report = await s.imp.run(owner, {
      template: 'reservationGrid',
      fileName: 'rezervasyon.xlsx',
      contentBase64: bytes.toString('base64'),
      paidMethodId: s.id(paymentMethods, 'cash')
    })
    expect(report).toMatchObject({ reservations: 1, nights: 3, payments: 1, errorCount: 0 })
    expect(handle.db.select().from(payments).all()).toEqual([
      expect.objectContaining({ amountMinor: 200_000, date: '2026-10-01', currency: 'TRY' })
    ])
  })

  it('100 defter satırı içe alınır: gelir ödeme, gider gider olur; "x" teslim alınmış sayılır', async () => {
    const s = await setup()
    const input = {
      template: 'ledgerRows' as const,
      fileName: 'Defter Ekim 2026.csv',
      contentBase64: b64(ledgerCsv())
    }
    const preview = await s.imp.preview(owner, input)
    expect(preview.mapping).toMatchObject({
      date: 0,
      incomeCollected: 1,
      incomeAmount: 2,
      incomeCurrency: 3,
      incomeName: 4,
      incomeMethod: 5,
      incomeRoom: 6,
      incomeChannel: 7,
      expenseCollected: 8,
      expenseAmount: 9,
      expenseCurrency: 10,
      expenseDescription: 11
    })
    expect(preview).toMatchObject({ recordCount: 100, errorCount: 0 })
    const report = await s.imp.run(owner, input)
    expect(report).toMatchObject({ payments: 70, expenses: 30, errorCount: 0 })
    expect(handle.db.select().from(payments).all()).toHaveLength(70)
    expect(handle.db.select().from(payments).where(isNotNull(payments.collectedAt)).all()).toHaveLength(30)
    const exp = handle.db.select().from(expenses).all()
    expect(exp).toHaveLength(30)
    expect(exp[0]).toMatchObject({ amountMinor: 125_050, currency: 'TRY' })
    expect(exp.filter((e) => e.paidFromDrawer)).toHaveLength(20)
    const booking = handle.db
      .select()
      .from(payments)
      .where(eq(payments.channelId, s.id(salesChannels, 'booking')))
      .all()
    expect(booking.length).toBeGreaterThan(0)
  })

  it('defterde bilinmeyen yöntem ve okunamayan tutar raporlanır; tarihi olmayan satır alınmaz', async () => {
    const s = await setup()
    const csv = [
      'Kasa;Ücret;Birim;İsim;Ödeme Yöntemi;Oda;Platform;Kasa;Gider;Birim;Gider Açıklaması',
      ';500;TL;Erken Satır;Nakit;101;---;;;;',
      '02.10.2026;;;;;;;;;;',
      ';abc;TL;Deneme;Nakit;101;---;;;;',
      ';700;TL;Deneme;Çek;101;---;;;;',
      ';700;Yen;Deneme;Nakit;101;---;;;;',
      ';900;TL;Deneme;Nakit;101;Kuş Postası;;;;',
      ';1000;TL;Doğru Satır;Nakit;1 bag;Bounce;;;;'
    ].join('\n')
    const report = await s.imp.run(owner, {
      template: 'ledgerRows',
      fileName: 'defter.csv',
      contentBase64: b64(csv)
    })
    expect(report.errors.map((e) => [e.row, e.code])).toEqual([
      [2, 'badDate'],
      [4, 'badAmount'],
      [5, 'unknownMethod'],
      [6, 'unknownCurrency'],
      [7, 'unknownChannel']
    ])
    expect(report.payments).toBe(1)
  })
})
