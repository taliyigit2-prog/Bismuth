import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import type { FakeTransport } from '@/test/render'
import { monthEnd, reportsTransport, type ReportsState } from '../reports/test-data'
import { autoDone, salaryLeftByCurrency, visibleSteps } from './derive'
import { MonthEndPage } from './month-end-page'
import { resetLegacyTicksMove } from './use-ticks'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  resetLegacyTicksMove()
  act(() => setViewAs('owner'))
})

/** The person's ticks as the main computer keeps them (K-46 (6)): month → ticks. */
type TickStore = Map<string, string[]>

/** The reports fake plus the two tick procedures over `store` (the service's own rules are tested in main). */
function withTicks(transport: FakeTransport, store: TickStore): FakeTransport {
  const call = transport.call.bind(transport)
  transport.call = (async (name: string, input: unknown) => {
    const q = input as { year: number; month: number; ticks?: string[]; merge?: boolean }
    const key = `${q?.year}-${String(q?.month).padStart(2, '0')}`
    if (name === 'reports.monthEndTicks') return { ticks: store.get(key) ?? [] }
    if (name === 'reports.setMonthEndTicks') {
      transport.calls.push({ name: 'reports.setMonthEndTicks', input })
      const next = q.merge ? [...new Set([...(store.get(key) ?? []), ...(q.ticks ?? [])])] : (q.ticks ?? [])
      store.set(key, next)
      return { ticks: next }
    }
    return call(name as never, input as never)
  }) as FakeTransport['call']
  return transport
}

const render = (state: ReportsState = {}, store: TickStore = new Map()) => {
  const transport = withTicks(reportsTransport(state), store)
  return renderWithProviders(<MonthEndPage />, { transport }).then((r) => ({ ...r, transport, store }))
}

describe('ay sonu adımları (G-100)', () => {
  it('kart/IBAN, maaş ve bakanlık adımı kayıtlardan kapanır', () => {
    const m = monthEnd()
    expect(autoDone(m)).toEqual({ cards: false, salaries: false, tourism: false })
    const done = monthEnd({
      methods: m.methods.map((x) => ({ ...x, pendingMinor: 0, receivedMinor: x.totalMinor, pendingRows: 0 })),
      salaries: {
        rows: m.salaries!.rows.map((r) => ({ ...r, paid: r.net, remaining: 0 })),
        withoutSalary: 0
      },
      tourism: { imported: true, reportedAt: '2026-10-04T10:00:00.000Z', due: m.tourism!.due }
    })
    expect(autoDone(done)).toEqual({ cards: true, salaries: true, tourism: true })
    expect(visibleSteps(monthEnd({ salaries: null, tourism: null }))).toEqual(['cards', 'results', 'top'])
  })
})

describe('Ay sonu kontrolü ekranı', { timeout: 30_000 }, () => {
  it('maaş adımı her çalışanın kalanı sıfır ya da altındayken kapanır; fazla ödenen eksik olanı örtmez (P10fix #3)', () => {
    const base = monthEnd().salaries!.rows[0]!
    const rows = [
      { ...base, paid: 6_300_000, remaining: -3_150_000 },
      { ...base, employeeId: 'e2', fullName: 'Ali Kaya', paid: 0, remaining: 3_150_000 }
    ]
    expect(autoDone(monthEnd({ salaries: { rows, withoutSalary: 0 } })).salaries).toBe(false)
    expect(salaryLeftByCurrency(rows)).toEqual([{ currency: 'TRY', amountMinor: 3_150_000 }])
  })

  it('farklı para birimindeki maaşlar toplanmaz: alt toplam para birimi başına (P10fix #3)', async () => {
    const base = monthEnd().salaries!.rows[0]!
    const eur = {
      ...base,
      employeeId: 'e2',
      fullName: 'Anna Petrova',
      currency: 'EUR',
      monthly: 100_000,
      net: 100_000,
      paid: 0,
      remaining: 100_000,
      advances: 0,
      leavePayout: 0
    }
    await render({ monthEnd: monthEnd({ salaries: { rows: [base, eur], withoutSalary: 0 } }) })
    const card = await screen.findByTestId('month-salaries')
    expect(within(card).getByTestId('salary-total-EUR')).toHaveTextContent('Toplam (EUR)')
    expect(within(card).getByTestId('salary-total-EUR')).toHaveTextContent('€1.000')
    expect(within(card).getByTestId('salary-total-TRY')).not.toHaveTextContent('€')
    const check = screen.getByTestId('check-salaries')
    expect(check).toHaveAttribute('data-done', 'false')
    expect(check).toHaveTextContent('€1.000')
  })

  it('otelin eklediği yöntem grubu ay sonu tablosunda görünür (P10fix #6)', async () => {
    const m = monthEnd()
    await render({
      monthEnd: monthEnd({
        methods: [
          ...m.methods.slice(0, 2),
          { group: 'other', totalMinor: 200_000, receivedMinor: 0, pendingMinor: 200_000, pendingRows: 1 },
          m.methods[2]!
        ]
      })
    })
    const card = await screen.findByTestId('month-cards')
    expect(within(card).getByText('Ödeme yöntemleri')).toBeInTheDocument()
    expect(within(card).getByText('Diğer')).toBeInTheDocument()
  })

  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    await render({ pending: true })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('okunamazsa yeniden dene düğmesi çıkar', async () => {
    await render({ failContext: true })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('resepsiyon ay sonunu göremez', async () => {
    act(() => setViewAs('reception'))
    const { transport } = await render()
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
    expect(transport.calls.filter((c) => c.name.startsWith('reports.'))).toEqual([])
  })

  it('geçen ay açılır: kart bekleyen, maaş kalan, ciro/kâr ve en çok harcama', async () => {
    const { transport } = await render()
    expect(await screen.findByTestId('month-kpis')).toHaveTextContent('₺37.300')
    expect(transport.calls).toContainEqual({ name: 'reports.monthEnd', input: { year: 2026, month: 9 } })
    const list = screen.getByTestId('month-checklist')
    expect(within(list).getByTestId('check-cards')).toHaveTextContent('Bankada kontrol bekleyen ₺26.300')
    expect(within(list).getByTestId('check-salaries')).toHaveTextContent('Ödenecek ₺31.500 kaldı')
    expect(within(list).getByTestId('check-tourism')).toHaveTextContent('5 gün kaldı')
    expect(screen.getByTestId('check-progress')).toHaveTextContent('0/5 tamam')
    const cards = screen.getByTestId('month-cards')
    expect(within(cards).getByText('1 satır bekliyor')).toBeInTheDocument()
    expect(screen.getByTestId('month-bank-channels')).toHaveTextContent('Airbnb')
    const salaries = screen.getByTestId('month-salaries')
    expect(salaries).toHaveTextContent('Deniz Yıldız')
    expect(salaries).toHaveTextContent('₺31.500')
    expect(screen.getByTestId('month-top')).toHaveTextContent('Çamaşır suyu')
  })

  it('"ciro" adımı elle işaretlenir ve ana bilgisayarda kişinin tercihine yazılır (K-46 (6))', async () => {
    const user = userEvent.setup()
    const { store } = await render()
    await screen.findByTestId('month-kpis')
    await user.click(within(screen.getByTestId('check-results')).getByRole('checkbox'))
    expect(screen.getByTestId('check-progress')).toHaveTextContent('1/5 tamam')
    await waitFor(() => expect(store.get('2026-09')).toEqual(['results']))
    expect(window.localStorage.getItem('bismuth.monthEnd.2026-09')).toBeNull()
  })

  it('ana bilgisayardaki işaretler başka cihazdan açılınca da görünür', async () => {
    await render({}, new Map([['2026-09', ['results', 'top']]]))
    await screen.findByTestId('month-kpis')
    await waitFor(() => expect(screen.getByTestId('check-progress')).toHaveTextContent('2/5 tamam'))
    expect(within(screen.getByTestId('check-top')).getByRole('checkbox')).toBeChecked()
  })

  it('bu cihazdaki eski işaretler ilk açılışta bir kez kişinin tercihine taşınır ve buradan silinir', async () => {
    window.localStorage.setItem('bismuth.monthEnd.2026-09', JSON.stringify(['top']))
    window.localStorage.setItem('bismuth.monthEnd.2026-07', JSON.stringify(['results', 'bogus']))
    const { store, transport } = await render({}, new Map([['2026-09', ['results']]]))
    await waitFor(() => expect(screen.getByTestId('check-progress')).toHaveTextContent('2/5 tamam'))
    expect(store.get('2026-09')).toEqual(['results', 'top'])
    expect(store.get('2026-07')).toEqual(['results'])
    expect(window.localStorage.getItem('bismuth.monthEnd.2026-09')).toBeNull()
    expect(window.localStorage.getItem('bismuth.monthEnd.2026-07')).toBeNull()
    expect(transport.calls.filter((c) => c.name === 'reports.setMonthEndTicks')).toHaveLength(2)
  })

  it('ay değiştirilince o ayın kontrolü istenir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByTestId('month-kpis')
    await user.click(screen.getByRole('button', { name: 'Önceki ay' }))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({ name: 'reports.monthEnd', input: { year: 2026, month: 8 } })
    )
  })

  it('maaş yetkisi olmayan müdür maaş adımını ve tablosunu görmez', async () => {
    act(() => setViewAs('manager'))
    await render({ monthEnd: monthEnd({ salaries: null }) })
    await screen.findByTestId('month-kpis')
    expect(screen.queryByTestId('month-salaries')).not.toBeInTheDocument()
    expect(screen.queryByTestId('check-salaries')).not.toBeInTheDocument()
  })

  it('dışa aktar ay sonu tablolarını Excel olarak ister', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByTestId('month-kpis')
    await user.click(screen.getByTestId('export-report'))
    await waitFor(() =>
      expect(transport.calls).toContainEqual({
        name: 'reports.export',
        input: { report: 'monthEnd', year: 2026, month: 9, format: 'xlsx', locale: 'tr' }
      })
    )
  })
})
