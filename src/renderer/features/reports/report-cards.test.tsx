// Son kontrol (QA-1): kur kaynakları (Faz 11 teslimat 5) and tedarik giderleri (Faz 12 teslimat 2) on the report
// screens — the summary note, the per-source detail, the supply categories with their table, and the month-end
// check showing the same rate sources.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, type FakeTransport } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { MonthEndPage } from '../month-end/month-end-page'
import { ReportsPage } from './reports-page'
import { MONTHLY, reportsTransport } from './test-data'
import { sourceTotals } from './fx-sources'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  act(() => setViewAs('owner'))
})

/** The report fake with the monthly report changed (no supply right, no foreign currency…). */
function withMonthly(over: Partial<typeof MONTHLY>): FakeTransport {
  const transport = reportsTransport()
  const call = transport.call.bind(transport)
  transport.call = (async (name: string, input: unknown) =>
    name === 'reports.monthly' ? { ...MONTHLY, ...over } : call(name as never, input as never)) as never
  return transport
}

describe('raporlarda kur kaynakları', { timeout: 30_000 }, () => {
  it('kaynak başına kayıt sayısı birleşir: en çok kayıt önce', () => {
    expect(sourceTotals(MONTHLY.fxSources).map((s) => [s.key, s.rows])).toEqual([
      ['market_mid|truncgil', 12],
      ['hotel|', 2],
      ['manual|', 2],
      ['none|', 1]
    ])
  })

  it('özet sekmesi dövizli kayıtların kaynağını özetler ve satır ayrıntısını gösterir', async () => {
    renderWithProviders(<ReportsPage />, { transport: reportsTransport() })
    const card = await screen.findByTestId('fx-sources')
    expect(within(card).getByTestId('fx-sources-note')).toHaveTextContent('Bu dönemde 17 dövizli kayıt var.')
    const summary = within(card).getByTestId('fx-sources-summary')
    expect(summary).toHaveTextContent('Piyasa orta kuru · Truncgil12 kayıt')
    expect(summary).toHaveTextContent('Otel kuru2 kayıt')
    expect(summary).toHaveTextContent('Elle girilen kur2 kayıt')
    expect(summary).toHaveTextContent('Kur yok (toplamlara katılmadı)1 kayıt')
    const table = within(card).getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Kur kaynağı' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'TRY karşılığı' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 4)
    expect(table).toHaveTextContent('₺60.000')
    expect(within(card).getByTestId('export-fxSources')).toBeInTheDocument()
  })

  it('dövizli kayıt yoksa kart çıkmaz', async () => {
    renderWithProviders(<ReportsPage />, { transport: withMonthly({ fxSources: [], supply: null }) })
    await screen.findByTestId('top-expenses')
    expect(screen.queryByTestId('fx-sources')).toBeNull()
    expect(screen.queryByTestId('supply-costs')).toBeNull()
  })

  it('gider sekmesi yalnız giderlerin kur kaynağını gösterir (kayıt sütunu yok)', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReportsPage />, { transport: reportsTransport() })
    await user.click(await screen.findByTestId('tab-expenses'))
    const card = await screen.findByTestId('fx-sources')
    expect(within(card).getByTestId('fx-sources-note')).toHaveTextContent('3 dövizli kayıt')
    expect(within(card).queryByRole('columnheader', { name: 'Kayıt' })).toBeNull()
    expect(card).not.toHaveTextContent('Truncgil')
  })

  it('ay sonu kontrolü aynı kur kaynaklarını gösterir', async () => {
    renderWithProviders(<MonthEndPage />, { transport: reportsTransport() })
    const card = await screen.findByTestId('fx-sources')
    expect(card).toHaveTextContent('Piyasa orta kuru · Truncgil')
    expect(within(card).getByRole('columnheader', { name: 'Kayıt' })).toBeInTheDocument()
  })
})

describe('raporlara tedarik giderleri kartı', { timeout: 30_000 }, () => {
  it('kategoriler grafikte ve tabloda: alım sayısı, tutar ve pay; toplam satırı', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ReportsPage />, { transport: reportsTransport() })
    const card = await screen.findByTestId('supply-costs')
    expect(card).toHaveTextContent('Tedarik giderleri')
    expect(card).toHaveTextContent('3 alım, ürün kategorisine göre')
    await user.click(within(card).getByRole('radio', { name: 'Tablo' }))
    const table = within(card).getByRole('table')
    expect(table).toHaveTextContent('Temizlik')
    expect(table).toHaveTextContent('İçecek')
    expect(table).toHaveTextContent('₺270')
    expect(table).toHaveTextContent('%69,2')
    expect(table).toHaveTextContent('₺390')
    expect(within(card).getByTestId('export-supply')).toBeInTheDocument()
  })

  it('ürünlü alım yoksa ne yapılacağını söyler', async () => {
    renderWithProviders(<ReportsPage />, {
      transport: withMonthly({ supply: { totalMinor: 0, purchases: 0, missingRate: 0, categories: [] } })
    })
    const card = await screen.findByTestId('supply-costs')
    expect(card).toHaveTextContent('Bu dönemde ürünlü alım yok. Alımlar Tedarik ekranından girilir.')
    expect(within(card).queryByTestId('export-supply')).toBeNull()
  })

  it('kuru bilinmeyen alım uyarısı', async () => {
    renderWithProviders(<ReportsPage />, {
      transport: withMonthly({ supply: { ...MONTHLY.supply!, missingRate: 1 } })
    })
    expect(await screen.findByTestId('supply-costs')).toHaveTextContent(
      'Kuru bilinmeyen 1 alım toplama katılmadı.'
    )
  })
})
