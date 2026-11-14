// P21c: the portfolio is the owner's view of every hotel. Each role's default rights against 'portfolio.overview' and
// 'portfolio.grid': only the owner reads; every other role is refused before any figure is built (G-23).
import { afterEach, describe, expect, it } from 'vitest'
import { portfolioHandlers } from '../../src/main/api/handlers/portfolio'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createServices } from '../../src/main/services'
import { SYSTEM_ROLE_CODES } from '../../src/shared/permissions'
import { roleCtx } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

const ENV = { session: null, transport: 'ipc' as const }
const PERIOD = { from: '2026-10-01', to: '2026-11-01' }
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}

let handle: DatabaseHandle
afterEach(() => handle?.close())

describe('portföy yetkisi: 6 sistem rolü', () => {
  it.each(SYSTEM_ROLE_CODES.map((r) => [r]))(
    '%s: yalnız sahip portfolio.overview ve portfolio.grid okur, diğer roller PERMISSION_DENIED alır',
    async (role) => {
      handle = await seededDatabase()
      const handlers = portfolioHandlers(createServices(handle, runtime))
      const ctx = roleCtx(role)
      const calls = [
        async () => handlers['portfolio.overview'](ctx, PERIOD as never, ENV),
        async () => handlers['portfolio.grid'](ctx, { hotel: null, ...PERIOD } as never, ENV)
      ]
      for (const call of calls) {
        if (role === 'owner') await expect(call()).resolves.toBeTruthy()
        else await expect(call()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
      }
    }
  )
})
