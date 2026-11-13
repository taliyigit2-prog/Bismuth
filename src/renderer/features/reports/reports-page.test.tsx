import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate as d } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { compareOf, initialChoice, monthsBetween, periodOf, yearsBetween } from './period'
import { ReportsPage } from './reports-page'
import { STAFF, reportsTransport, type ReportsState } from './test-data'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
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

const render = (state: ReportsState = {}) => {
  const transport = reportsTransport(state)
  return renderWithProviders(<ReportsPage />, { transport }).then((r) => ({ ...r, transport }))
}

describe('rapor dönemi (G-104)', () => {
  const today = d('2026-10-20')
  it('bu ay önceki ayla karşılaştırılır; geçen yıl aynı dönem seçilebilir', () => {
    const c = initialChoice(today)
    const p = periodOf(c, today)
    // This month runs up to today and is compared with the same days of the month before.
    expect(p).toEqual({ from: '2026-10-01', to: '2026-10-21' })
    expect(compareOf(c, today)).toEqual({ from: '2026-09-01', to: '2026-09-21' })
    expect(compareOf({ ...c, compare: 'lastYear' }, today)).toEqual({ from: '2025-10-01', to: '2025-10-21' })
    expect(compareOf({ ...c, preset: 'lastMonth' }, today)).toEqual({ from: '2026-08-01', to: '2026-09-01' })
  })
  it('"bu yıl" geçen yılın aynı ay-gününe kadar karşılaştırılır; artık yıl günü kaydırmaz (P10fix #12)', () => {
    const thisYear = (day: string) => {
      const today = d(day)
      return compareOf({ ...initialChoice(today), preset: 'thisYear' }, today)
    }
    expect(thisYear('2028-10-05')).toEqual({ from: '2027-01-01', to: '2027-10-06' })
    expect(thisYear('2029-10-05')).toEqual({ from: '2028-01-01', to: '2028-10-06' })
    expect(thisYear('2028-03-01')).toEqual({ from: '2027-01-01', to: '2027-03-02' })
    expect(thisYear('2028-02-29')).toEqual({ from: '2027-01-01', to: '2027-03-01' })
    expect(thisYear('2026-10-05')).toEqual({ from: '2025-01-01', to: '2025-10-06' })
  })
  it('özel aralık ters girilse de düzelir, bitiş günü dahil', () => {
    const p = periodOf(
      { preset: 'custom', from: d('2026-10-10'), until: d('2026-10-01'), compare: 'none' },
      today
    )
    expect(p).toEqual({ from: '2026-10-01', to: '2026-10-11' })
  })
  it('yıl ve ay listeleri ilk kayıttan bugüne, yeniden eskiye', () => {
    expect(yearsBetween(d('2024-05-01'), today)).toEqual([2026, 2025, 2024])
    expect(monthsBetween(d('2026-08-15'), today)).toEqual(['2026-10', '2026-09', '2026-08'])
    expect(monthsBetween(null, today)).toEqual(['2026-10'])
  })
})

describe('Raporlar ekranı', { timeout: 30_000 }, () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    await render({ pending: true })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('okunamazsa yeniden dene düğmesi çıkar', async () => {
    await render({ failContext: true })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('hiç kayıt yoksa boş durum nasıl başlanacağını söyler', async () => {
    await render({
      context: { today: d('2026-10-20'), baseCurrency: 'TRY', firstDay: null, dayUseIncluded: false }
    })
    expect(await screen.findByText('Rapor için henüz kayıt yok')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Deftere git' })).toHaveAttribute('href', '/ledger')
  })

  it('resepsiyon rapor ekranını göremez ve servis hiç çağrılmaz', async () => {
    act(() => setViewAs('reception'))
    const { transport } = await render()
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
    expect(transport.calls.filter((c) => c.name.startsWith('reports.'))).toEqual([])
  })

  it('özet: ciro, kâr, gider, doluluk önceki döneme göre; gelir detayı yöntem × para birimi', async () => {
    const { transport } = await render()
    const kpis = await screen.findByTestId('report-kpis')
    expect(kpis).toHaveTextContent('Ciro')
    expect(kpis).toHaveTextContent('₺37.300')
    expect(kpis).toHaveTextContent('₺33.300')
    expect(kpis).toHaveTextContent('%16,9')
    // 37.300 against 30.000 the month before.
    expect(kpis).toHaveTextContent('%24,3')
    expect(transport.calls).toContainEqual({
      name: 'reports.summary',
      input: { from: '2026-09-01', to: '2026-09-21' }
    })
    const income = await screen.findByTestId('income-detail')
    expect(within(income).getByRole('columnheader', { name: 'EUR' })).toBeInTheDocument()
    expect(within(income).getByRole('columnheader', { name: 'TRY karşılığı' })).toBeInTheDocument()
    expect(within(income).getByText('Kredi kartı')).toBeInTheDocument()
    expect(income).toHaveTextContent('€20')
    expect(screen.getByTestId('period-range')).toHaveTextContent('1 Ekim 2026 – 20 Ekim 2026')
    expect(screen.getByTestId('owner-expenses')).toHaveTextContent('Kira payı')
    expect(screen.getByTestId('top-expenses')).toHaveTextContent('Personel (maaş, avans, izin)')
  })

  it('günlük ciro tablosunda bir güne basınca gün dökümü ve defter bağlantısı açılır', async () => {
    const user = userEvent.setup()
    await render()
    const chart = await screen.findByTestId('chart-daily')
    await user.click(within(chart).getByRole('radio', { name: 'Tablo' }))
    await user.click(within(chart).getByRole('button', { name: '2 Eki 2026' }))
    const detail = await screen.findByTestId('day-detail')
    expect(detail).toHaveTextContent('₺26.300')
    expect(within(detail).getByRole('link', { name: /Defterde aç/ })).toHaveAttribute(
      'href',
      '/ledger?day=2026-10-02'
    )
    await user.click(within(detail).getByRole('button', { name: 'Gün dökümünü kapat' }))
    expect(screen.queryByTestId('day-detail')).not.toBeInTheDocument()
  })

  it('dönem "geçen ay" ve karşılaştırma "geçen yıl" seçilince servis o tarihlerle çağrılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByTestId('report-kpis')
    await user.click(screen.getByTestId('period-preset'))
    await user.click(await screen.findByRole('option', { name: 'Geçen ay' }))
    await user.click(screen.getByTestId('period-compare'))
    await user.click(await screen.findByRole('option', { name: 'Geçen yıl aynı dönem' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.summary',
        input: { from: '2025-09-01', to: '2025-10-01' }
      })
    )
    expect(transport.calls).toContainEqual({
      name: 'reports.monthly',
      input: { from: '2026-09-01', to: '2026-10-01' }
    })
  })

  it('bir tablo CSV olarak, raporun tamamı Excel olarak dışa aktarılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByTestId('report-kpis')
    await user.click(screen.getByTestId('export-channels'))
    await user.click(await screen.findByRole('menuitem', { name: 'CSV (.csv)' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.export',
        input: {
          report: 'monthly',
          from: '2026-10-01',
          to: '2026-10-21',
          format: 'csv',
          locale: 'tr',
          table: 'channels'
        }
      })
    )
    await user.click(screen.getByTestId('export-report'))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.export',
        input: { report: 'monthly', from: '2026-10-01', to: '2026-10-21', format: 'xlsx', locale: 'tr' }
      })
    )
  })

  it('yazdır: otel adı ve dönemle yazdırma düzeni kurulur, tablolar grafiğin yerine geçer', async () => {
    const user = userEvent.setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await render()
    await screen.findByTestId('report-kpis')
    await user.click(screen.getByTestId('print-report'))
    const root = await screen.findByTestId('print-root')
    await waitFor(() => expect(print).toHaveBeenCalled())
    expect(within(root).getByTestId('print-range')).toHaveTextContent('1 Ekim 2026 – 20 Ekim 2026')
    expect(within(root).getByTestId('print-hotel')).toHaveTextContent('Bismuth')
    expect(within(root).queryByRole('radio', { name: 'Grafik' })).not.toBeInTheDocument()
    expect(await within(root).findAllByRole('table')).not.toHaveLength(0)
    act(() => void window.dispatchEvent(new Event('afterprint')))
    await waitFor(() => expect(screen.queryByTestId('print-root')).not.toBeInTheDocument(), { timeout: 4000 })
  })

  it('yıllık özet iki yılı yan yana gösterir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('tab-yearly'))
    expect(await screen.findByTestId('yearly-kpis')).toHaveTextContent('₺165.000')
    await user.click(screen.getByTestId('report-other-year'))
    await user.click(await screen.findByRole('option', { name: '2025' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({ name: 'reports.yearly', input: { years: [2026, 2025] } })
    )
    expect(await screen.findByTestId('chart-two-years')).toHaveTextContent('Ciro: 2026 ve 2025')
    // 2026 runs to October: compared with January–October 2025 (11.000), not the whole year (15.600) — +%50.
    const kpis = screen.getByTestId('yearly-kpis')
    expect(kpis).toHaveTextContent('2025 yılının aynı aylarına göre')
    expect(kpis).toHaveTextContent(/%50/)
  })

  it('doluluk: ADR, RevPAR, ortalama kalış, ısı haritası ve odalar', async () => {
    const user = userEvent.setup()
    await render()
    await user.click(await screen.findByTestId('tab-occupancy'))
    const kpis = await screen.findByTestId('occupancy-kpis')
    expect(kpis).toHaveTextContent('₺2.486,67') // K-46: kuruş shown when there is some
    expect(kpis).toHaveTextContent('5,0 gece')
    expect(kpis).toHaveTextContent('3 misafirden 1 kişi')
    expect(screen.getByTestId('chart-heatmap')).toHaveTextContent('%60')
    expect(screen.getByTestId('rooms-table')).toHaveTextContent('101')
    expect(screen.getByTestId('day-use')).toHaveTextContent('Bu dönemde 1 saatlik ya da aynı gün satış')
    expect(screen.getByTestId('top-guests')).toHaveTextContent('Deniz Arslan')
  })

  it('konaklama türü süzgeci servise stayKind ile gider; Tümü düz dönemi gönderir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('tab-occupancy'))
    await screen.findByTestId('occupancy-kpis')
    expect(screen.queryByRole('switch', { name: 'Dolulukta say' })).not.toBeInTheDocument()
    await user.click(screen.getByTestId('stay-kind-hourly'))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.occupancy',
        input: { from: '2026-10-01', to: '2026-10-21', stayKind: 'hourly' }
      })
    )
    expect(transport.calls).toContainEqual({
      name: 'reports.summary',
      input: { from: '2026-10-01', to: '2026-10-21', stayKind: 'hourly' }
    })
    await user.click(screen.getByTestId('stay-kind-overnight'))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.occupancy',
        input: { from: '2026-10-01', to: '2026-10-21', stayKind: 'overnight' }
      })
    )
  })

  it('kasa, gider ve personel sekmeleri kendi tablolarını gösterir', async () => {
    const user = userEvent.setup()
    await render()
    await user.click(await screen.findByTestId('tab-cash'))
    expect(await screen.findByTestId('cash-unchecked')).toHaveTextContent('Deniz Arslan')
    expect(screen.getByTestId('cash-aging')).toHaveTextContent('8–30 gün')
    expect(screen.getByTestId('cash-drawer')).toHaveTextContent('₺1.500')
    await user.click(screen.getByTestId('tab-expenses'))
    expect(await screen.findByTestId('expenses-kpis')).toHaveTextContent('%10,0')
    await user.click(screen.getByTestId('tab-staff'))
    expect(await screen.findByTestId('staff-employees')).toHaveTextContent('Deniz Yıldız')
  })

  it('personel raporu maaş yetkisi olmadan para sütunu ve maliyet göstermez (P10fix #2)', async () => {
    const user = userEvent.setup()
    await render({
      staff: {
        ...STAFF,
        salaryVisible: false,
        employees: STAFF.employees.map((e) => ({ ...e, costMinor: null, byKind: {} })),
        months: STAFF.months.map((m) => ({ ...m, costMinor: null })),
        laborRatioBp: null
      }
    })
    await user.click(await screen.findByTestId('tab-staff'))
    const table = await screen.findByTestId('staff-employees')
    expect(table).toHaveTextContent('Deniz Yıldız')
    expect(table).not.toHaveTextContent('₺')
    expect(screen.queryByTestId('chart-staff')).not.toBeInTheDocument()
    expect(screen.getByTestId('staff-kpis')).not.toHaveTextContent('Yıllık maliyet')
  })

  it('müdür personel raporunu görmez; para sekmeleri görünür', async () => {
    act(() => setViewAs('manager'))
    await render()
    await screen.findByTestId('report-kpis')
    expect(screen.queryByTestId('tab-staff')).not.toBeInTheDocument()
    expect(screen.getByTestId('tab-cash')).toBeInTheDocument()
  })

  it('telefonda sekmeler açılır listeye döner', async () => {
    phone()
    await render()
    expect(await screen.findByTestId('report-tab-select')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-yearly')).not.toBeInTheDocument()
  })
})
