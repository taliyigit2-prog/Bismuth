// The hotel's desk over the real router and services (in-memory SQLite): one desktop window as the main process
// wires it, a movable clock and the wizard run to the end with a 19-room draft (Faz 4 bug hunt scenarios).
import { expect } from 'vitest'
import type { SetupDraft } from '@shared/contract'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import { ctxForUser } from '../../src/main/services/users-service'
import { createDesktopSessions } from '../../src/main/session/desktop-sessions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { seededDatabase } from './db'
import { tempDataDir } from './runtime'

export const WINDOW = 7

export interface Harness {
  handle: DatabaseHandle
  services: ReturnType<typeof createServices>
  desktop: ReturnType<typeof createDesktopSessions>
  clock: { now: Date; set(iso: string): void; advance(minutes: number): void }
  call<T = unknown>(name: string, body?: unknown, windowId?: number): Promise<{ status: number; body: T }>
}

export async function makeHarness(start = `2026-10-05T09:00:00Z`): Promise<Harness> {
  const handle = await seededDatabase()
  const clock = {
    now: new Date(start),
    set(iso: string) {
      clock.now = new Date(iso)
    },
    advance(minutes: number) {
      clock.now = new Date(clock.now.getTime() + minutes * 60_000)
    }
  }
  const runtime = {
    name: `Bismuth`,
    version: `0.1.0`,
    packaged: false,
    dataDir: tempDataDir(),
    electron: null,
    chrome: null
  }
  const services = createServices(handle, runtime, { clock: () => new Date(clock.now) })
  const api = createApiApp({ handlers: createHandlers(services) })
  let savedDeviceId: string | null = null
  const desktop = createDesktopSessions({
    setupDone: () => services.setup.isDone(),
    setupOpen: () => services.setup.isOpen(),
    resolve: (token) => services.auth.resolveSession(token),
    userCtx: (userId, deviceId) => ctxForUser(handle.db, userId, deviceId, `ipc`),
    endSession: (token) => void services.auth.logout(token),
    loadDeviceId: () => savedDeviceId,
    saveDeviceId: (id) => (savedDeviceId = id),
    deviceName: () => `Resepsiyon PC`,
    platform: `win32`
  })
  async function call<T = unknown>(name: string, body: unknown = {}, windowId = WINDOW) {
    const res = await handleIpcRequest(
      api,
      desktop.ctxFor(windowId),
      { path: `/api/${name}`, body: JSON.stringify(body) },
      desktop.binding(windowId)
    )
    return { status: res.status, body: JSON.parse(res.body) as T }
  }
  return { handle, services, desktop, clock, call }
}

export const errorOf = (res: { body: unknown }) =>
  (res.body as { error: { code: string; messageKey: string; details?: unknown } }).error

type Options = {
  roomTypes: { id: string; group: string; active: boolean }[]
  paymentMethods: { id: string; active: boolean; isCash?: boolean }[]
  salesChannels: { id: string; code: string | null; active: boolean }[]
  shifts: {
    id: string
    name: string | null
    displayName: Record<string, string> | null
    startTime: string
    endTime: string
  }[]
  taskTemplates: { id: string; suggested: boolean; kind: string }[]
  roles: { id: string; code: string | null }[]
}

export function draftFrom(options: Options): SetupDraft {
  const [double, twin] = options.roomTypes.filter((t) => t.group === `occupancy`)
  const reception = options.roles.find((r) => r.code === `reception`)!
  const rooms = Array.from({ length: 19 }, (_, i) => {
    const floor = Math.floor(i / 4) + 1
    return {
      number: `${floor}0${(i % 4) + 1}`,
      floor: String(floor),
      beds: i === 18 ? 4 : 2,
      sellable: true,
      roomType: { id: (i % 2 ? twin : double)!.id }
    }
  })
  return {
    language: `tr`,
    theme: `system`,
    hotel: {
      name: `Örnek Otel`,
      country: `TR`,
      city: `İstanbul`,
      timezone: `Europe/Istanbul`,
      checkinTime: `14:00`,
      checkoutTime: `12:00`
    },
    money: { baseCurrency: `TRY`, currencies: [`TRY`, `EUR`, `USD`] },
    roomTypes: {
      selected: [
        { id: double!.id, basePriceMinor: 280_000, weekendPriceMinor: 320_000 },
        { id: twin!.id, basePriceMinor: 270_000 }
      ],
      custom: []
    },
    rooms,
    lists: {
      paymentMethods: options.paymentMethods.filter((m) => m.active).map((m) => m.id),
      salesChannels: options.salesChannels.filter((c) => c.active).map((c) => c.id),
      extraServices: [],
      customPaymentMethods: [],
      customSalesChannels: [],
      customExtraServices: []
    },
    staff: { policy: { leaveDaysPerMonth: 4 }, advanceFromDrawer: true },
    shifts: options.shifts.map((s) => ({
      id: s.id,
      name: s.displayName?.[`tr`] ?? s.name ?? `Vardiya`,
      startTime: s.startTime,
      endTime: s.endTime
    })),
    tasks: { suggestions: [], legalReminders: true },
    employees: [
      {
        firstName: `Deniz`,
        lastName: `Arslan`,
        position: `Resepsiyon`,
        startDate: `2026-10-01`,
        account: { username: `deniz`, password: `gecici-sifre-1`, roleId: reception.id }
      }
    ],
    calendar: { highlightWeekdays: [6, 0], dayClosing: false },
    owner: { username: `sahip`, displayName: `Otel Sahibi`, password: `cok-gizli-sifre`, pin: `2468` }
  }
}

/** Runs the wizard to the end; the window is then signed in as the owner. Returns the recovery codes. */
export async function setUp(h: Harness): Promise<{ draft: SetupDraft; codes: string[] }> {
  const options = await h.call<Options>(`setup.options`)
  expect(options.status).toBe(200)
  const draft = draftFrom(options.body)
  const finish = await h.call<{ recoveryCodes: string[] }>(`setup.finish`, draft)
  expect(finish.status, JSON.stringify(finish.body)).toBe(200)
  return { draft, codes: finish.body.recoveryCodes }
}
