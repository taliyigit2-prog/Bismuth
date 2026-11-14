import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import type { PortfolioGrid, PortfolioHotel, PortfolioOverview } from '@shared/contract/procedures/portfolio'
import { ApiError } from '@/lib/transport/types'
import { fakeTransport, type FakeTransport } from '@/test/render'
import { renderWithProviders } from '@/test/render'
import { PortfolioPage } from './portfolio-page'
import { totalsByCurrency } from './portfolio-model'

const figures = (over: Record<string, unknown> = {}): NonNullable<PortfolioHotel['figures']> =>
  ({
    today: '2026-10-03',
    baseCurrency: 'TRY',
    sellableRooms: 4,
    soldTonight: 3,
    drawer: [{ currency: 'TRY', amountMinor: 1_250_000 }],
    period: {
      from: '2026-10-01',
      to: '2026-10-04',
      occupancyBp: 6250,
      revenueMinor: 3_730_000,
      expensesMinor: 500_000,
      profitMinor: 3_230_000,
      partial: false
    },
    ...over
  }) as unknown as NonNullable<PortfolioHotel['figures']>

const hotelA = {
  code: 'otel-a',
  name: 'Otel A',
  active: true,
  source: 'live',
  syncedAt: null,
  state: 'ok',
  figures: figures()
} as unknown as PortfolioHotel
const hotelB = {
  code: 'otel-b',
  name: 'Otel B',
  active: false,
  source: 'copy',
  syncedAt: '2026-10-03T08:30:00.000Z',
  state: 'ok',
  figures: figures({
    baseCurrency: 'EUR',
    drawer: [],
    soldTonight: 1,
    sellableRooms: 2,
    period: {
      from: '2026-10-01',
      to: '2026-10-04',
      occupancyBp: 3000,
      revenueMinor: 90_000,
      expensesMinor: 10_000,
      profitMinor: 80_000,
      partial: false
    }
  })
} as unknown as PortfolioHotel

const grid = (): PortfolioGrid =>
  ({
    source: 'live',
    syncedAt: null,
    grid: {
      today: '2026-10-03',
      from: '2026-10-01',
      to: '2026-11-01',
      rooms: [
        {
          id: 'r1',
          number: '101',
          floor: null,
          typeId: 't1',
          typeName: 'Standart',
          typeNameI18n: null,
          beds: 2,
          sellable: true,
          hk: 'clean'
        },
        {
          id: 'r2',
          number: '102',
          floor: null,
          typeId: 't1',
          typeName: 'Standart',
          typeNameI18n: null,
          beds: 2,
          sellable: true,
          hk: 'clean'
        }
      ],
      stays: [
        {
          id: 's1',
          reservationId: 'x1',
          code: '2026-001',
          roomId: 'r1',
          checkIn: '2026-10-03',
          checkOut: '2026-10-05',
          dayUse: false,
          reservationStatus: 'confirmed',
          stayStatus: 'planned',
          guestName: 'Ayşe Örnek',
          currency: 'TRY',
          nights: [],
          tagIds: [],
          vip: false,
          kbsMissing: false,
          standingNote: null,
          hasNotes: false,
          children: 0
        }
      ],
      blocks: [],
      days: []
    }
  }) as unknown as PortfolioGrid

interface State {
  overview: PortfolioOverview | 'hang' | 'fail' | 'denied'
}

function transportOf(state: State): FakeTransport & { asked: { name: string; input: unknown }[] } {
  const t = fakeTransport()
  const call = t.call.bind(t)
  const asked: { name: string; input: unknown }[] = []
  t.call = (async (name: string, input: unknown) => {
    if (name === 'portfolio.overview') {
      asked.push({ name, input })
      if (state.overview === 'hang') return new Promise(() => {})
      if (state.overview === 'fail') throw new ApiError('INTERNAL', 500, 'errors.internal')
      if (state.overview === 'denied') throw new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
      return state.overview
    }
    if (name === 'portfolio.grid') {
      asked.push({ name, input })
      return grid()
    }
    return call(name as never, input as never)
  }) as FakeTransport['call']
  return Object.assign(t, { asked })
}

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

afterEach(() => vi.restoreAllMocks())

describe('Portföy', () => {
  it('iki otelin kartı gelir: doluluk, kasa, gelir-gider ve kaynağı (canlı / kopya + son eşitleme)', async () => {
    const transport = transportOf({ overview: { mode: 'client', hotels: [hotelA, hotelB] } })
    await renderWithProviders(<PortfolioPage />, { transport })
    const a = await screen.findByTestId('portfolio-hotel-otel-a')
    const b = screen.getByTestId('portfolio-hotel-otel-b')
    expect(within(a).getByText('Otel A')).toBeInTheDocument()
    expect(within(a).getByTestId('source-live')).toBeInTheDocument()
    expect(within(a).getByText('%75')).toBeInTheDocument()
    expect(within(a).getByText('3/4 oda')).toBeInTheDocument()
    expect(within(a).getByText('₺12.500')).toBeInTheDocument()
    expect(within(a).getByText('₺37.300')).toBeInTheDocument()
    expect(within(b).getByTestId('source-copy')).toHaveTextContent(/son eşitleme 3 Eki/)
    expect(within(b).getByText('€900')).toBeInTheDocument()
    expect(within(b).getByText(/EUR/)).toBeInTheDocument()
  })

  it('para birimleri farklıysa toplam alınmaz ve nedeni yazılır', async () => {
    await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: { mode: 'client', hotels: [hotelA, hotelB] } })
    })
    expect(await screen.findByTestId('portfolio-no-total')).toHaveTextContent('kur çevirisi yapılmaz')
    expect(screen.queryByTestId('portfolio-totals')).not.toBeInTheDocument()
  })

  it('aynı para biriminde iki otelin toplamı ayrı satırda gelir', async () => {
    const same = { ...hotelB, figures: figures() }
    await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: { mode: 'client', hotels: [hotelA, same] } })
    })
    const line = await screen.findByTestId('portfolio-total-TRY')
    expect(line).toHaveTextContent('TRY · 2 otel')
    expect(line).toHaveTextContent('₺74.600')
  })

  it('kopyası olmayan otelde rakam yok, nasıl açılacağı yazılır', async () => {
    const none: PortfolioHotel = { ...hotelB, source: null, syncedAt: null, state: 'noCopy', figures: null }
    await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: { mode: 'client', hotels: [hotelA, none] } })
    })
    const card = await screen.findByTestId('portfolio-hotel-otel-b')
    expect(within(card).getByText('Bu otelin kopyası yok')).toBeInTheDocument()
    expect(within(card).getByText(/Otele bir kez bağlanıp/)).toBeInTheDocument()
    expect(within(card).queryByTestId('kpi-card')).not.toBeInTheDocument()
  })

  it('ana bilgisayarda yalnız kendi oteli ve "diğer otel için kendi cihazınızdan bağlanın" notu görünür', async () => {
    const own: PortfolioHotel = { ...hotelA, code: null }
    await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: { mode: 'host', hotels: [own] } })
    })
    expect(await screen.findByTestId('portfolio-hotel-own')).toBeInTheDocument()
    expect(screen.getByTestId('portfolio-host-note')).toHaveTextContent('kendi cihazınızdan')
  })

  it('yüklenirken iskelet, hatada "Yeniden dene", yetkisizde "yetkiniz yok" durumu çıkar', async () => {
    const hanging = await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: 'hang' })
    })
    expect(await screen.findByTestId('portfolio-loading')).toHaveAttribute('aria-busy')
    hanging.unmount()
    const failed = await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: 'fail' })
    })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
    failed.unmount()
    await renderWithProviders(<PortfolioPage />, { transport: transportOf({ overview: 'denied' }) })
    expect(await screen.findByText(/yetkiniz yok/i)).toBeInTheDocument()
  })

  it('kayıtlı otel yoksa boş durum çıkar', async () => {
    await renderWithProviders(<PortfolioPage />, {
      transport: transportOf({ overview: { mode: 'client', hotels: [] } })
    })
    expect(await screen.findByText('Kayıtlı otel yok')).toBeInTheDocument()
  })

  it('takvim kullanımdaki otelin ızgarasını salt okunur gösterir (portfolio.grid, otel kodu ile)', async () => {
    const transport = transportOf({ overview: { mode: 'client', hotels: [hotelA, hotelB] } })
    await renderWithProviders(<PortfolioPage />, { transport })
    expect(await screen.findByTestId('portfolio-calendar')).toBeInTheDocument()
    expect(screen.getByText(/Yalnız görüntülenir/)).toBeInTheDocument()
    const asked = transport.asked.filter((a) => a.name === 'portfolio.grid')
    expect(asked.length).toBeGreaterThan(0)
    expect(asked[0]!.input).toMatchObject({ hotel: 'otel-a' })
  })

  it('telefonda takvim gün listesidir: gelenler ve boş odalar', async () => {
    phone()
    const transport = transportOf({ overview: { mode: 'client', hotels: [hotelA, hotelB] } })
    await renderWithProviders(<PortfolioPage />, { transport })
    const list = await screen.findByTestId('portfolio-day-list')
    await waitFor(() => expect(within(list).getByText('Ayşe Örnek')).toBeInTheDocument())
    expect(within(list).getByText('102')).toBeInTheDocument()
  })
})

describe('Portföy toplamları (saf kural)', () => {
  it('farklı para birimi ayrı satır, aynı para birimi toplanır; rakamsız otel sayılmaz', () => {
    const none: PortfolioHotel = { ...hotelB, state: 'noCopy', source: null, figures: null }
    const totals = totalsByCurrency([hotelA, hotelB, { ...hotelA, code: 'c' }, none])
    expect(totals.map((t) => [t.currency, t.hotels, t.revenueMinor])).toEqual([
      ['TRY', 2, 7_460_000],
      ['EUR', 1, 90_000]
    ])
  })
})
