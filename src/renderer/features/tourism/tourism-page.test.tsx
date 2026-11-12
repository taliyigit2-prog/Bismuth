import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import type { ProcedureName } from '@shared/contract'
import type { TourismComparisonView, TourismImportView, TourismTableView } from '@shared/contract/tourism'
import { fakeTransport, renderWithProviders, type FakeTransport } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { ApiError } from '@/lib/transport'
import {
  copyRow,
  fileProblem,
  matchCountries,
  monthOptions,
  occupancyDigits,
  reportWindow,
  toBase64
} from './derive'
import { TourismPage } from './tourism-page'

const DAY = localDate('2026-10-04')

beforeAll(() => {
  // jsdom has no scrollIntoView (the country list scrolls the active item into view).
  Element.prototype.scrollIntoView ??= () => {}
})

function phone(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const IMPORT: TourismImportView = {
  id: '01JTOURISM0000000000000001',
  period: '2026-09',
  fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx',
  importedAt: '2026-10-01T09:00:00.000Z',
  rowCount: 607,
  sameDayCount: 248,
  activeCount: 5,
  rangeFrom: localDate('2026-09-01'),
  rangeTo: localDate('2026-09-30'),
  reportedAt: null,
  reportedByName: null
}

// Invented aggregate figures shaped like a month (no file rows, no names).
const TABLE: TourismTableView = {
  import: IMPORT,
  period: '2026-09',
  daysInMonth: 30,
  beds: 38,
  table: [
    {
      country: 'Türkiye',
      iso2: 'TR',
      renamed: false,
      mapped: true,
      needsReview: true,
      arrivals: 525,
      nights: 665
    },
    {
      country: 'Almanya',
      iso2: 'DE',
      renamed: false,
      mapped: true,
      needsReview: false,
      arrivals: 23,
      nights: 87
    },
    {
      country: 'KIBRIS',
      iso2: null,
      renamed: false,
      mapped: false,
      needsReview: true,
      arrivals: 1,
      nights: 1
    }
  ],
  totals: { arrivals: 549, nights: 753 },
  occupancyBasisPoints: 6605,
  countedTo: localDate('2026-10-01'),
  inHouse: [
    {
      rowId: '01JTOURISMROW0000000000001',
      room: '402',
      arrival: localDate('2026-09-29'),
      countedUntil: localDate('2026-10-01'),
      nights: 2,
      basis: 'import_day'
    }
  ],
  review: [
    {
      key: 'TURKYIE',
      raw: 'TÜRKYİE',
      reason: 'typo',
      suggestions: [{ iso2: 'TR', name: 'Türkiye' }],
      rows: 1
    },
    {
      key: 'KIBRIS',
      raw: 'KIBRIS',
      reason: 'ambiguous',
      suggestions: [
        { iso2: 'XC', name: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
        { iso2: 'CY', name: 'Kıbrıs' }
      ],
      rows: 1
    }
  ],
  blankNationality: [],
  invalidDates: [],
  issues: { sameDay: 248, active: 5, missingDeparture: 1, outsidePeriod: 0, invalidDates: 0 },
  clipboard: 'Türkiye\t525\t665\nAlmanya\t23\t87\n? KIBRIS\t1\t1'
}

const COMPARISON: TourismComparisonView = {
  period: '2026-09',
  differences: [
    { country: 'Almanya', iso2: 'DE', kbsArrivals: 23, kbsNights: 87, programArrivals: 22, programNights: 85 }
  ],
  programTotals: { arrivals: 540, nights: 740 },
  missingNationality: [
    {
      reservationCode: 'R-2026-000101',
      room: '203',
      arrival: localDate('2026-09-12'),
      name: 'Deneme Misafir'
    }
  ],
  onlyInKbs: [],
  onlyInProgram: [{ room: '305', arrival: localDate('2026-09-20'), reservationCode: 'R-2026-000150' }],
  matched: 300,
  headCountStays: 2
}

interface TourismState {
  imports: TourismImportView[]
  table: TourismTableView
  failImports?: boolean
  pendingImports?: boolean
}

/** The settings/sign-in fake plus the tourism procedures, with an in-memory "service". */
function tourismTransport(state: TourismState): FakeTransport {
  const base = fakeTransport()
  const call = base.call.bind(base)
  base.call = (async (name: ProcedureName, input: unknown) => {
    if (!name.startsWith('tourism.')) return call(name, input as never)
    base.calls.push({ name, input })
    switch (name) {
      case 'tourism.listImports':
        if (state.pendingImports) return new Promise(() => {})
        if (state.failImports) throw new ApiError('INTERNAL', 500, 'errors.internal')
        return state.imports
      case 'tourism.table':
        return state.table
      case 'tourism.compare':
        return COMPARISON
      case 'tourism.countries':
        return [
          { iso2: 'XC', name: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
          { iso2: 'CY', name: 'Kıbrıs' },
          { iso2: 'TR', name: 'Türkiye' }
        ]
      case 'tourism.import':
        state.imports = [IMPORT]
        return state.table
      case 'tourism.confirmCountry': {
        const { rawValue } = input as { rawValue: string }
        state.table = { ...state.table, review: state.table.review.filter((r) => r.raw !== rawValue) }
        return { ok: true }
      }
      case 'tourism.markReported': {
        const { reported } = input as { reported: boolean }
        const imp = { ...IMPORT, reportedAt: reported ? '2026-10-05T10:00:00.000Z' : null }
        state.imports = [imp]
        state.table = { ...state.table, import: imp }
        return imp
      }
      case 'tourism.setStayUntil':
        return state.table
      case 'tourism.assignRow': {
        const { rowId, iso2 } = input as { rowId: string; iso2: string | null }
        state.table = {
          ...state.table,
          blankNationality: state.table.blankNationality.map((r) =>
            r.rowId === rowId
              ? { ...r, country: iso2 ? { iso2, name: iso2 === 'TR' ? 'Türkiye' : iso2 } : null }
              : r
          )
        }
        return state.table
      }
      default:
        throw new Error(`unexpected ${name}`)
    }
  }) as FakeTransport['call']
  return base
}

const render = (state: Partial<TourismState> = {}) => {
  const full: TourismState = { imports: [IMPORT], table: TABLE, ...state }
  const transport = tourismTransport(full)
  return renderWithProviders(<TourismPage today={DAY} />, { transport }).then((r) => ({
    ...r,
    transport,
    state: full
  }))
}

describe('turizm istatistiği yardımcıları', () => {
  it('bakanlık doluluğu: %1 altı iki ondalık (%0,24 panel değeri), üstü bir ondalık (%73,7)', () => {
    expect(occupancyDigits(24)).toBe(2)
    expect(occupancyDigits(7368)).toBe(1)
  })

  it('satır kopyası paneldeki sırayla sekmeyle ayrılır', () => {
    expect(copyRow({ country: 'Almanya', arrivals: 23, nights: 87 })).toBe('Almanya\t23\t87')
  })

  it('ay listesi son on iki ay ile içe alınmış eski ayları yeniden eskiye verir; bildirim penceresi 1–10', () => {
    const months = monthOptions(DAY, [{ period: '2025-01' }])
    expect(months[0]).toBe('2026-09')
    expect(months.at(-1)).toBe('2025-01')
    expect(reportWindow('2026-09')).toEqual({ from: '2026-10-01', to: '2026-10-10' })
  })

  it('yalnız .xlsx kabul edilir; dosya base64 olarak gider', () => {
    expect(fileProblem({ name: 'liste.xls', size: 10 })).toBe('wrongType')
    expect(fileProblem({ name: 'Liste.XLSX', size: 10 })).toBeNull()
    expect(fileProblem({ name: 'liste.xlsx', size: 50_000_000 })).toBe('tooLarge')
    expect(toBase64(new TextEncoder().encode('Ülke'))).toBe(btoa(unescape(encodeURIComponent('Ülke'))))
  })

  it('ülke araması Türkçe harfleri ve büyük/küçük harfi yok sayar', () => {
    const list = [
      { iso2: 'XC', name: 'Kuzey Kıbrıs Türk Cumhuriyeti' },
      { iso2: 'CY', name: 'Kıbrıs' },
      { iso2: 'TR', name: 'Türkiye' }
    ]
    expect(matchCountries(list, 'kibris').map((c) => c.iso2)).toEqual(['CY', 'XC'])
    expect(matchCountries(list, 'TURK').map((c) => c.iso2)).toEqual(['TR', 'XC'])
  })
})

describe('Turizm istatistiği ekranı', { timeout: 20_000 }, () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    await render({ pendingImports: true })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('liste okunamazsa yeniden dene düğmesi çıkar', async () => {
    await render({ failImports: true })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('henüz dosya yoksa önce dosya seçmeyi ister; geçmiş boş', async () => {
    await render({ imports: [] })
    expect(await screen.findByText('Bu ay için dosya seçilmedi')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('tourism-step-result')).getByText('Önce bu ayın KBS listesini seçin.')
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('tourism-history')).getByText(/Henüz KBS listesi alınmadı/)
    ).toBeInTheDocument()
  })

  it('içe alınan ayın özeti, bakanlık tablosu, doluluk ve kuralları görünür; kimlik verisi yok', async () => {
    await render()
    expect(await screen.findByTestId('tourism-reminder')).toHaveTextContent('6 gün kaldı')
    const preview = await screen.findByTestId('tourism-preview')
    expect(preview).toHaveTextContent('607')
    expect(preview).toHaveTextContent('248')
    const facts = screen.getByTestId('tourism-facts')
    expect(facts).toHaveTextContent('753')
    expect(facts).toHaveTextContent('38')
    expect(facts).toHaveTextContent('%66,1')
    const result = screen.getByTestId('tourism-step-result')
    expect(within(result).getByText('Almanya')).toBeInTheDocument()
    expect(
      within(result).getByText('248 kişi aynı gün giriş\u2011çıkış yaptı; her biri 1 geceleme sayıldı.')
    ).toBeInTheDocument()
    expect(screen.getByText(/Kimlik numarası ve ad saklanmaz/)).toBeInTheDocument()
    expect(within(screen.getByTestId('tourism-in-house')).getByText('Oda 402')).toBeInTheDocument()
  })

  it('yazım önerisi kabul edilince eşleme kaydedilir; onay bitene kadar tablo kopyalanamaz', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const result = await screen.findByTestId('tourism-step-result')
    expect(within(result).getByRole('button', { name: 'Tabloyu kopyala' })).toBeDisabled()
    expect(within(result).getByTestId('tourism-pending')).toHaveTextContent('Onay bekleyen 2 uyruk var')
    await user.click(within(screen.getByTestId('review-TÜRKYİE')).getByRole('button', { name: 'Kabul et' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'tourism.confirmCountry',
        input: { rawValue: 'TÜRKYİE', iso2: 'TR', ministryNameTr: 'Türkiye' }
      })
    )
    await waitFor(() => expect(screen.queryByTestId('review-TÜRKYİE')).not.toBeInTheDocument())
    // "KIBRIS" is never matched by itself: a country is chosen from the list (suggestions first).
    const kibris = screen.getByTestId('review-KIBRIS')
    expect(within(kibris).getByText('Belirsiz')).toBeInTheDocument()
    await user.click(within(kibris).getByRole('button', { name: 'KIBRIS için ülke' }))
    await user.click(await screen.findByRole('option', { name: 'Kuzey Kıbrıs Türk Cumhuriyeti' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'tourism.confirmCountry',
        input: { rawValue: 'KIBRIS', iso2: 'XC', ministryNameTr: 'Kuzey Kıbrıs Türk Cumhuriyeti' }
      })
    )
    await waitFor(() => expect(within(result).getByRole('button', { name: 'Tabloyu kopyala' })).toBeEnabled())
  })

  it('uyruğu boş KBS satırı satır bazında bir ülkeye atanır; atanınca tablo kopyalanabilir (P10fix #4)', async () => {
    const user = userEvent.setup()
    const blankRow = {
      rowId: '01JTOURISMROW0000000000009',
      room: '305',
      arrival: localDate('2026-09-11'),
      departure: localDate('2026-09-12'),
      raw: '-',
      country: null
    }
    const { transport } = await render({ table: { ...TABLE, review: [], blankNationality: [blankRow] } })
    const result = await screen.findByTestId('tourism-step-result')
    expect(within(result).getByRole('button', { name: 'Tabloyu kopyala' })).toBeDisabled()
    expect(within(result).getByTestId('tourism-pending')).toHaveTextContent('Onay bekleyen 1 uyruk var')
    const blank = screen.getByTestId('tourism-blank')
    expect(within(blank).getByText('Uyruk eksik')).toBeInTheDocument()
    await user.click(within(blank).getByRole('button', { name: /^Ülke seçin: Oda 305/ }))
    await user.click(await screen.findByRole('option', { name: 'Türkiye' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'tourism.assignRow',
        input: { importId: IMPORT.id, rowId: blankRow.rowId, iso2: 'TR' }
      })
    )
    await waitFor(() => expect(within(result).getByRole('button', { name: 'Tabloyu kopyala' })).toBeEnabled())
    expect(within(screen.getByTestId('tourism-blank')).getByText('Türkiye')).toBeInTheDocument()
    // Nothing is remembered for later files: the spelling confirmation is never called.
    expect(transport.calls.some((c) => c.name === 'tourism.confirmCountry')).toBe(false)
  })

  it('bildirildi işareti tarihiyle görünür ve geçmişe düşer', async () => {
    const user = userEvent.setup()
    const { transport } = await render({ table: { ...TABLE, review: [] } })
    await user.click(await screen.findByTestId('mark-reported'))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'tourism.markReported',
        input: { importId: IMPORT.id, reported: true }
      })
    )
    expect(
      await within(screen.getByTestId('tourism-reported')).findByText(/Bildirildi · 5 Eki/)
    ).toBeInTheDocument()
    expect(within(screen.getByTestId('tourism-history')).getByText(/bildirildi/)).toBeInTheDocument()
  })

  it('karşılaştırma ülke farkını, uyruk eksik kişiyi ve KBS’de olmayan konaklamayı listeler', async () => {
    await render()
    const cmp = await screen.findByTestId('tourism-compare')
    expect(await within(cmp).findByText('Deneme Misafir')).toBeInTheDocument()
    expect(within(cmp).getByText('Uyruğu eksik 1 kişi')).toBeInTheDocument()
    expect(within(cmp).getByText("KBS'de olmayan 1 konaklama")).toBeInTheDocument()
    expect(within(cmp).getByTestId('compare-differences')).toHaveTextContent('Almanya')
    // K-29: stays without a list of people are counted by their adults; the screen says so.
    expect(within(cmp).getByTestId('compare-head-count')).toHaveTextContent(
      'Kişi listesi olmayan 2 konaklamada yetişkin sayısı kadar giriş sayıldı; çocuklar ayrı sayılmadı'
    )
  })

  it('seçilen dosya base64 olarak içe alınır; xlsx olmayan dosya reddedilir', async () => {
    const { transport } = await render({ imports: [] })
    const input = (await screen.findByTestId('kbs-file')) as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'liste.pdf')] } })
    expect(transport.calls.some((c) => c.name === 'tourism.import')).toBe(false)
    const file = new File(['PK'], 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx')
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'tourism.import',
        input: { fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx', dataBase64: btoa('PK') }
      })
    )
    expect(await screen.findByTestId('tourism-preview')).toHaveTextContent('607')
  })

  it('yetkisi olmayan rol ekrana giremez ve liste istenmez', async () => {
    act(() => setViewAs('reception'))
    const { transport } = await render()
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
    expect(transport.calls.some((c) => c.name === 'tourism.listImports')).toBe(false)
  })

  it('telefonda tablo liste olur; satır kopyalama düğmesi her satırda', async () => {
    phone()
    await render({ table: { ...TABLE, review: [] } })
    const result = await screen.findByTestId('tourism-step-result')
    expect(within(result).queryByRole('table')).not.toBeInTheDocument()
    const list = within(result).getByRole('list', { name: '3. Bakanlık tablosu' })
    expect(within(list).getByRole('button', { name: 'Almanya satırını kopyala' })).toBeInTheDocument()
  })
})
