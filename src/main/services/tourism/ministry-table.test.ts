import { describe, expect, it } from 'vitest'
import { localDate, type LocalDate } from '@shared/date'
import type { KbsRow } from './kbs-reader'
import { SEPTEMBER_EXPECTED, septemberRows } from '../../../../tests/factories/kbs'
import {
  countStayNights,
  daysInPeriod,
  ministryNights,
  ministryTable,
  periodEnd,
  plannedDepartureKey,
  toClipboardText
} from './ministry-table'

const d = localDate
const row = (
  arrival: string,
  departure: string | null,
  nationalityRaw: string,
  room = '101',
  status = departure ? 'Pasif' : 'Aktif'
): KbsRow => ({
  arrival: d(arrival),
  departure: departure ? d(departure) : null,
  room,
  nationalityRaw,
  status
})
const SEPTEMBER = '2026-09'
const END_OF_SEPTEMBER = d('2026-10-01')

describe('ministryNights', () => {
  it('aynı gün giriş-çıkış 1 gece sayılır; normal konaklama gün farkıdır', () => {
    expect(ministryNights(d('2026-09-05'), d('2026-09-05'))).toBe(1)
    expect(ministryNights(d('2026-09-10'), d('2026-09-14'))).toBe(4)
    expect(ministryNights(d('2026-09-30'), d('2026-10-02'))).toBe(2)
  })
})

describe('çıkışı girişten önce olan satır', () => {
  it('geceye ve tabloya katılmaz, hatalı tarih olarak ayrıca listelenir ve otelde kalan sayılmaz', () => {
    const rows = [
      row('2026-09-12', '2026-09-10', 'ALMANYA', '205'),
      row('2026-09-05', '2026-09-08', 'ALMANYA', '101')
    ]
    const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: END_OF_SEPTEMBER })
    expect(res.totals).toEqual({ arrivals: 1, nights: 3 })
    expect(res.inHouse).toEqual([])
    expect(res.issues).toMatchObject({ invalidDates: 1, missingDeparture: 0 })
    expect(res.invalidDates).toEqual([
      { rowId: null, room: '205', arrival: '2026-09-12', departure: '2026-09-10' }
    ])
  })
})

describe('countStayNights', () => {
  it('her satırın gece sayısı ve dayanağı (gerçek çıkış, planlı çıkış, içe alma günü) döner', () => {
    const asOf = d('2026-10-05')
    const plannedDepartures = { [plannedDepartureKey('402', d('2026-09-28'))]: d('2026-10-04') }
    expect(countStayNights(row('2026-09-05', '2026-09-05', 'TÜRKİYE'), { asOf })).toEqual({
      nights: 1,
      basis: 'actual',
      countedUntil: '2026-09-05'
    })
    expect(countStayNights(row('2026-09-28', null, 'TÜRKİYE', '402'), { asOf, plannedDepartures })).toEqual({
      nights: 6,
      basis: 'plan',
      countedUntil: '2026-10-04'
    })
    expect(countStayNights(row('2026-09-28', null, 'TÜRKİYE', '403'), { asOf, plannedDepartures })).toEqual({
      nights: 7,
      basis: 'import_day',
      countedUntil: '2026-10-05'
    })
  })
})

describe('dönem yardımcıları', () => {
  it('ayın gün sayısı ve dosya ayının bitişi', () => {
    expect(daysInPeriod('2026-09')).toBe(30)
    expect(daysInPeriod('2028-02')).toBe(29)
    expect(periodEnd('2026-12')).toBe('2027-01-01')
  })

  it('geçersiz dönem reddedilir', () => {
    expect(() => daysInPeriod('2026-13')).toThrow(RangeError)
    expect(() => ministryTable([], '2026-9', { beds: 38, asOf: END_OF_SEPTEMBER })).toThrow(RangeError)
  })
})

describe('ministryTable — Eylül örneği (sentetik)', () => {
  const rows = septemberRows()

  it('607 giriş, 840 geceleme, 248 aynı gün, 23 ülke; otelde kalan 5 kişi ay sonuna kadar sayılır', () => {
    expect(rows).toHaveLength(SEPTEMBER_EXPECTED.arrivals)
    const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: periodEnd(SEPTEMBER) })
    expect(res.totals).toEqual({ arrivals: 607, nights: 840 })
    expect(res.issues.sameDay).toBe(248)
    expect(res.table).toHaveLength(23)
    expect(res.inHouse).toHaveLength(5)
    expect(res.inHouse.every((h) => h.basis === 'import_day' && h.countedUntil === '2026-10-01')).toBe(true)
    expect(res.issues).toMatchObject({ active: 5, missingDeparture: 5, outsidePeriod: 0, unmapped: [] })
    expect(res.review).toEqual([])
    expect(res.table.slice(0, 6).map((r) => [r.country, r.arrivals, r.nights])).toEqual([
      ['Türkiye', 525, 665],
      ['Almanya', 23, 88],
      ['Özbekistan', 20, 20],
      ['Kuzey Kıbrıs Türk Cumhuriyeti', 10, 24],
      ['Azerbaycan', 5, 5],
      ['Rusya Federasyonu', 3, 6]
    ])
  })

  it('otelde kalanlar 30 Eylül sayım gününe kadar sayılırsa her biri 1 gece olur: 838', () => {
    const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: d('2026-09-30') })
    expect(res.totals.nights).toBe(SEPTEMBER_EXPECTED.nightsAsOfLastDay)
    expect(res.inHouse.map((h) => h.nights)).toEqual([1, 1, 1, 1, 1])
  })

  it('bakanlık doluluk oranı = geceleme ÷ (gerçek yatak × gün): 38 yatak, Eylül 840 → %73,68', () => {
    const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: END_OF_SEPTEMBER })
    expect(res.daysInMonth).toBe(30)
    expect(res.occupancyBasisPoints).toBe(7368)
    expect(res.occupancy?.toFixed(4)).toBe('0.7368')
  })
})

describe('ministryTable — kurallar', () => {
  it('tüm geceler giriş ayına yazılır; sonraki aya sarkan geceler dahil, başka ayda gelen hariç', () => {
    const res = ministryTable(
      [
        row('2026-09-30', '2026-10-03', 'GERMANY'),
        row('2026-09-10', '2026-09-12', 'GERMANY'),
        row('2026-08-31', '2026-09-02', 'POLAND'),
        row('2026-10-01', '2026-10-02', 'POLAND')
      ],
      SEPTEMBER,
      { beds: 38, asOf: END_OF_SEPTEMBER }
    )
    expect(res.totals).toEqual({ arrivals: 2, nights: 5 })
    expect(res.issues.outsidePeriod).toBe(2)
    expect(res.table.map((r) => r.country)).toEqual(['Almanya'])
  })

  it('panel örneği: 1 giriş, 2 gece, 28 yatak, 30 gün → %0,24', () => {
    const res = ministryTable([row('2026-09-10', '2026-09-12', 'UZBEKISTAN')], SEPTEMBER, {
      beds: 28,
      asOf: END_OF_SEPTEMBER
    })
    expect(res.totals.nights).toBe(2)
    expect(res.occupancyBasisPoints).toBe(24)
    expect(((res.occupancy ?? 0) * 100).toFixed(2)).toBe('0.24')
  })

  it('yatak sayısı bilinmiyorsa doluluk hesaplanmaz', () => {
    const rows = [row('2026-09-10', '2026-09-12', 'UZBEKISTAN')]
    expect(ministryTable(rows, SEPTEMBER, { beds: null, asOf: END_OF_SEPTEMBER })).toMatchObject({
      occupancy: null,
      occupancyBasisPoints: null
    })
    expect(ministryTable(rows, SEPTEMBER, { beds: 0, asOf: END_OF_SEPTEMBER }).occupancy).toBeNull()
  })

  it('Aktif durumu Türkçe büyük harfle (AKTİF) yazılsa da sayılır', () => {
    const res = ministryTable([row('2026-09-28', null, 'TÜRKİYE', '101', 'AKTİF')], SEPTEMBER, {
      beds: 38,
      asOf: END_OF_SEPTEMBER
    })
    expect(res.issues.active).toBe(1)
  })
})

describe('ministryTable — otelde kalanlar (planlı çıkış)', () => {
  const rows = [
    row('2026-09-28', null, 'SWITZERLAND (Confederation of Helvetia)', '402'),
    row('2026-09-20', '2026-09-21', 'TÜRKİYE', '301')
  ]
  const plan = (room: string, arrival: string, departure: string): Record<string, LocalDate> => ({
    [plannedDepartureKey(room, d(arrival))]: d(departure)
  })

  it("aynı oda + giriş günü rezervasyonu varsa sonraki aydaki planlı çıkışa kadar tüm geceler Eylül'e yazılır", () => {
    const res = ministryTable(rows, SEPTEMBER, {
      beds: 38,
      asOf: END_OF_SEPTEMBER,
      plannedDepartures: plan('402', '2026-09-28', '2026-10-04')
    })
    expect(res.inHouse).toEqual([
      {
        rowId: null,
        room: '402',
        arrival: '2026-09-28',
        countedUntil: '2026-10-04',
        nights: 6,
        basis: 'plan'
      }
    ])
    expect(res.totals.nights).toBe(6 + 1)
  })

  it('eşleşen rezervasyon yoksa (başka oda ya da başka giriş günü) içe alma gününe kadar sayılır', () => {
    for (const plannedDepartures of [
      plan('403', '2026-09-28', '2026-10-04'),
      plan('402', '2026-09-27', '2026-10-04'),
      {}
    ]) {
      const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: d('2026-10-05'), plannedDepartures })
      expect(res.inHouse).toEqual([
        {
          rowId: null,
          room: '402',
          arrival: '2026-09-28',
          countedUntil: '2026-10-05',
          nights: 7,
          basis: 'import_day'
        }
      ])
    }
  })

  it('giriş gününden önceki planlı çıkış kullanılmaz', () => {
    const res = ministryTable(rows, SEPTEMBER, {
      beds: 38,
      asOf: END_OF_SEPTEMBER,
      plannedDepartures: plan('402', '2026-09-28', '2026-09-20')
    })
    expect(res.inHouse.map((h) => [h.basis, h.countedUntil, h.nights])).toEqual([
      ['import_day', '2026-10-01', 3]
    ])
  })
})

describe('ministryTable — uyruk kontrol listesi', () => {
  const rows = [
    row('2026-09-01', '2026-09-02', 'TÜRKİYE'),
    row('2026-09-02', '2026-09-03', 'TÜRKYİE'),
    row('2026-09-03', '2026-09-04', 'TÜRKYİE'),
    row('2026-09-04', '2026-09-05', 'KIBRIS'),
    row('2026-09-05', '2026-09-06', 'CYPRUS'),
    row('2026-09-06', '2026-09-06', 'KUZY KIBRIS TURK CUMHURIYETI')
  ]

  it('yazım hatası, belirsiz ve hassas değerler satır sayısıyla kontrol listesine girer', () => {
    const res = ministryTable(rows, SEPTEMBER, { beds: 38, asOf: END_OF_SEPTEMBER })
    expect(res.review.map((r) => [r.raw, r.reason, r.iso2, r.rows])).toEqual([
      ['TÜRKYİE', 'typo', 'TR', 2],
      ['CYPRUS', 'sensitive', 'CY', 1],
      ['KIBRIS', 'ambiguous', null, 1],
      ['KUZY KIBRIS TURK CUMHURIYETI', 'typo', 'XC', 1]
    ])
    expect(res.issues.unmapped).toEqual(['KIBRIS'])
    const tr = res.table.find((r) => r.iso2 === 'TR')
    expect(tr).toMatchObject({ country: 'Türkiye', arrivals: 3, nights: 3, needsReview: true })
    expect(res.table.find((r) => r.country === 'KIBRIS')).toMatchObject({ mapped: false, iso2: null })
  })

  it('kullanıcının onayladığı eşlemeler listeden düşer', () => {
    const res = ministryTable(rows, SEPTEMBER, {
      beds: 38,
      asOf: END_OF_SEPTEMBER,
      userMap: {
        TURKYIE: { iso2: 'TR', ministryNameTr: 'Türkiye' },
        KIBRIS: { iso2: 'XC', ministryNameTr: 'Kuzey Kıbrıs Türk Cumhuriyeti' }
      }
    })
    expect(res.review.map((r) => r.raw)).toEqual(['CYPRUS', 'KUZY KIBRIS TURK CUMHURIYETI'])
    expect(res.table.find((r) => r.iso2 === 'TR')).toMatchObject({ arrivals: 3, needsReview: false })
    expect(res.table.find((r) => r.iso2 === 'XC')).toMatchObject({ arrivals: 2, nights: 2 })
  })
})

describe('toClipboardText', () => {
  it('ülke, giriş ve geceleme sekmeyle ayrılır; eşlenmemiş satır ? ile işaretlenir', () => {
    const res = ministryTable(
      [
        row('2026-09-01', '2026-09-02', 'TÜRKİYE'),
        row('2026-09-01', '2026-09-03', 'TÜRKİYE'),
        row('2026-09-04', '2026-09-05', 'KIBRIS')
      ],
      SEPTEMBER,
      { beds: 38, asOf: END_OF_SEPTEMBER }
    )
    expect(toClipboardText(res)).toBe('Türkiye\t2\t3\n? KIBRIS\t1\t1')
  })

  it('tablo giriş, sonra geceleme, sonra Türkçe ada göre sıralanır', () => {
    const res = ministryTable(
      [
        row('2026-09-01', '2026-09-02', 'SWITZERLAND'),
        row('2026-09-01', '2026-09-02', 'ICELAND'),
        row('2026-09-01', '2026-09-03', 'UNITED STATES')
      ],
      SEPTEMBER,
      { beds: 38, asOf: END_OF_SEPTEMBER }
    )
    expect(res.table.map((r) => r.country)).toEqual(['Amerika Birleşik Devletleri', 'İsviçre', 'İzlanda'])
  })
})

describe('kullanıcının düzeltmeleri ve bakanlık doluluğu', () => {
  it('otelde kalanın sayıldığı gün elle düzeltilince planın ve içe alma gününün yerine geçer', () => {
    const res = ministryTable(
      [{ ...row('2026-09-28', null, 'TÜRKİYE', '402'), id: 'r1', manualUntil: d('2026-09-30') }],
      SEPTEMBER,
      {
        beds: 38,
        asOf: END_OF_SEPTEMBER,
        plannedDepartures: { [plannedDepartureKey('402', d('2026-09-28'))]: d('2026-10-04') }
      }
    )
    expect(res.inHouse).toEqual([
      {
        rowId: 'r1',
        room: '402',
        arrival: '2026-09-28',
        countedUntil: '2026-09-30',
        nights: 2,
        basis: 'manual'
      }
    ])
    expect(res.totals.nights).toBe(2)
  })

  it('kullanıcının verdiği ülke adı tabloda ve kopyada kullanılır', () => {
    const res = ministryTable([row('2026-09-01', '2026-09-03', 'GERMANY (Deutschland)')], SEPTEMBER, {
      beds: 38,
      asOf: END_OF_SEPTEMBER,
      countryNames: { DE: 'Almanya Federal Cumhuriyeti' }
    })
    expect(res.table[0]).toMatchObject({
      country: 'Almanya Federal Cumhuriyeti',
      renamed: true,
      mapped: true
    })
    expect(toClipboardText(res)).toBe('Almanya Federal Cumhuriyeti\t1\t2')
  })

  it('panel doğrulaması: 1 giriş, 2 gece, 28 yatak, 30 gün → %0,24 (24 baz puan)', () => {
    const res = ministryTable([row('2026-09-10', '2026-09-12', 'TÜRKİYE')], SEPTEMBER, {
      beds: 28,
      asOf: END_OF_SEPTEMBER
    })
    expect(res.totals).toEqual({ arrivals: 1, nights: 2 })
    expect(res.occupancyBasisPoints).toBe(24)
  })

  it('ay içinde kapasite değiştiyse payda günlerin yatak toplamıdır', () => {
    const res = ministryTable([row('2026-09-10', '2026-09-12', 'TÜRKİYE')], SEPTEMBER, {
      beds: 38,
      bedDays: 38 * 15 + 36 * 15,
      asOf: END_OF_SEPTEMBER
    })
    expect(res.occupancyBasisPoints).toBe(Math.round((2 * 10_000) / (38 * 15 + 36 * 15)))
  })
})
