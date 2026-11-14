// P21c (K-54): the owner's portfolio of two hotels. Each hotel is its own database (a factory hotel each); the figures
// are the ones the Today screen, the cash panel and the reports give (same services), money stays per hotel and
// per currency, and only the owner's rights open it. The client path reads the hotel in use live and the other hotel
// from its read-only copy, saying where each figure came from.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { portfolioHandlers } from '../../src/main/api/handlers/portfolio'
import type { DatabaseHandle } from '../../src/main/db/client'
import { paymentMethods, roomTypes, salesChannels } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import { AppError } from '../../src/main/services/errors'
import { createPortfolioClient } from '../../src/main/server/portfolio-client'
import type { AuthState } from '../../src/shared/contract/admin'
import type { SavedHotel } from '../../src/shared/contract/remote'
import { localDate } from '../../src/shared/date'
import { defaultPermissions } from '../../src/shared/permissions'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

const owner = roleCtx('owner')
const ENV = { session: null, transport: 'ipc' as const }
const OCTOBER = { from: localDate('2026-10-01'), to: localDate('2026-11-01') }
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}

const handles: DatabaseHandle[] = []
afterEach(() => {
  for (const h of handles.splice(0)) h.close()
})

/** A hotel with rooms 101…, one stay and one payment: `price` a night for `nights` nights from 2026-10-02. */
async function factoryHotel(options: { rooms: number; nights: number; price: number; currency: string }) {
  const handle = await seededDatabase()
  handles.push(handle)
  const services = createServices(handle, runtime, { clock: testClock('2026-10-03T09:00:00.000Z') })
  const id = <T extends typeof paymentMethods | typeof salesChannels | typeof roomTypes>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  if (options.currency !== 'TRY') {
    services.settings.set(owner, {
      'hotel.currencies': [options.currency],
      'hotel.baseCurrency': options.currency
    } as never)
  }
  const typeId = id(roomTypes, 'standard')
  const rooms = Array.from({ length: options.rooms }, (_, i) =>
    services.rooms.createRoom(owner, {
      number: `${101 + i}`,
      roomTypeId: typeId,
      beds: 2,
      validFrom: '2026-01-01'
    })
  )
  const made = services.reservations.create(owner, {
    guest: { firstName: 'Örnek', lastName: 'Misafir' },
    channelId: id(salesChannels, 'direct'),
    stays: [
      {
        roomId: rooms[0]!.id,
        checkIn: '2026-10-02',
        checkOut: `2026-10-0${2 + options.nights}`,
        nightlyPriceMinor: options.price
      }
    ]
  })
  services.reservations.checkIn(owner, made.stays[0]!.id)
  services.payments.create(owner, {
    reservationId: made.reservation.id,
    date: '2026-10-02',
    methodId: id(paymentMethods, 'cash'),
    amountMinor: options.price * options.nights,
    currency: options.currency,
    kind: 'payment'
  })
  return { handle, services }
}

describe('portföy: bir otelin rakamları', () => {
  it('bugünkü doluluk, kasa ve dönem gelir-gider ekran servisleriyle aynı sayıdır', async () => {
    const h = await factoryHotel({ rooms: 3, nights: 2, price: 250_000, currency: 'TRY' })
    const out = (await portfolioHandlers(h.services)['portfolio.overview'](owner, OCTOBER, ENV)) as {
      mode: string
      hotels: { code: string | null; source: string; state: string; figures: Record<string, unknown> }[]
    }
    expect(out.mode).toBe('host')
    expect(out.hotels).toHaveLength(1)
    const only = out.hotels[0]!
    expect(only).toMatchObject({ code: null, source: 'live', state: 'ok' })
    const report = h.services.reports.summary(owner, OCTOBER)
    const day = h.services.occupants.dayLists(owner)
    const drawer = h.services.ledger.cashPanel(owner).drawer
    expect(only.figures).toMatchObject({
      today: day.today,
      baseCurrency: report.baseCurrency,
      sellableRooms: 3,
      soldTonight: day.soldTonight,
      period: {
        occupancyBp: report.occupancy.occupancyBp,
        revenueMinor: report.finance!.revenueMinor,
        expensesMinor: report.finance!.expensesMinor,
        profitMinor: report.finance!.profitMinor
      }
    })
    expect(report.finance!.revenueMinor).toBe(500_000)
    expect(only.figures.drawer).toEqual(
      Object.entries(drawer)
        .filter(([, v]) => v !== 0)
        .map(([currency, amountMinor]) => ({ currency, amountMinor }))
    )
  })

  it('ana bilgisayarda kendi takvimi gelir; başka otel istenirse bulunamadı der', async () => {
    const h = await factoryHotel({ rooms: 2, nights: 1, price: 100_000, currency: 'TRY' })
    const handlers = portfolioHandlers(h.services)
    const grid = await handlers['portfolio.grid'](
      owner,
      { hotel: null, from: localDate('2026-10-01'), to: localDate('2026-10-15') },
      ENV
    )
    expect(grid).toMatchObject({ source: 'live', syncedAt: null })
    expect(grid.grid.rooms.map((r) => r.number)).toEqual(['101', '102'])
    expect(grid.grid.stays).toHaveLength(1)
    await expect(
      (async () =>
        handlers['portfolio.grid'](
          owner,
          { hotel: 'otel-b', from: localDate('2026-10-01'), to: localDate('2026-10-15') },
          ENV
        ))()
    ).rejects.toBeInstanceOf(AppError)
  })
})

const savedHotel = (code: string, name: string, active: boolean): SavedHotel => ({
  code,
  name,
  url: `http://100.64.0.${code === 'a' ? 10 : 20}:7373`,
  fingerprint: null,
  lastUsedAt: null,
  active
})

const sessionOf = (role: Parameters<typeof defaultPermissions>[0], locked = false): AuthState['session'] =>
  ({
    user: { id: `user-${role}` },
    permissions: defaultPermissions(role),
    locked
  }) as unknown as AuthState['session']

describe('portföy: iki otel, istemci bilgisayar', () => {
  async function setup(
    options: { session?: AuthState['session']; live?: 'ok' | 'down'; copyOfB?: boolean } = {}
  ) {
    const a = await factoryHotel({ rooms: 3, nights: 2, price: 250_000, currency: 'TRY' })
    const b = await factoryHotel({ rooms: 2, nights: 1, price: 40_000, currency: 'EUR' })
    const hostA = portfolioHandlers(a.services)
    const live = async (_w: number, name: string, body: string) => {
      if (options.live === 'down')
        return { status: 503, body: JSON.stringify({ error: { code: 'UNAVAILABLE' } }) }
      const input = JSON.parse(body)
      const out = await (name === 'portfolio.overview'
        ? hostA['portfolio.overview'](owner, input, ENV)
        : hostA['portfolio.grid'](owner, input, ENV))
      return { status: 200, body: JSON.stringify(out) }
    }
    const client = createPortfolioClient({
      hotels: () => [savedHotel('a', 'Otel A', true), savedHotel('b', 'Otel B', false)],
      live,
      session: async () => (options.session === undefined ? sessionOf('owner') : options.session),
      copy: (code) =>
        code === 'b' && options.copyOfB !== false
          ? { services: b.services, asOf: '2026-10-03T08:30:00.000Z' }
          : code === 'a'
            ? { services: a.services, asOf: '2026-10-03T08:00:00.000Z' }
            : null
    })
    return { a, b, client }
  }

  type Hotels = {
    mode: string
    hotels: {
      code: string
      source: string | null
      state: string
      syncedAt: string | null
      figures: { period: { revenueMinor: number }; baseCurrency: string; sellableRooms: number }
    }[]
  }

  it('kullanımdaki otel canlı, öteki kopyadan gelir; rakamlar o otelin kendi raporuyla aynı, para birimleri ayrı', async () => {
    const { a, b, client } = await setup()
    const answer = await client.overview(1, OCTOBER)
    expect(answer.status).toBe(202)
    const out = JSON.parse(answer.body) as Hotels
    expect(out.mode).toBe('client')
    const [first, second] = out.hotels
    expect(first).toMatchObject({ code: 'a', source: 'live', state: 'ok', syncedAt: null })
    expect(second).toMatchObject({
      code: 'b',
      source: 'copy',
      state: 'ok',
      syncedAt: '2026-10-03T08:30:00.000Z'
    })
    expect(first!.figures.period.revenueMinor).toBe(
      a.services.reports.summary(owner, OCTOBER).finance!.revenueMinor
    )
    expect(second!.figures.period.revenueMinor).toBe(
      b.services.reports.summary(owner, OCTOBER).finance!.revenueMinor
    )
    expect(first!.figures.baseCurrency).toBe('TRY')
    expect(second!.figures.baseCurrency).toBe('EUR')
    expect(second!.figures.period.revenueMinor).toBe(40_000)
    expect(second!.figures.sellableRooms).toBe(2)
  })

  it('ana bilgisayara ulaşılamayınca kullanımdaki otel de kopyadan gelir ve tarihi gösterilir', async () => {
    const { client } = await setup({ live: 'down' })
    const out = JSON.parse((await client.overview(1, OCTOBER)).body) as Hotels
    expect(out.hotels[0]).toMatchObject({
      code: 'a',
      source: 'copy',
      syncedAt: '2026-10-03T08:00:00.000Z',
      state: 'ok'
    })
  })

  it('kopyası olmayan otel "kopya yok" durumunda gelir, rakam uydurulmaz', async () => {
    const { client } = await setup({ copyOfB: false })
    const out = JSON.parse((await client.overview(1, OCTOBER)).body) as Hotels
    expect(out.hotels[1]).toMatchObject({ code: 'b', state: 'noCopy', source: null, figures: null })
    expect(out.hotels[0]!.state).toBe('ok')
  })

  it('sahip olmayan kullanıcı 403, kilitli pencere ve oturumsuz pencere 401 alır', async () => {
    for (const [session, status] of [
      [sessionOf('manager'), 403],
      [sessionOf('reception'), 403],
      [sessionOf('owner', true), 401],
      [null, 401]
    ] as const) {
      const { client } = await setup({ session })
      expect((await client.overview(1, OCTOBER)).status).toBe(status)
      expect((await client.grid(1, { hotel: 'b', from: '2026-10-01', to: '2026-10-15' })).status).toBe(status)
    }
  })

  it('diğer otelin takvimi kopyadan gelir (salt okunur); kopya yoksa bulunamadı, bilinmeyen otel 404', async () => {
    const { b, client } = await setup()
    const input = { hotel: 'b', from: '2026-10-01', to: '2026-10-15' }
    const answer = await client.grid(1, input)
    const out = JSON.parse(answer.body) as {
      source: string
      syncedAt: string
      grid: { rooms: unknown[]; stays: unknown[] }
    }
    expect(answer.status).toBe(202)
    expect(out).toMatchObject({ source: 'copy', syncedAt: '2026-10-03T08:30:00.000Z' })
    expect(out.grid.rooms).toHaveLength(2)
    expect(out.grid.stays).toHaveLength(1)
    expect(out.grid).toEqual(
      JSON.parse(JSON.stringify(b.services.calendar.grid(owner, { from: input.from, to: input.to })))
    )
    expect((await client.grid(1, { ...input, hotel: 'zzz' })).status).toBe(404)
    const none = await setup({ copyOfB: false })
    expect((await none.client.grid(1, input)).status).toBe(404)
  })

  it('kullanımdaki otelin takvimi canlı gelir', async () => {
    const { client } = await setup()
    const answer = await client.grid(1, { hotel: 'a', from: '2026-10-01', to: '2026-10-15' })
    expect(JSON.parse(answer.body)).toMatchObject({ source: 'live' })
  })
})
