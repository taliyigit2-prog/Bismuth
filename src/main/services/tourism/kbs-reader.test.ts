import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import { KbsFormatError, readKbsWorkbook, toLocalDay, type KbsRow } from './kbs-reader'
import {
  IDENTITY_MARKERS,
  KBS_EXPORT_HEADERS,
  SEPTEMBER_EXPECTED,
  kbsWorkbookBuffer,
  septemberRows
} from '../../../../tests/factories/kbs'
import { ministryTable, periodEnd } from './ministry-table'

const d = localDate
const sample: KbsRow[] = [
  {
    arrival: d('2026-09-01'),
    departure: d('2026-09-02'),
    room: '203',
    nationalityRaw: 'TÜRKİYE',
    status: 'Pasif'
  },
  {
    arrival: d('2026-09-05'),
    departure: d('2026-09-05'),
    room: '104',
    nationalityRaw: 'TÜRKİYE',
    status: 'Pasif'
  },
  {
    arrival: d('2026-09-30'),
    departure: d('2026-10-02'),
    room: '501',
    nationalityRaw: 'UZBEKISTAN',
    status: 'Pasif'
  },
  {
    arrival: d('2026-09-28'),
    departure: null,
    room: '402',
    nationalityRaw: 'GERMANY (Deutschland)',
    status: 'Aktif'
  }
]
const ROW_KEYS = ['arrival', 'departure', 'nationalityRaw', 'room', 'status']

async function workbook(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  build(wb.addWorksheet('Sayfa1'))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

async function formatError(p: Promise<unknown>): Promise<KbsFormatError> {
  const e = await p.then(
    () => null,
    (err: unknown) => err
  )
  if (!(e instanceof KbsFormatError)) throw new Error('expected KbsFormatError')
  return e
}

describe('toLocalDay', () => {
  it('Excel seri tarihi saat dilimi kaymadan güne çevrilir (23:30 girişi aynı gün kalır)', () => {
    expect(toLocalDay(46286.97929471065)).toBe('2026-09-21')
    expect(toLocalDay(46276.988396493056)).toBe('2026-09-11')
    expect(toLocalDay(new Date(Date.UTC(2026, 8, 21, 23, 30)))).toBe('2026-09-21')
    expect(toLocalDay(1)).toBe('1899-12-31')
  })

  it('metin tarihleri de okunur; boş ve anlamsız değer boş döner', () => {
    expect(toLocalDay('21.09.2026 10:00')).toBe('2026-09-21')
    expect(toLocalDay('1.9.2026')).toBe('2026-09-01')
    expect(toLocalDay('2026-09-21')).toBe('2026-09-21')
    expect(toLocalDay('46286,5')).toBe('2026-09-21')
    expect(toLocalDay('31.02.2026')).toBeNull()
    expect(toLocalDay('')).toBeNull()
    expect(toLocalDay('   ')).toBeNull()
    expect(toLocalDay('Toplam')).toBeNull()
    expect(toLocalDay(null)).toBeNull()
    expect(toLocalDay(Number.NaN)).toBeNull()
    expect(toLocalDay(1e12)).toBeNull()
  })
})

describe('readKbsWorkbook', () => {
  it('sütunlar sıradan bağımsız olarak başlık adıyla bulunur', async () => {
    const shuffled = [...KBS_EXPORT_HEADERS].reverse()
    const rows = await readKbsWorkbook(await kbsWorkbookBuffer(sample, { headers: shuffled }))
    expect(rows).toEqual(sample)
  })

  it('başlık üstündeki başlık satırları ve büyük/küçük harf ya da boşluk farkı sorun olmaz', async () => {
    const headers = KBS_EXPORT_HEADERS.map((h) => (h === 'Geliş Tarihi' ? '  GELİŞ TARİHİ ' : h))
    const buf = await kbsWorkbookBuffer(sample, {
      headers,
      leadingRows: ['EGM Konaklayan Listesi', '01.09.2026–30.09.2026']
    })
    expect(await readKbsWorkbook(buf)).toEqual(sample)
  })

  it('seyrek hücreler (dosyada hiç olmayan boş hücreler) satırı bozmaz', async () => {
    const buf = await workbook((ws) => {
      ws.getRow(1).values = ['Durum', 'Uyruğu', 'Cinsiyet', 'Verilen Oda', 'Çıkış Tarihi', 'Geliş Tarihi']
      const r = ws.getRow(3) // row 2 entirely absent
      r.getCell(2).value = 'UZBEKISTAN'
      r.getCell(4).value = 7
      r.getCell(6).value = 46286.5
    })
    expect(await readKbsWorkbook(buf)).toEqual([
      {
        arrival: '2026-09-21',
        departure: null,
        room: '7',
        nationalityRaw: 'UZBEKISTAN',
        status: ''
      }
    ])
  })

  it('kimlik ve cinsiyet sütunları okunmaz: satırlarda ad, kimlik, belge, plaka, cinsiyet alanı ya da değeri yoktur', async () => {
    const rows = await readKbsWorkbook(await kbsWorkbookBuffer(sample))
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(ROW_KEYS)
    const text = JSON.stringify(rows)
    for (const marker of Object.values(IDENTITY_MARKERS)) expect(text).not.toContain(marker)
  })

  it('KBS\'nin 1900-01-01 "çıkış yok" değeri boş sayılır; girişten önceki çıkış yazıldığı gibi kalır (hatalı tarih olarak ayrılır)', async () => {
    const buf = await workbook((ws) => {
      ws.getRow(1).values = ['Geliş Tarihi', 'Çıkış Tarihi', 'Verilen Oda', 'Cinsiyet', 'Uyruğu', 'Durum']
      ws.getRow(2).values = [46286.5, 1, '101', 'Erkek', 'TÜRKİYE', 'Aktif']
      ws.getRow(3).values = [46286.5, 46280.5, '102', 'Erkek', 'TÜRKİYE', 'Pasif']
      ws.getRow(4).values = ['Toplam', null, null, null, null, null]
    })
    const rows = await readKbsWorkbook(buf)
    expect(rows.map((r) => [r.arrival, r.departure])).toEqual([
      ['2026-09-21', null],
      ['2026-09-21', '2026-09-15']
    ])
  })

  it('formül sonucu ve biçimli metin hücreleri değer olarak okunur', async () => {
    const buf = await workbook((ws) => {
      ws.getRow(1).values = ['Geliş Tarihi', 'Çıkış Tarihi', 'Verilen Oda', 'Cinsiyet', 'Uyruğu']
      ws.getCell('F1').value = { richText: [{ text: 'Du' }, { text: 'rum' }] }
      ws.getCell('A2').value = { formula: 'B2-1', result: 46285.5 }
      ws.getCell('B2').value = 46286.5
      ws.getCell('C2').value = '101'
      ws.getCell('E2').value = { richText: [{ text: 'TÜRK' }, { text: 'İYE' }] }
      ws.getCell('F2').value = 'Pasif'
    })
    expect(await readKbsWorkbook(buf)).toEqual([
      {
        arrival: '2026-09-20',
        departure: '2026-09-21',
        room: '101',
        nationalityRaw: 'TÜRKİYE',
        status: 'Pasif'
      }
    ])
  })

  it('ArrayBuffer girdisi de kabul edilir', async () => {
    const buf = await kbsWorkbookBuffer(sample)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    expect(await readKbsWorkbook(ab)).toEqual(sample)
  })

  it('eksik sütun KBS_MISSING_COLUMN hatasıyla sütun adını bildirir', async () => {
    const headers = KBS_EXPORT_HEADERS.filter((h) => h !== 'Uyruğu')
    const e = await formatError(readKbsWorkbook(await kbsWorkbookBuffer(sample, { headers })))
    expect([e.code, e.column]).toEqual(['KBS_MISSING_COLUMN', 'Uyruğu'])
  })

  it('başlığı olmayan dosya ilk gerekli sütunu eksik bildirir', async () => {
    const buf = await workbook((ws) => {
      ws.getRow(1).values = ['Ad', 'Soyad']
    })
    const e = await formatError(readKbsWorkbook(buf))
    expect([e.code, e.column]).toEqual(['KBS_MISSING_COLUMN', 'Geliş Tarihi'])
  })

  it('sayfası olmayan çalışma kitabı KBS_NO_SHEET hatası verir', async () => {
    const empty = Buffer.from(await new ExcelJS.Workbook().xlsx.writeBuffer())
    const e = await formatError(readKbsWorkbook(empty))
    expect(e.code).toBe('KBS_NO_SHEET')
  })

  it('Excel olmayan dosya KBS_UNREADABLE hatası verir', async () => {
    const e = await formatError(readKbsWorkbook(Buffer.from('Tc Kimlik No;Adı\n')))
    expect(e.code).toBe('KBS_UNREADABLE')
  })

  it('birden çok sayfa varsa başlığı tutan sayfa okunur', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Notlar').getCell('A1').value = 'not'
    const ws = wb.addWorksheet('Liste')
    ws.getRow(1).values = ['Geliş Tarihi', 'Çıkış Tarihi', 'Verilen Oda', 'Cinsiyet', 'Uyruğu', 'Durum']
    ws.getRow(2).values = [46286.5, 46287.4, '101', 'Erkek', 'TÜRKİYE', 'Pasif']
    const rows = await readKbsWorkbook(Buffer.from(await wb.xlsx.writeBuffer()))
    expect(rows).toHaveLength(1)
  })

  it('sentetik Eylül dosyası: 607 satır okunur ve bakanlık tablosu 607 giriş / 840 geceleme verir', async () => {
    const expected = septemberRows()
    const rows = await readKbsWorkbook(await kbsWorkbookBuffer(expected))
    expect(rows).toEqual(expected)
    const res = ministryTable(rows, SEPTEMBER_EXPECTED.period, {
      beds: 38,
      asOf: periodEnd(SEPTEMBER_EXPECTED.period)
    })
    expect([res.totals.arrivals, res.totals.nights, res.issues.sameDay, res.table.length]).toEqual([
      SEPTEMBER_EXPECTED.arrivals,
      SEPTEMBER_EXPECTED.nights,
      SEPTEMBER_EXPECTED.sameDay,
      SEPTEMBER_EXPECTED.countries
    ])
  })
})
