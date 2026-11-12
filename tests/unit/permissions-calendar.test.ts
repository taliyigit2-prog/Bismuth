// G-31 / G-190 (son kontrol QA-1, K-46 (1) ve (3)) through the one router, as a window calls it: the grid's years
// (`calendar.bounds`) need the calendar; the start-year setting `calendar.startYear` needs the hotel settings right
// (like the other calendar settings) and only takes 2000 … this year; the guest list's room and date filter needs
// the guests right.
import { afterEach, describe, expect, it } from 'vitest'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createServices } from '../../src/main/services'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: '', electron: null, chrome: null },
    { clock: testClock('2026-10-05T09:00:00.000Z') }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const call = async (role: (typeof SYSTEM_ROLE_CODES)[number], name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(api, roleCtx(role), {
      path: `/api/${name}`,
      body: JSON.stringify(body)
    })
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> }
  }
  return { call }
}

describe('takvim başlangıç yılı ve aralık (G-31)', () => {
  it.each(SYSTEM_ROLE_CODES)('%s: başlangıç yılını yalnız otel ayarı yetkisiyle değiştirir', async (role) => {
    const { call } = await setup()
    const allowed = levelAllows(defaultPermissions(role)['settings'], 'edit')
    const res = await call(role, 'settings.set', { 'calendar.startYear': 2015 })
    expect(res.status).toBe(allowed ? 200 : 403)
    const after = await call('owner', 'settings.get')
    expect(after.body['calendar.startYear']).toBe(allowed ? 2015 : null)
  })

  it('geçersiz yıl reddedilir (2000 öncesi, gelecek yıl, kesirli); boş bırakılabilir', async () => {
    const { call } = await setup()
    const nextYear = new Date().getFullYear() + 1
    for (const bad of [1999, nextYear, 2015.5, '2015'])
      expect((await call('owner', 'settings.set', { 'calendar.startYear': bad })).status).toBe(400)
    expect((await call('owner', 'settings.set', { 'calendar.startYear': 2000 })).status).toBe(200)
    expect((await call('owner', 'settings.set', { 'calendar.startYear': null })).status).toBe(200)
  })

  it.each(SYSTEM_ROLE_CODES)('%s: takvim aralığını takvimi görebiliyorsa okur', async (role) => {
    const { call } = await setup()
    const allowed = levelAllows(defaultPermissions(role)['calendar'], 'view')
    const res = await call(role, 'calendar.bounds')
    expect(res.status).toBe(allowed ? 200 : 403)
    if (allowed) expect(res.body).toEqual({ firstYear: 2025, lastYear: 2036 })
  })

  it('ayar takvim aralığını geriye taşır', async () => {
    const { call } = await setup()
    await call('owner', 'settings.set', { 'calendar.startYear': 2012 })
    expect((await call('reception', 'calendar.bounds')).body).toEqual({ firstYear: 2012, lastYear: 2036 })
  })
})

describe('misafir listesi oda ve tarih süzgeci (G-190)', () => {
  it.each(SYSTEM_ROLE_CODES)('%s: süzgeci misafirleri görebiliyorsa kullanır', async (role) => {
    const { call } = await setup()
    const allowed = levelAllows(defaultPermissions(role)['guests'], 'view')
    const res = await call(role, 'guests.list', { room: '302', stayFrom: '2026-03-01', stayTo: '2026-03-31' })
    expect(res.status).toBe(allowed ? 200 : 403)
  })

  it('ters tarih aralığı 400', async () => {
    const { call } = await setup()
    const res = await call('owner', 'guests.list', { stayFrom: '2026-03-31', stayTo: '2026-03-01' })
    expect(res.status).toBe(400)
  })
})
