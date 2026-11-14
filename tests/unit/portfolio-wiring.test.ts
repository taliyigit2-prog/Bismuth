// P21c: the window's `portfolio.*` calls on a client computer reach the portfolio (answered by this computer, status
// 202), the hotel in use is asked live, a saved other hotel with no copy is "no copy", and a role that is not the
// owner's is refused before the main computer is asked. The main computers are fakes (as in hotel-list.test.ts).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultPermissions } from '../../src/shared/permissions'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { anonymousCtx } from '../../src/main/services/context'
import { clientBinding, createClientApp } from '../../src/main/server/client-app'
import { createConfigStore } from '../../src/main/server/connection-config'
import { createHostLink } from '../../src/main/server/host-link'
import { hostIdentity } from '../../src/main/server/host-identity'
import { createReplicaStore } from '../../src/main/replica/store'
import { MIGRATIONS } from '../factories/db'

const A = 'http://100.64.0.10:7373'
const B = 'http://100.64.0.20:7373'
const FIGURES = {
  today: '2026-10-03',
  baseCurrency: 'TRY',
  sellableRooms: 3,
  soldTonight: 1,
  drawer: [],
  period: {
    from: '2026-10-01',
    to: '2026-11-01',
    occupancyBp: 100,
    revenueMinor: 5,
    expensesMinor: 0,
    profitMinor: 5,
    partial: false
  }
}

let dir: string
const stores: ReturnType<typeof createReplicaStore>[] = []
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-portfolio-'))
})
afterEach(() => {
  for (const s of stores.splice(0)) s.close()
  rmSync(dir, { recursive: true, force: true })
})

function build(role: 'owner' | 'manager') {
  const names = new Map([
    [A, { seed: 1, name: 'Otel A' }],
    [B, { seed: 2, name: 'Otel B' }]
  ])
  const asked: string[] = []
  const fetchLike = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const host = names.get(url.origin)!
    asked.push(`${url.origin}${url.pathname}`)
    if (url.pathname === '/api/auth.state')
      return new Response(
        JSON.stringify({
          setup: 'done',
          mode: 'server',
          session: { user: { id: 'u1' }, permissions: defaultPermissions(role), locked: false }
        })
      )
    if (url.pathname === '/api/auth.signIn')
      return new Response('{}', { headers: { 'set-cookie': 'bismuth_session=abc123; Path=/' } })
    if (url.pathname === '/api/portfolio.overview')
      return new Response(
        JSON.stringify({
          mode: 'host',
          hotels: [
            {
              code: null,
              name: host.name,
              active: true,
              source: 'live',
              syncedAt: null,
              state: 'ok',
              figures: FIGURES
            }
          ]
        })
      )
    const identity = hostIdentity(Buffer.alloc(32, host.seed))
    const { nonce } = JSON.parse(String(init.body)) as { nonce?: string }
    return new Response(
      JSON.stringify({
        app: 'bismuth',
        version: '0.1.0',
        schemaVersion: 11,
        hotelName: host.name,
        identity: { key: identity.publicKey, proof: nonce ? identity.prove(nonce) : null }
      })
    )
  }
  const config = createConfigStore(join(dir, 'connection.json'))
  config.update({ mode: 'client' })
  const link = createHostLink({
    fetch: fetchLike,
    version: '0.1.0',
    schemaVersion: 11,
    deviceName: 'Test',
    platform: 'linux',
    loadDevice: () => config.get().device ?? null,
    saveDevice: (device) => void config.update({ device }),
    loadHostKey: () => config.get().hostKey ?? null,
    saveHostKey: (hostKey) => void config.update({ hostKey }),
    probeEveryMs: 60_000
  })
  const app = createClientApp({
    link,
    config,
    discover: async () => [],
    openExternal: () => undefined,
    leaveClient: () => undefined,
    // No copy folder was ever made for these hotels: an empty copy holds no data.
    portfolioCopy: (code) => {
      const store = createReplicaStore({
        root: dir,
        hotel: code,
        migrationsFolder: MIGRATIONS,
        version: 'test'
      })
      stores.push(store)
      return store.readable()
    }
  })
  const call = async <T = unknown>(name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(
      app,
      anonymousCtx('client', 'ipc'),
      { path: `/api/${name}`, body: JSON.stringify(body) },
      clientBinding(1, () => ({ deviceName: 'Test', kind: 'desktop' }))
    )
    return { status: res.status, body: JSON.parse(res.body) as T }
  }
  return { call, asked }
}

type Out = { mode: string; hotels: { name: string; source: string | null; state: string; active: boolean }[] }

describe('portföy: istemci yönlendirmesi', () => {
  it('kullanımdaki otel ana bilgisayarından canlı gelir, kopyası olmayan öteki "kopya yok" olur', async () => {
    const c = build('owner')
    await c.call('remote.connect', { url: A })
    await c.call('remote.connect', { url: B })
    const out = await c.call<Out>('portfolio.overview', { from: '2026-10-01', to: '2026-11-01' })
    expect(out.status).toBe(202)
    expect(out.body.mode).toBe('client')
    const byName = Object.fromEntries(out.body.hotels.map((h) => [h.name, h]))
    expect(byName['Otel B']).toMatchObject({ active: true, source: 'live', state: 'ok' })
    expect(byName['Otel A']).toMatchObject({ active: false, source: null, state: 'noCopy' })
    expect(c.asked).toContain(`${B}/api/portfolio.overview`)
    expect(c.asked).not.toContain(`${A}/api/portfolio.overview`)
  })

  it('sahip olmayan rol ana bilgisayara bile sorulmadan reddedilir (403)', async () => {
    const c = build('manager')
    await c.call('remote.connect', { url: A })
    await c.call('remote.connect', { url: B })
    const out = await c.call('portfolio.overview', { from: '2026-10-01', to: '2026-11-01' })
    expect(out.status).toBe(403)
    expect(c.asked.filter((p) => p.endsWith('/api/portfolio.overview'))).toEqual([])
  })
})
