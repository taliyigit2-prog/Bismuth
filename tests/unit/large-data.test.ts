// Faz 16 kabul ölçütü "10 yıl × 20 oda sentetik veride takvim ve raporlar kabul edilebilir sürede açılır": the
// screens a receptionist opens every day are called through the same router as the window (IPC path, zod on the
// way in and out) over ten years of a busy twenty-room hotel (tests/factories/big-hotel.ts). The targets come from
// Faz 5 (a calendar window well under the 300 ms first drawing), Faz 7 and Faz 10; the limit allows a loaded CI
// machine three times the target. What is compared is the CPU time the call used (the calls are synchronous SQLite
// work), so the full test run, many files in parallel on a busy machine, does not turn waiting into a failure; wall
// times are printed beside it (`BISMUTH_PERF_LOG=1`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { BIG_FROM, seedBigHotel, type BigHotel } from '../factories/big-hotel'
import { tempDataDir } from '../factories/runtime'

/** Targets in milliseconds (one call, warm); the assertion allows SLACK times as much. */
const TARGET = {
  grid: 300,
  guestList: 500,
  guestSearch: 300,
  ledgerMonth: 300,
  today: 300,
  reports: 1000,
  audit: 300
}
const SLACK = 3

const owner = roleCtx('owner')
let handle: DatabaseHandle
let big: BigHotel
let call: (path: string, body: unknown) => Promise<{ status: number; body: string }>
const measured: Record<string, number> = {}
const wallTimes: Record<string, number> = {}

beforeAll(async () => {
  handle = await seededDatabase(new Date('2016-01-01T08:00:00.000Z'))
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: tempDataDir(),
      electron: null,
      chrome: null
    },
    { clock: testClock('2026-01-03T09:00:00.000Z') }
  )
  big = seedBigHotel(handle, services)
  const api = createApiApp({ handlers: createHandlers(services) })
  call = (path, body) => handleIpcRequest(api, owner, { path: `/api/${path}`, body: JSON.stringify(body) })
}, 300_000)
afterAll(() => {
  handle?.close()
  if (process.env['BISMUTH_PERF_LOG'])
    console.info('large data (cpu ms)', measured, '(wall ms)', wallTimes, big?.counts)
})

/**
 * Best of three warm calls (the first one also builds SQLite's statement cache, as the first screen does), in CPU
 * milliseconds of this process; the wall time goes to the log.
 */
async function timed(name: string, path: string, body: unknown): Promise<unknown> {
  let best = Infinity
  let bestWall = Infinity
  let result: unknown = null
  for (let i = 0; i < 3; i++) {
    const cpu = process.cpuUsage()
    const start = performance.now()
    const res = await call(path, body)
    const wall = performance.now() - start
    const used = process.cpuUsage(cpu)
    expect(res.status, `${path}: ${res.body.slice(0, 300)}`).toBe(200)
    result = JSON.parse(res.body)
    best = Math.min(best, (used.user + used.system) / 1000)
    bestWall = Math.min(bestWall, wall)
  }
  measured[name] = Math.round(best)
  wallTimes[name] = Math.round(bestWall)
  return result
}

describe('10 yıl × 20 oda sentetik veri', () => {
  it('veri 10 yılı ve yirmi odayı doldurur', () => {
    expect(big.roomIds).toHaveLength(20)
    expect(big.counts.nights).toBeGreaterThan(50_000)
    expect(big.counts.reservations).toBeGreaterThan(10_000)
    expect(big.counts.guests).toBeGreaterThan(8_000)
    expect(big.counts.expenses).toBeGreaterThan(5_000)
  })

  it('takvim: bir aylık pencere (bugün, 2016 ve 2021) hedef sürede okunur', async () => {
    for (const [name, from, to] of [
      ['gridNow', '2025-12-15', '2026-01-20'],
      ['gridFirst', BIG_FROM, '2016-02-05'],
      ['gridMiddle', '2021-06-01', '2021-07-06']
    ] as const) {
      const grid = (await timed(name, 'reservations.grid', { from, to })) as { stays: unknown[] }
      expect(grid.stays.length).toBeGreaterThan(100)
      expect(measured[name]).toBeLessThan(TARGET.grid * SLACK)
    }
  })

  it('misafir listesi: boş arama yalnızca bir sayfa döndürür ve hedef sürede açılır', async () => {
    const list = (await timed('guestList', 'guests.list', {})) as { rows: unknown[]; total: number }
    expect(list.rows).toHaveLength(50)
    expect(list.total).toBe(big.counts.guests)
    expect(measured['guestList']).toBeLessThan(TARGET.guestList * SLACK)
    const sorted = (await timed('guestListByName', 'guests.list', { sort: 'name', offset: 5000 })) as {
      rows: unknown[]
    }
    expect(sorted.rows).toHaveLength(50)
    expect(measured['guestListByName']).toBeLessThan(TARGET.guestList * SLACK)
  })

  it('misafir arama, kartı ve geçmişi hedef sürede açılır; liste kartla aynı sayıyı gösterir', async () => {
    const byName = (await timed('guestSearch', 'guests.list', { q: big.regular.lastName })) as {
      rows: { id: string; stays: number; lastStayDate: string; totalSpent: Record<string, number> }[]
    }
    expect(byName.rows.find((r) => r.id === big.regular.id)?.stays).toBeGreaterThan(100)
    expect(measured['guestSearch']).toBeLessThan(TARGET.guestSearch * SLACK)
    await timed('guestCard', 'guests.card', { id: big.regular.id })
    expect(measured['guestCard']).toBeLessThan(TARGET.guestSearch * SLACK)
    const history = (await timed('guestHistory', 'guests.history', { guestId: big.regular.id })) as {
      lastStayDate: string
      totalSpent: Record<string, number>
    }
    expect(byName.rows.find((r) => r.id === big.regular.id)).toMatchObject({
      lastStayDate: history.lastStayDate,
      totalSpent: history.totalSpent
    })
    expect(measured['guestHistory']).toBeLessThan(TARGET.guestSearch * SLACK)
    const quick = (await timed('guestQuick', 'booking.searchGuests', { q: 'Ayla' })) as unknown[]
    expect(quick.length).toBeGreaterThan(0)
    expect(measured['guestQuick']).toBeLessThan(TARGET.guestSearch * SLACK)
  })

  it('defter: ay görünümü hedef sürede açılır', async () => {
    const month = (await timed('ledgerMonth', 'ledger.month', { year: 2025, month: 12 })) as {
      income: unknown[]
      expenses: unknown[]
    }
    expect(month.income.length).toBeGreaterThan(50)
    expect(month.expenses.length).toBeGreaterThan(30)
    expect(measured['ledgerMonth']).toBeLessThan(TARGET.ledgerMonth * SLACK)
  })

  it('Bugün, otelde kalanlar, takvimde arama ve denetim kaydı hedef sürede açılır', async () => {
    await timed('today', 'today.summary', {})
    expect(measured['today']).toBeLessThan(TARGET.today * SLACK)
    await timed('audit', 'audit.list', {})
    expect(measured['audit']).toBeLessThan(TARGET.audit * SLACK)
    await timed('inHouse', 'inHouse.list', {})
    expect(measured['inHouse']).toBeLessThan(TARGET.today * SLACK)
    await timed('findStays', 'reservations.findStays', { query: 'Ayla' })
    expect(measured['findStays']).toBeLessThan(TARGET.today * SLACK)
  })

  it('raporlar: 10 yılın özeti, doluluğu ve gideri hedef sürede hesaplanır', async () => {
    const range = { from: BIG_FROM, to: '2026-01-01' }
    for (const [name, path] of [
      ['reportSummary', 'reports.summary'],
      ['reportOccupancy', 'reports.occupancy'],
      ['reportMonthly', 'reports.monthly'],
      ['reportExpenses', 'reports.expenses'],
      ['reportCash', 'reports.cash']
    ] as const) {
      await timed(name, path, range)
      expect(measured[name]).toBeLessThan(TARGET.reports * SLACK)
    }
  })
})
