import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { addDays, localDate } from '@shared/date'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import {
  IDENTITY_MARKERS,
  SEPTEMBER_EXPECTED,
  kbsWorkbookBuffer,
  septemberRows
} from '../../../tests/factories/kbs'
import type { DatabaseHandle } from '../db/client'
import { auditLog, guests, kbsStayRows, roomTypes, salesChannels } from '../db/schema'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createTourismStatsService } from './tourism-stats-service'
import type { KbsRow } from './tourism/kbs-reader'

const owner = roleCtx('owner')
const accountant = roleCtx('accountant')
let handle: DatabaseHandle
afterEach(() => handle?.close())

const ROOM_NUMBERS = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '201',
  '202',
  '203',
  '204',
  '205',
  '301',
  '302',
  '303',
  '304',
  '305',
  '401',
  '402',
  '403',
  '404'
]

/** Pandora-like: 19 rooms × 2 beds = 38 real beds (the ministry's 28 is not used). */
async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const rooms = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const byNumber = new Map(
    ROOM_NUMBERS.map((n) => [
      n,
      rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
    ])
  )
  return { clock, deps, stats: createTourismStatsService(deps), byNumber }
}

const fileOf = async (rows: KbsRow[]) => new Uint8Array(await kbsWorkbookBuffer(rows))

describe('turizm istatistiği servis üzerinden (§6.11, kabul ölçütü)', () => {
  it('Eylül: 607 giriş, 840 geceleme, 248 aynı gün, 23 ülke, 38 gerçek yatakla %73,68; kimlik verisi saklanmaz', async () => {
    const { stats } = await setup()
    const t = await stats.importKbs(accountant, {
      fileName: 'konaklayan-eylul.xlsx',
      period: '2026-09',
      bytes: await fileOf(septemberRows())
    })
    expect(t.totals).toEqual({ arrivals: SEPTEMBER_EXPECTED.arrivals, nights: SEPTEMBER_EXPECTED.nights })
    expect(t.issues.sameDay).toBe(SEPTEMBER_EXPECTED.sameDay)
    expect(t.table).toHaveLength(SEPTEMBER_EXPECTED.countries)
    expect(t.occupancyBasisPoints).toBe(7368)
    expect(t.clipboard.split('\n')[0]).toBe('Türkiye\t525\t665')
    const stored = handle.db.select().from(kbsStayRows).all()
    expect(stored).toHaveLength(607)
    expect(stored.every((r) => r.gender === null)).toBe(true)
    const everything = JSON.stringify([stored, handle.db.select().from(auditLog).all()])
    for (const marker of Object.values(IDENTITY_MARKERS)) expect(everything).not.toContain(marker)
    expect(stats.listImports(accountant, '2026-09').map((i) => i.rowCount)).toEqual([607])
  })

  it('otelde kalan misafir Bismuth’taki planlı çıkışa kadar sayılır; programla karşılaştırma eksik bildirimi bulur', async () => {
    const { stats, deps, byNumber, clock } = await setup()
    const res = createReservationsService(deps)
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    // The comparison counts stays that were checked in (P10fix #11): each is checked in on its day.
    const checkIn = (created: { reservation: { id: string } }, day: string) => {
      clock.set(`${day}T12:00:00.000Z`)
      res.checkIn(owner, res.get(owner, created.reservation.id).stays[0]!.id)
      clock.set('2026-10-01T09:00:00.000Z')
    }
    // Room 101 arrived on 29 September (in-house in the KBS file): the reservation says it leaves on 3 October.
    const r101 = res.create(owner, {
      guest: { firstName: 'Örnek' },
      channelId,
      stays: [
        {
          roomId: byNumber.get('101')!.id,
          checkIn: '2026-09-29',
          checkOut: '2026-10-03',
          nightlyPriceMinor: 1
        }
      ]
    })
    const extra = createRoomsService(deps).createRoom(owner, {
      number: '501',
      roomTypeId: byNumber.get('101')!.roomTypeId,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const missed = res.create(owner, {
      guest: { firstName: 'Bildirilmemiş' },
      channelId,
      stays: [{ roomId: extra.id, checkIn: '2026-09-10', checkOut: '2026-09-11', nightlyPriceMinor: 1 }]
    })
    checkIn(r101, '2026-09-29')
    checkIn(missed, '2026-09-10')
    const t = await stats.importKbs(owner, {
      fileName: 'k.xlsx',
      period: '2026-09',
      bytes: await fileOf(septemberRows())
    })
    expect(t.totals.nights).toBe(SEPTEMBER_EXPECTED.nights + 2)
    expect(t.inHouse.find((h) => h.room === '101')).toMatchObject({
      basis: 'plan',
      countedUntil: '2026-10-03',
      nights: 4
    })
    const cmp = stats.compareWithProgram(owner, t.import.id)
    expect(cmp.matched).toBe(1)
    expect(cmp.onlyInProgram).toEqual([
      { room: '501', arrival: '2026-09-10', reservationCode: expect.any(String) }
    ])
    expect(cmp.onlyInKbs.length).toBeGreaterThan(100)
  })

  it('"TÜRKYİE" öneri ile incelemeye düşer, onaylanınca kalıcı eşlenir; "KIBRIS" kendiliğinden eşlenmez (K-36)', async () => {
    const { stats } = await setup()
    const row = (nationalityRaw: string, day: string): KbsRow => ({
      arrival: localDate(day),
      departure: localDate(day),
      room: '101',
      nationalityRaw,
      status: 'Pasif'
    })
    const t = await stats.importKbs(owner, {
      fileName: 'k.xlsx',
      period: '2026-09',
      bytes: await fileOf([
        row('TÜRKİYE', '2026-09-01'),
        row('TÜRKYİE', '2026-09-02'),
        row('KIBRIS', '2026-09-03')
      ])
    })
    const typo = t.review.find((r) => r.raw === 'TÜRKYİE')
    expect(typo).toMatchObject({ reason: 'typo', suggestions: [{ iso2: 'TR', name: 'Türkiye' }] })
    expect(t.review.find((r) => r.raw === 'KIBRIS')).toMatchObject({ reason: 'ambiguous' })
    stats.confirmCountry(owner, { rawValue: 'TÜRKYİE', iso2: 'TR', ministryNameTr: 'Türkiye' })
    const again = stats.table(owner, t.import.id)
    expect(again.review.map((r) => r.raw)).toEqual(['KIBRIS'])
    expect(again.table.find((r) => r.iso2 === 'TR')).toMatchObject({ arrivals: 2, nights: 2 })
    // The confirmation is remembered for the next file too.
    const next = await stats.importKbs(owner, {
      fileName: 'k2.xlsx',
      period: '2026-10',
      bytes: await fileOf([row('TÜRKYİE', '2026-10-05')])
    })
    expect(next.review).toEqual([])
    expect(() =>
      stats.confirmCountry(roleCtx('reception'), { rawValue: 'KIBRIS', iso2: 'CY', ministryNameTr: 'Kıbrıs' })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('KBS olmayan dosya hangi sütunun eksik olduğunu söyleyerek reddedilir; yetkisiz rol içe aktaramaz', async () => {
    const { stats } = await setup()
    const notKbs = await import('exceljs').then(async ({ default: ExcelJS }) => {
      const wb = new ExcelJS.Workbook()
      wb.addWorksheet('x').getRow(1).values = ['Geliş Tarihi', 'Oda', 'Uyruk']
      return new Uint8Array(await wb.xlsx.writeBuffer())
    })
    await expect(
      stats.importKbs(owner, { fileName: 'x.xlsx', period: '2026-09', bytes: notKbs })
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      messageKey: 'errors.kbsFormat'
    })
    await expect(
      stats.importKbs(owner, {
        fileName: 'x.xlsx',
        period: '2026-09',
        bytes: new TextEncoder().encode('hello')
      })
    ).rejects.toMatchObject({ messageKey: 'errors.kbsFormat', details: { code: 'KBS_UNREADABLE' } })
    await expect(
      stats.importKbs(roleCtx('reception'), { fileName: 'k.xlsx', period: '2026-09', bytes: notKbs })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(() => stats.listImports(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
  })
})

/** Every value of every table, as one string (the privacy check reads the whole database, not one table). */
function dumpDatabase(): string {
  const tables = handle.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string
  }[]
  return JSON.stringify(
    tables.map(({ name }) => handle.sqlite.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}"`).all())
  )
}

const EYLUL_FILE = 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx'

describe('turizm istatistiği: kişisel veri, ay, düzeltme, bildirim, dışa aktarma', () => {
  it('içe almadan sonra veritabanının tamamında ad, kimlik, belge, plaka ve cinsiyet yok', async () => {
    const { stats } = await setup()
    await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    const dump = dumpDatabase()
    for (const marker of Object.values(IDENTITY_MARKERS)) expect(dump).not.toContain(marker)
    expect(dump).not.toContain('Erkek')
    expect(dump).not.toContain('Kadın')
    // What is kept: day, room, nationality, status.
    expect(dump).toContain('GERMANY (Deutschland)')
  })

  it('ay ve gün aralığı dosya adından okunur; geç içe alınsa da otelde kalanlar dosyanın ertesi gününe kadar sayılır', async () => {
    const { stats, clock } = await setup()
    clock.set('2026-10-04T09:00:00.000Z')
    const t = await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    expect(t.period).toBe('2026-09')
    expect(t.import).toMatchObject({ rangeFrom: '2026-09-01', rangeTo: '2026-09-30', rowCount: 607 })
    expect(t.countedTo).toBe('2026-10-01')
    expect(t.totals.nights).toBe(SEPTEMBER_EXPECTED.nights)
    expect(t.beds).toBe(38)
    expect(t.table.find((r) => r.iso2 === 'DE')?.country).toBe('Almanya')
    expect(t.table.find((r) => r.iso2 === 'XC')?.country).toBe('Kuzey Kıbrıs Türk Cumhuriyeti')
    // A renamed file without a day range: the month most rows arrived in.
    const renamed = await stats.importKbs(owner, {
      fileName: 'eylul.xlsx',
      bytes: await fileOf(septemberRows())
    })
    expect(renamed.period).toBe('2026-09')
    expect(renamed.import.rangeTo).toBeNull()
  })

  it('otelde kalanın sayıldığı gün düzeltilir, otomatiğe döner; çıkışı olan satır ve girişten önceki gün reddedilir', async () => {
    const { stats } = await setup()
    const t = await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    const stay = t.inHouse[0]!
    expect(stay.basis).toBe('import_day')
    const fixed = stats.setStayUntil(owner, {
      importId: t.import.id,
      rowId: stay.rowId!,
      until: addDays(stay.arrival, 1)
    })
    const after = fixed.inHouse.find((h) => h.rowId === stay.rowId)!
    expect(after).toMatchObject({ basis: 'manual', nights: 1 })
    expect(fixed.totals.nights).toBe(t.totals.nights - stay.nights + 1)
    // Kept: the next read shows the correction too.
    expect(stats.table(owner, t.import.id).totals.nights).toBe(fixed.totals.nights)
    const back = stats.setStayUntil(owner, { importId: t.import.id, rowId: stay.rowId!, until: null })
    expect(back.totals.nights).toBe(t.totals.nights)
    expect(() =>
      stats.setStayUntil(owner, {
        importId: t.import.id,
        rowId: stay.rowId!,
        until: addDays(stay.arrival, -1)
      })
    ).toThrow(/VALIDATION|kbsUntilBeforeArrival/)
    const left = handle.db
      .select()
      .from(kbsStayRows)
      .all()
      .find((r) => r.departureAt !== null)!
    expect(() =>
      stats.setStayUntil(owner, { importId: t.import.id, rowId: left.id, until: '2026-10-05' })
    ).toThrow()
    expect(() =>
      stats.setStayUntil(roleCtx('reception'), { importId: t.import.id, rowId: stay.rowId!, until: null })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('"bildirildi" işareti tarihiyle geçmişte görünür, geri alınabilir; iki işlem de denetim kaydına yazılır', async () => {
    const { stats, clock } = await setup()
    const t = await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    clock.set('2026-10-05T10:00:00.000Z')
    expect(stats.markReported(accountant, t.import.id, true).reportedAt).toBe('2026-10-05T10:00:00.000Z')
    expect(stats.listImports(accountant)[0]).toMatchObject({
      id: t.import.id,
      reportedAt: '2026-10-05T10:00:00.000Z'
    })
    expect(stats.markReported(owner, t.import.id, false).reportedAt).toBeNull()
    const updates = handle.db
      .select()
      .from(auditLog)
      .all()
      .filter((a) => a.entity === 'kbs_import' && a.action === 'update')
    expect(updates).toHaveLength(2)
    expect(() => stats.markReported(roleCtx('reception'), t.import.id, true)).toThrow(/PERMISSION_DENIED/)
  })

  it('ülke yeniden adlandırılınca tablo, kopya ve ülke listesi o adı kullanır; geri alınabilir', async () => {
    const { stats } = await setup()
    const t = await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    stats.renameCountry(owner, { iso2: 'DE', name: 'Almanya Federal Cumhuriyeti' })
    const again = stats.table(owner, t.import.id)
    expect(again.table.find((r) => r.iso2 === 'DE')).toMatchObject({
      country: 'Almanya Federal Cumhuriyeti',
      renamed: true
    })
    expect(again.clipboard).toContain('Almanya Federal Cumhuriyeti\t')
    expect(stats.countries(owner).find((c) => c.iso2 === 'DE')?.name).toBe('Almanya Federal Cumhuriyeti')
    expect(stats.countries(owner).find((c) => c.iso2 === 'XC')?.name).toBe('Kuzey Kıbrıs Türk Cumhuriyeti')
    stats.renameCountry(owner, { iso2: 'DE', name: null })
    expect(stats.table(owner, t.import.id).table.find((r) => r.iso2 === 'DE')?.country).toBe('Almanya')
    expect(() => stats.renameCountry(roleCtx('reception'), { iso2: 'DE', name: 'X' })).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('CSV ve XLSX Türkçe karakterleri bozmadan bakanlık sütunlarını ve toplamı verir', async () => {
    const { stats } = await setup()
    const t = await stats.importKbs(owner, { fileName: EYLUL_FILE, bytes: await fileOf(septemberRows()) })
    const csv = await stats.exportTable(owner, t.import.id, 'csv')
    expect(csv.fileName).toBe('turizm-istatistigi-2026-09.csv')
    const text = Buffer.from(csv.dataBase64, 'base64').toString('utf8')
    expect(text.startsWith('\uFEFFÜlke;Toplam Giriş;Toplam Geceleme\r\n')).toBe(true)
    expect(text).toContain('Türkiye;525;665')
    expect(text.trimEnd().split('\r\n').at(-1)).toBe('Toplam;607;840')
    const xlsx = await stats.exportTable(owner, t.import.id, 'xlsx')
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(new Uint8Array(Buffer.from(xlsx.dataBase64, 'base64')).buffer)
    const ws = wb.worksheets[0]!
    expect(ws.getRow(1).values).toEqual([undefined, 'Ülke', 'Toplam Giriş', 'Toplam Geceleme'])
    expect(ws.getRow(2).values).toEqual([undefined, 'Türkiye', 525, 665])
    expect(ws.getRow(ws.rowCount).values).toEqual([undefined, 'Toplam', 607, 840])
    await expect(stats.exportTable(roleCtx('housekeeping'), t.import.id, 'csv')).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    })
  })

  it('program verisiyle karşılaştırma: uyruğu girilmiş aynı konaklamalarda fark 0; uyruğu boş misafir "uyruk eksik" listesinde', async () => {
    const { stats, deps, byNumber, clock } = await setup()
    const res = createReservationsService(deps)
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    // Checked in on their day: the comparison counts real stays only (P10fix #11).
    const stay = (room: string, checkIn: string, checkOut: string, firstName: string) => {
      const created = res.create(owner, {
        guest: { firstName },
        channelId,
        stays: [{ roomId: byNumber.get(room)!.id, checkIn, checkOut, nightlyPriceMinor: 1 }]
      })
      clock.set(`${checkIn}T12:00:00.000Z`)
      res.checkIn(owner, res.get(owner, created.reservation.id).stays[0]!.id)
      clock.set('2026-10-01T09:00:00.000Z')
      return created
    }
    const a = stay('101', '2026-09-03', '2026-09-05', 'Örnek')
    const b = stay('102', '2026-09-10', '2026-09-10', 'Deneme')
    const c = stay('103', '2026-09-20', '2026-09-23', 'Uyruksuz')
    const setNationality = (guestId: string, iso: string) =>
      handle.db.update(guests).set({ nationality: iso }).where(eq(guests.id, guestId)).run()
    setNationality(a.guest.id, 'DE')
    setNationality(b.guest.id, 'TR')
    const row = (arrival: string, departure: string, room: string, nationalityRaw: string): KbsRow => ({
      arrival: localDate(arrival),
      departure: localDate(departure),
      room,
      nationalityRaw,
      status: 'Pasif'
    })
    const t = await stats.importKbs(owner, {
      fileName: EYLUL_FILE,
      bytes: await fileOf([
        row('2026-09-03', '2026-09-05', '101', 'GERMANY (Deutschland)'),
        row('2026-09-10', '2026-09-10', '102', 'TÜRKİYE')
      ])
    })
    const cmp = stats.compareWithProgram(owner, t.import.id)
    expect(cmp.differences).toEqual([])
    expect(cmp.missingNationality).toEqual([
      { reservationCode: c.reservation.code, room: '103', arrival: '2026-09-20', name: 'Uyruksuz' }
    ])
    expect(cmp.onlyInProgram).toEqual([
      { room: '103', arrival: '2026-09-20', reservationCode: c.reservation.code }
    ])
    expect(cmp.programTotals).toEqual({ arrivals: 3, nights: 2 + 1 + 3 })
    // A nationality written differently from KBS shows as a difference per country.
    setNationality(b.guest.id, 'AZ')
    expect(stats.compareWithProgram(owner, t.import.id).differences).toEqual([
      { country: 'Türkiye', iso2: 'TR', kbsArrivals: 1, kbsNights: 1, programArrivals: 0, programNights: 0 },
      {
        country: 'Azerbaycan',
        iso2: 'AZ',
        kbsArrivals: 0,
        kbsNights: 0,
        programArrivals: 1,
        programNights: 1
      }
    ])
  })
})
