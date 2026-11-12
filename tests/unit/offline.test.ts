// Faz 16 kabul ölçütü "Ağ tamamen kapalıyken tüm akışlar çalışır" (G-01, G-02; .claude/rules/testing.md "istek sayacı
// 0"): with "İnternetten güncelle" off, every procedure of the contract is called as the owner through the window's
// router, the optional-data timers run and the online data is asked for by hand — not one request leaves the program
// (both the program's own HTTP client counter and the global fetch stay at zero). The screens of the real app are
// covered by tests/e2e/electron/offline.spec.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { contract, type ProcedureName } from '../../src/shared/contract'
import { systemCtx } from '../../src/main/services/context'
import { roleCtx } from '../factories/ctx'
import { faz12Api } from './faz12-api'

const fetchSpy = vi.fn(() => Promise.reject(new Error('offline')))
let env: Awaited<ReturnType<typeof faz12Api>>

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchSpy)
  env = await faz12Api()
})
afterAll(() => {
  env.services.external.stop()
  env.close()
  vi.unstubAllGlobals()
})

/** Calls that end the caller's session or restart the program: not part of a data-entry sweep. */
const SKIP = new Set<ProcedureName>(['auth.signOut', 'backup.restart'])

describe('ağ kapalı (network.enabled=false)', () => {
  it('bütün yordamlar, zamanlayıcılar ve elle yenileme dışarı tek istek göndermez', async () => {
    const owner = roleCtx('owner')
    const off = await env.call('settings.set', { 'network.enabled': false }, owner)
    expect(off.status).toBe(200)

    // The timers of the hotel's computer (rates, weather, holiday check), started at once.
    env.services.external.start({ firstDelayMs: 0, active: () => true })

    // Every procedure of the contract through the window's router (the data of faz12-api: supplies, laundry…).
    const statuses = new Map<string, number>()
    for (const name of Object.keys(contract) as ProcedureName[]) {
      if (SKIP.has(name)) continue
      statuses.set(name, (await env.call(name, {}, owner)).status)
    }
    // Most need input (400); the ones without input really ran — screens, lists, reports, the online data.
    const ran = [...statuses].filter(([, s]) => s === 200).map(([n]) => n)
    expect(ran).toEqual(
      expect.arrayContaining(['fx.refresh', 'weather.refresh', 'today.summary', 'backup.overview'])
    )
    expect(ran.length).toBeGreaterThan(40)
    expect([...statuses].filter(([, s]) => s >= 500)).toEqual([])

    // By hand as well: the holiday check of this year and the next.
    const sys = systemCtx()
    await env.services.external.refreshFx(sys)
    await env.services.external.refreshWeather(sys)
    await env.services.external.checkHolidays(sys, 2026)
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(env.services.external.requestCount).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
