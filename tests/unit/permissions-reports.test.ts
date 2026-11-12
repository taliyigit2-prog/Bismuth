// Reports (faz-10 madde 9, G-23, G-105): 6 roles × every report procedure. A procedure is refused exactly when the
// role's default levels miss what it needs; the router path (IPC envelope) gives the same answer as the service.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SYSTEM_ROLE_CODES,
  defaultPermissions,
  levelAllows,
  type PermissionKey
} from '../../src/shared/permissions'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const P = { from: '2026-09-01', to: '2026-10-01' }

let handle: DatabaseHandle
let services: ReturnType<typeof createServices>
let api: ReturnType<typeof createApiApp>

beforeAll(async () => {
  handle = await seededDatabase()
  services = createServices(handle, runtime, { clock: testClock('2026-10-05T09:00:00.000Z') })
  api = createApiApp({ handlers: createHandlers(services) })
})
afterAll(() => handle.close())

interface Probe {
  name: string
  /** Every key needed (view level); `any` = one of them is enough. */
  needs: PermissionKey[]
  any?: boolean
  run: (ctx: Ctx) => unknown
}

const probes: Probe[] = [
  {
    name: 'reports.context',
    needs: ['reports.operations', 'reports.finance', 'reports.staff'],
    any: true,
    run: (c) => services.reports.context(c)
  },
  { name: 'reports.summary', needs: ['reports.operations'], run: (c) => services.reports.summary(c, P) },
  { name: 'reports.occupancy', needs: ['reports.operations'], run: (c) => services.reports.occupancy(c, P) },
  { name: 'reports.monthly', needs: ['reports.finance'], run: (c) => services.reports.monthly(c, P) },
  {
    name: 'reports.yearly',
    needs: ['reports.finance'],
    run: (c) => services.reports.yearly(c, { years: [2026] })
  },
  { name: 'reports.cash', needs: ['reports.finance'], run: (c) => services.reports.cash(c, P) },
  { name: 'reports.expenses', needs: ['reports.finance'], run: (c) => services.reports.expenses(c, P) },
  {
    name: 'reports.monthEnd',
    needs: ['reports.finance'],
    run: (c) => services.reports.monthEnd(c, { year: 2026, month: 9 })
  },
  {
    name: 'reports.monthEndTicks',
    needs: ['reports.finance'],
    run: (c) => services.reports.monthEndTicks(c, { year: 2026, month: 9 })
  },
  {
    name: 'reports.setMonthEndTicks',
    needs: ['reports.finance'],
    run: (c) => services.reports.setMonthEndTicks(c, { year: 2026, month: 9, ticks: ['results'] })
  },
  { name: 'reports.staff', needs: ['reports.staff'], run: (c) => services.reports.staff(c, { year: 2026 }) },
  {
    name: 'reports.export (aylık özet)',
    needs: ['reports.export', 'reports.finance'],
    run: (c) => services.reports.export(c, { report: 'monthly', format: 'xlsx', locale: 'tr', ...P })
  },
  {
    name: 'reports.export (doluluk)',
    needs: ['reports.export', 'reports.operations'],
    run: (c) =>
      services.reports.export(c, { report: 'occupancy', table: 'months', format: 'csv', locale: 'tr', ...P })
  }
]

const refusal = async (run: () => unknown): Promise<boolean> => {
  try {
    await run()
    return false
  } catch (error) {
    if (error instanceof AppError && error.code === 'PERMISSION_DENIED') return true
    throw error
  }
}

describe('rapor yetkileri: 6 rol × bütün yordamlar', () => {
  for (const role of SYSTEM_ROLE_CODES) {
    const levels = defaultPermissions(role)
    for (const p of probes) {
      const ok = (k: PermissionKey) => levelAllows(levels[k], 'view')
      const allowed = p.any ? p.needs.some(ok) : p.needs.every(ok)
      it(`${role}: ${p.name} → ${allowed ? 'izinli' : 'PermissionDenied'}`, async () => {
        expect(await refusal(() => p.run(roleCtx(role)))).toBe(!allowed)
      })
    }
  }
})

describe('rapor yetkileri yönlendirici üzerinden', () => {
  const call = (name: string, body: unknown, ctx: Ctx) =>
    handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })

  it('resepsiyon aylık özeti doğrudan çağıramaz (403); sahip sözleşmeye uyan yanıt alır', async () => {
    expect((await call('reports.monthly', P, roleCtx('reception'))).status).toBe(403)
    expect((await call('reports.summary', P, roleCtx('reception'))).status).toBe(403)
    const res = await call('reports.monthly', P, roleCtx('owner'))
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body ?? '{}')).toMatchObject({ revenueMinor: 0, from: P.from })
  })

  it('müdür kâr/gider raporunu görür ama personel raporunu göremez', async () => {
    expect((await call('reports.monthly', P, roleCtx('manager'))).status).toBe(200)
    expect((await call('reports.staff', { year: 2026 }, roleCtx('manager'))).status).toBe(403)
  })

  it('geçersiz dönem 400 döner (bitiş başlangıçtan önce)', async () => {
    const res = await call('reports.summary', { from: '2026-10-01', to: '2026-09-01' }, roleCtx('owner'))
    expect(res.status).toBe(400)
  })
})
