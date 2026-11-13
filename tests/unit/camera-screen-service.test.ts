// The Kamera screen's service calls (Faz 20 P20b, S-108, K-49, K-51): the signed live address, the strip and face boxes,
// the alarm list with the staff's marks, the pause toggle. A stand-in bridge answers like the sidecar does.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPermissions } from '@shared/permissions'
import { auditLog } from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { CameraRuntime } from '../../src/main/camera'
import { createAlertStateStore } from '../../src/main/camera/alert-state'
import { createBridge, type BridgeFetch } from '../../src/main/camera/bridge'
import { createSecretStore } from '../../src/main/camera/secrets'
import { createCameraService } from '../../src/main/services/camera-service'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
const dirs: string[] = []
afterEach(() => {
  handle?.close()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const TOKEN = 'a'.repeat(32)

interface Sidecar {
  alerts: { id: number; alert_time: string; details: string; image_path: string }[]
  paused: boolean
  overlay: unknown
  status: Record<string, unknown>
  calls: string[]
}

function fakeSidecar(): { sidecar: Sidecar; fetch: BridgeFetch } {
  const sidecar: Sidecar = {
    alerts: [
      {
        id: 7,
        alert_time: '2026-11-13T02:10:00',
        details: 'Tanımsız Kişi (Takip #3)',
        image_path: '/x/secret.jpg'
      },
      { id: 6, alert_time: '2026-11-12T23:40:00', details: 'Tanımsız Kişi (Takip #1)', image_path: '' }
    ],
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
    if (path === '/api/alerts') return Promise.resolve(json(200, { alerts: sidecar.alerts }))
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
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-camera-'))
  dirs.push(dir)
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
  const alertFile = join(dir, 'alerts.json')
  const service = createCameraService({
    ...depsOf(handle, clock),
    secrets: createSecretStore(null, null),
    alertState: createAlertStateStore(alertFile)
  })
  service.attach(runtime)
  return { service, sidecar: fake.sidecar, alertFile }
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

describe('alarm listesi ve "görüldü / halledildi"', () => {
  it('alarmlar işaretsiz gelir; resim yolu ve metin dışarı çıkmaz; telefon da okuyabilir', async () => {
    const { service } = await setup()
    const out = await service.alerts(phone('reception'))
    expect(out).toEqual({
      available: true,
      alerts: [
        { id: '7', at: '2026-11-13T02:10:00', state: 'new' },
        { id: '6', at: '2026-11-12T23:40:00', state: 'new' }
      ]
    })
    expect(JSON.stringify(out)).not.toContain('secret.jpg')
    expect(JSON.stringify(out)).not.toContain('Takip')
  })

  it('işaret dosyada kalır; yeniden açılınca da görünür, "yeni" diye geri alınabilir; denetim kaydı düşer', async () => {
    const { service, alertFile } = await setup()
    const owner = roleCtx('owner')
    await service.markAlert(owner, { id: '7', state: 'seen' })
    await service.markAlert(owner, { id: '6', state: 'handled' })
    expect((await service.alerts(owner)).alerts.map((a) => a.state)).toEqual(['seen', 'handled'])
    // A new service over the same file (the program restarted) still knows.
    const again = createAlertStateStore(alertFile)
    expect(again.get('7|2026-11-13T02:10:00')).toBe('seen')
    await service.markAlert(owner, { id: '7', state: 'new' })
    expect((await service.alerts(owner)).alerts[0]?.state).toBe('new')
    const rows = handle.db.select().from(auditLog).all()
    expect(rows.filter((r) => r.entity === 'camera_alert')).toHaveLength(3)
  })

  it('aynı numara başka zamanla gelirse (yan sürecin veritabanı sıfırlandı) eski işaret yeni alarmı gizlemez', async () => {
    const { service, sidecar } = await setup()
    const owner = roleCtx('owner')
    await service.markAlert(owner, { id: '7', state: 'handled' })
    sidecar.alerts = [{ id: 7, alert_time: '2026-11-14T01:00:00', details: '', image_path: '' }]
    expect((await service.alerts(owner)).alerts[0]?.state).toBe('new')
  })

  it('listede olmayan alarm NOT_FOUND; yan süreç yokken liste "kullanılamıyor" der', async () => {
    const { service } = await setup()
    expect(await code(() => service.markAlert(roleCtx('owner'), { id: '99', state: 'seen' }))).toMatch(
      /^NOT_FOUND/
    )
    const off = await setup({ running: false })
    expect(await off.service.alerts(roleCtx('owner'))).toEqual({ available: false, alerts: [] })
  })

  it('geçersiz numara ya da durum reddedilir', async () => {
    const { service } = await setup()
    expect(await code(() => service.markAlert(roleCtx('owner'), { id: '../x', state: 'seen' }))).toMatch(
      /^VALIDATION/
    )
    expect(
      await code(() => service.markAlert(roleCtx('owner'), { id: '7', state: 'bogus' as never }))
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
