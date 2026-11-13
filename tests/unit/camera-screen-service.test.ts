// The Kamera screen's service calls (Faz 20 P20b, S-108, K-49, K-51): the signed live address, the strip and face boxes,
// the pause toggle; P20c: the alarm list is Bismuth's own table (`camera_events`), its marks live there (the alarm flow
// itself: `camera-data.test.ts`). A stand-in bridge answers like the sidecar does.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import { auditLog, cameraEvents, roles, users } from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { CameraRuntime } from '../../src/main/camera'
import { createFaceCrypto } from '../../src/main/camera/crypto'
import { createBridge, type BridgeFetch } from '../../src/main/camera/bridge'
import { createSecretStore } from '../../src/main/camera/secrets'
import { createCameraService } from '../../src/main/services/camera-service'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const TOKEN = 'a'.repeat(32)

interface Sidecar {
  paused: boolean
  overlay: unknown
  status: Record<string, unknown>
  calls: string[]
}

function fakeSidecar(): { sidecar: Sidecar; fetch: BridgeFetch } {
  const sidecar: Sidecar = {
    paused: false,
    overlay: null,
    status: {
      camera_connected: true,
      camera_covered: false,
      camera_location: 'Merdiven',
      active_guests_count: 4,
      fps: 12.5
    },
    calls: []
  }
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch: BridgeFetch = (url, init) => {
    const path = new URL(url).pathname
    sidecar.calls.push(`${init.method} ${path}`)
    if (path === '/api/status')
      return Promise.resolve(json(200, { ...sidecar.status, alarms_paused: sidecar.paused }))
    if (path === '/api/overlay')
      return Promise.resolve(
        sidecar.overlay === null ? json(404, { detail: 'not_found' }) : json(200, sidecar.overlay)
      )
    if (path === '/api/system/toggle-alarms') {
      sidecar.paused = !sidecar.paused
      return Promise.resolve(json(200, { ok: true, alarms_paused: sidecar.paused }))
    }
    return Promise.resolve(json(404, {}))
  }
  return { sidecar, fetch }
}

async function setup(opts: { running?: boolean } = {}) {
  handle = await seededDatabase()
  const clock = testClock()
  const fake = fakeSidecar()
  const bridge = createBridge({ port: 51234, token: TOKEN, fetch: fake.fetch })
  const runtime = {
    apply: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    snapshot: () =>
      ({ state: opts.running === false ? 'stopped' : 'running' }) as ReturnType<CameraRuntime['snapshot']>,
    bridge: () => (opts.running === false ? null : bridge)
  } satisfies CameraRuntime
  // The account the marks point at (seen_by / handled_by).
  const roleId = handle.db.select().from(roles).where(eq(roles.code, 'owner')).get()!.id
  handle.db
    .insert(users)
    .values({
      id: 'user-owner',
      username: 'owner',
      displayName: 'owner',
      roleId,
      passwordHash: 'x',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    })
    .run()
  const service = createCameraService({
    ...depsOf(handle, clock),
    secrets: createSecretStore(null, null),
    faceCrypto: createFaceCrypto(null, null)
  })
  service.attach(runtime)
  /** An alarm row as the pull makes it (time as the hotel computer's UTC instant). */
  const addEvent = (id: string, local: string, state: 'new' | 'seen' | 'handled' = 'new') => {
    const iso = new Date(local).toISOString()
    handle.db
      .insert(cameraEvents)
      .values({ id, kind: 'alarm', occurredAt: iso, state, cropEnc: null, createdAt: iso, updatedAt: iso })
      .run()
  }
  return { service, sidecar: fake.sidecar, addEvent }
}

const phone = (role: 'owner' | 'reception' = 'owner'): Ctx =>
  ctxFromPermissions('u', 'phone', 'http', defaultPermissions(role))

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn()
    return 'ok'
  } catch (error) {
    return error instanceof AppError ? `${error.code}:${error.messageKey}` : 'other'
  }
}

describe('canlı yayın adresi (S-108)', () => {
  it('çalışırken 127.0.0.1 üzerinde imzalı kısa ömürlü adres verir; belirtecin kendisi adreste yok', async () => {
    const { service } = await setup()
    const { url } = service.streamUrl(roleCtx('owner'))
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:51234\/api\/stream\?st=\d+\.[0-9a-f]{64}$/)
    expect(url).not.toContain(TOKEN)
  })

  it('yan süreç çalışmıyorsa adres yok', async () => {
    const { service } = await setup({ running: false })
    expect(service.streamUrl(roleCtx('owner'))).toEqual({ url: null })
  })

  it('telefon ve HTTP istemcisi canlı görüntü ve şerit alamaz (yalnız ana bilgisayar)', async () => {
    const { service } = await setup()
    expect(await code(() => service.streamUrl(phone()))).toBe('PERMISSION_DENIED:errors.remoteLocalOnly')
    expect(await code(() => service.live(phone()))).toBe('PERMISSION_DENIED:errors.remoteLocalOnly')
  })
})

describe('canlı şerit ve yüz kutuları', () => {
  it('şerit durum yanıtından gelir; kutu uç noktası yoksa kutu listesi boş', async () => {
    const { service } = await setup()
    const live = await service.live(roleCtx('owner'))
    expect(live.header).toEqual({
      location: 'Merdiven',
      activeGuests: 4,
      alarmsPaused: false,
      cameraConnected: true,
      cameraCovered: false,
      fps: 12.5
    })
    expect(live.boxes).toEqual([])
    expect(live.frame).toBeNull()
  })

  it('kutular çerçeve boyutuyla birlikte gelir; bozuk kutu atılır', async () => {
    const { service, sidecar } = await setup()
    sidecar.overlay = {
      frame: { width: 1920, height: 1080 },
      faces: [
        { box: [0.25, 0.5, 0.5, 1], kind: 'known', name: 'Иван Петров', room: '12', score: 0.7 },
        { box: [0.5, 0.1, 0.6, 0.3], kind: 'uncertain', name: 'Иван Петров', room: '12', score: 0.33 },
        { box: [-0.1, 0, 0.1, 0.1], kind: 'unknown', name: null, room: null, score: null },
        { box: [0.1, 0.1], kind: 'known', name: 'x', room: null, score: null }
      ]
    }
    const live = await service.live(roleCtx('owner'))
    expect(live.frame).toEqual({ width: 1920, height: 1080 })
    // 0..1 corners become pixel boxes; an uncertain face shows no name; boxes off the frame or malformed are dropped.
    expect(live.boxes).toEqual([
      { x: 480, y: 540, w: 480, h: 540, label: 'Иван Петров · 12', kind: 'known' },
      { x: 960, y: 108, w: 192, h: 216, label: '', kind: 'unknown' }
    ])
  })

  it('yan süreç yokken şerit boştur', async () => {
    const { service } = await setup({ running: false })
    expect(await service.live(roleCtx('owner'))).toEqual({ header: null, frame: null, boxes: [] })
  })
})

const ID = (n: number): string => String(n).padStart(26, '0')

describe('alarm listesi ve "görüldü / halledildi" (Bismuth tablosundan)', () => {
  it('alarmlar yerel saatle, yeniden eskiye gelir; telefon da okuyabilir; resim ve metin dışarı çıkmaz', async () => {
    const { service, addEvent } = await setup()
    addEvent(ID(6), '2026-11-12T23:40:00')
    addEvent(ID(7), '2026-11-13T02:10:00')
    const out = service.alerts(phone('reception'))
    expect(out).toEqual({
      available: true,
      alerts: [
        { id: ID(7), at: '2026-11-13T02:10:00', state: 'new', hasCrop: false, linked: false },
        { id: ID(6), at: '2026-11-12T23:40:00', state: 'new', hasCrop: false, linked: false }
      ]
    })
  })

  it('işaret tabloda kalır; "yeni" diye geri alınabilir; denetim kaydı düşer; yan süreç kapalıyken de çalışır', async () => {
    const { service, addEvent } = await setup({ running: false })
    addEvent(ID(7), '2026-11-13T02:10:00')
    addEvent(ID(6), '2026-11-12T23:40:00')
    const owner = roleCtx('owner')
    await service.markAlert(owner, { id: ID(7), state: 'seen' })
    await service.markAlert(owner, { id: ID(6), state: 'handled' })
    expect(service.alerts(owner).alerts.map((a) => a.state)).toEqual(['seen', 'handled'])
    expect(
      handle.db
        .select()
        .from(cameraEvents)
        .where(eq(cameraEvents.id, ID(6)))
        .get()?.state
    ).toBe('handled')
    await service.markAlert(owner, { id: ID(7), state: 'new' })
    expect(service.alerts(owner).alerts[0]?.state).toBe('new')
    const rows = handle.db.select().from(auditLog).all()
    expect(rows.filter((r) => r.entity === 'camera_alert')).toHaveLength(3)
    // Never a "camera available" doubt: the list is Bismuth's own, with or without the sidecar.
    expect(service.alerts(owner).available).toBe(true)
  })

  it('listede olmayan alarm NOT_FOUND', async () => {
    const { service } = await setup()
    expect(await code(() => service.markAlert(roleCtx('owner'), { id: ID(99), state: 'seen' }))).toMatch(
      /^NOT_FOUND/
    )
  })

  it('geçersiz numara ya da durum reddedilir', async () => {
    const { service } = await setup()
    expect(await code(() => service.markAlert(roleCtx('owner'), { id: '../x', state: 'seen' }))).toMatch(
      /^VALIDATION/
    )
    expect(
      await code(() => service.markAlert(roleCtx('owner'), { id: ID(7), state: 'bogus' as never }))
    ).toMatch(/^VALIDATION/)
  })
})

describe('alarmları duraklat', () => {
  it('istenen durum zaten böyleyse yan sürece dokunmaz; değilse çevirir ve denetim kaydı yazar', async () => {
    const { service, sidecar } = await setup()
    const owner = roleCtx('owner')
    expect(await service.setAlarmsPaused(owner, { paused: false })).toEqual({ alarmsPaused: false })
    expect(sidecar.calls).not.toContain('POST /api/system/toggle-alarms')
    expect(await service.setAlarmsPaused(owner, { paused: true })).toEqual({ alarmsPaused: true })
    expect(await service.setAlarmsPaused(owner, { paused: true })).toEqual({ alarmsPaused: true })
    expect(sidecar.calls.filter((c) => c === 'POST /api/system/toggle-alarms')).toHaveLength(1)
    expect(
      handle.db
        .select()
        .from(auditLog)
        .all()
        .filter((r) => r.reason === 'alarms paused')
    ).toHaveLength(1)
  })

  it('yan süreç yokken ve telefondan olmaz; Resepsiyon (yalnız görür) yapamaz', async () => {
    const { service } = await setup({ running: false })
    expect(await code(() => service.setAlarmsPaused(roleCtx('owner'), { paused: true }))).toBe(
      'CONFLICT:errors.cameraUnavailable'
    )
    expect(await code(() => service.setAlarmsPaused(phone(), { paused: true }))).toBe(
      'PERMISSION_DENIED:errors.remoteLocalOnly'
    )
    expect(await code(() => service.setAlarmsPaused(roleCtx('reception'), { paused: true }))).toMatch(
      /^PERMISSION_DENIED/
    )
  })
})
