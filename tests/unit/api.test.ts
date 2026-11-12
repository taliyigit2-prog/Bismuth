import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServerApp } from '../e2e/mobile/plain-server'
import { safeResolve } from '../../src/main/server/static'
import { createServices, ctxFromPermissions, localOwnerCtx } from '../../src/main/services'
import type { DatabaseHandle } from '../../src/main/db/client'
import { SCHEMA_VERSION, memoryDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

let handle: DatabaseHandle
let api: ReturnType<typeof createApiApp>
const runtime = {
  name: 'Bismuth',
  version: '0.1.0',
  packaged: false,
  dataDir: tempDataDir(),
  electron: null,
  chrome: null
}

beforeAll(async () => {
  handle = await memoryDatabase()
  api = createApiApp({ handlers: createHandlers(createServices(handle, runtime)) })
})
afterAll(() => handle.close())

const call = (path: string, body: unknown, ctx = localOwnerCtx()) =>
  handleIpcRequest(api, ctx, { path, body: typeof body === 'string' ? body : JSON.stringify(body) })

describe('tek yönlendirici — IPC yolu', () => {
  it('ayarı yazar ve okur; çıktı kontratla doğrulanır', async () => {
    const set = await call('/api/settings.set', { 'ui.language': 'en' })
    expect(set.status).toBe(200)
    expect(JSON.parse(set.body)['ui.language']).toBe('en')
    const get = await call('/api/settings.get', {})
    expect(JSON.parse(get.body)['ui.language']).toBe('en')
  })

  it('geçersiz girdi 400 + alan hataları döner', async () => {
    const res = await call('/api/settings.set', { 'ui.theme': 'neon' })
    expect(res.status).toBe(400)
    expect(JSON.parse(res.body).error).toMatchObject({ code: 'VALIDATION', messageKey: 'errors.validation' })
    expect((await call('/api/settings.set', '{bozuk')).status).toBe(400)
  })

  it('bilinmeyen yordam 404, bozuk zarf 400', async () => {
    expect((await call('/api/rooms.drop', {})).status).toBe(404)
    const bad = await handleIpcRequest(api, localOwnerCtx(), { path: '/etc/passwd', body: '' })
    expect(bad.status).toBe(400)
  })

  it('yetki serviste: otel ayarı için yetkisiz rol 403 alır', async () => {
    const reception = ctxFromPermissions('u1', 'd1', 'ipc', { settings: 'view' })
    const res = await call('/api/settings.set', { 'hotel.name': 'X' }, reception)
    expect(res.status).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('PERMISSION_DENIED')
  })

  it('kendi tekrarlı görev: görev düzenleme yetkisi olmayan rol 403 alır; yetkili rol etkin şablon açar', async () => {
    const body = {
      title: 'Lobideki çiçekleri sula',
      recurrence: { kind: 'weekly', weekdays: [1, 4], time: '10:00' }
    }
    const viewer = ctxFromPermissions('u1', 'd1', 'ipc', { tasks: 'view' })
    const refused = await call('/api/tasks.createTemplate', body, viewer)
    expect(refused.status).toBe(403)
    expect(JSON.parse(refused.body).error.code).toBe('PERMISSION_DENIED')
    const editor = ctxFromPermissions('u2', 'd1', 'ipc', { tasks: 'edit' })
    const created = await call('/api/tasks.createTemplate', body, editor)
    expect(created.status).toBe(200)
    expect(JSON.parse(created.body)).toMatchObject({
      code: null,
      title: 'Lobideki çiçekleri sula',
      kind: 'general',
      recurrence: body.recurrence,
      suggested: false,
      active: true
    })
    // 120 characters at most; only the rules the form makes; nothing else is taken.
    const long = await call('/api/tasks.createTemplate', { ...body, title: 'x'.repeat(121) }, editor)
    expect(long.status).toBe(400)
    const once = await call('/api/tasks.createTemplate', { ...body, recurrence: { kind: 'none' } }, editor)
    expect(once.status).toBe(400)
    const legal = await call('/api/tasks.createTemplate', { ...body, kind: 'legal' }, editor)
    expect(legal.status).toBe(400)
  })

  it('uygulama bilgisi veritabanı sürümünü ve taşımayı bildirir', async () => {
    const info = JSON.parse((await call('/api/app.getInfo', {})).body)
    expect(info).toMatchObject({
      name: 'Bismuth',
      schemaVersion: SCHEMA_VERSION,
      integrity: 'ok',
      transport: 'ipc'
    })
  })
})

describe('tek yönlendirici — HTTP yolu (sunucu modu iskeleti)', () => {
  it('oturum yoksa 401 döner (Faz 13 öncesi uzaktan erişim kapalı)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-static-'))
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>x</title>')
    const server = createServerApp({ api, staticRoot: root })
    const res = await server.request('/api/settings.get', { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
    const page = await server.request('/')
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect((await server.request('/..%2f..%2fetc/passwd')).status).toBe(404)
    rmSync(root, { recursive: true, force: true })
  })

  it('statik dosya yolu klasör dışına çıkamaz', () => {
    expect(safeResolve('/srv/app', '/../../etc/passwd')).toBe(join('/srv/app', 'etc/passwd'))
    expect(safeResolve('/srv/app', '/%2e%2e/%2e%2e/etc/passwd')).toBe(join('/srv/app', 'etc/passwd'))
    expect(safeResolve('/srv/app', '/')).toBe(join('/srv/app', 'index.html'))
  })
})
