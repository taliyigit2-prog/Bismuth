// Camera service rights and behaviour (Faz 20 P20a, G-23, K-49…K-53): every system role × every camera call, secrets
// that never come back, desktop-only changes, the Telegram test and the crash notice.
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPermissions, SYSTEM_ROLE_CODES, type SystemRoleCode } from '@shared/permissions'
import { auditLog, notifications } from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { CameraRuntime } from '../../src/main/camera'
import { createSecretStore } from '../../src/main/camera/secrets'
import { createCameraService } from '../../src/main/services/camera-service'
import { ctxFromPermissions, systemCtx, type Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { createSettingsService } from '../../src/main/services/settings-service'
import type { FetchLike } from '../../src/main/network/http'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const SOURCE = 'rtsp:' + '//admin:s3cret@192.168.1.64:554/Streaming/Channels/101'
const TOKEN = '1234567:TESTtokenNotReal_abc'

function fakeRuntime() {
  const applied: unknown[] = []
  const runtime: CameraRuntime = {
    apply: (o) => {
      applied.push(o ?? {})
      return Promise.resolve()
    },
    restart: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    snapshot: () => ({
      state: 'running',
      blocked: null,
      pid: 4242,
      crashes: 0,
      totalCrashes: 1,
      lastExitAt: null,
      lastExit: null,
      lastError: null,
      loop: 'ok',
      history: []
    }),
    bridge: () => null
  }
  return { runtime, applied }
}

async function setup(fetchFn?: FetchLike) {
  handle = await seededDatabase()
  const clock = testClock()
  const deps = depsOf(handle, clock)
  const settings = createSettingsService(handle.db, clock)
  const service = createCameraService({
    ...deps,
    secrets: createSecretStore(null, null),
    ...(fetchFn ? { telegram: { fetch: fetchFn } } : {})
  })
  return { service, settings, deps }
}

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn()
    return 'ok'
  } catch (error) {
    return error instanceof AppError ? error.code : 'other'
  }
}

describe('camera yetkisi (G-23)', () => {
  it('her rol × her çağrı: yalnız yetkisi yetmeyen rol PERMISSION_DENIED alır', async () => {
    const { service } = await setup()
    const rt = fakeRuntime()
    service.attach(rt.runtime)
    const owner = roleCtx('owner')
    const calls: { name: string; level: 'view' | 'edit'; run: (c: Ctx) => unknown }[] = [
      { name: 'camera.status', level: 'view', run: (c) => service.status(c) },
      { name: 'camera.restart', level: 'edit', run: (c) => service.restart(c) },
      {
        name: 'camera.setSecrets',
        level: 'edit',
        run: (c) => service.setSecrets(c, { telegramChatIds: '42' })
      },
      { name: 'camera.testTelegram', level: 'edit', run: (c) => service.testTelegram(c) }
    ]
    expect(await code(() => service.status(owner))).toBe('ok')
    for (const role of SYSTEM_ROLE_CODES as readonly SystemRoleCode[]) {
      const level = defaultPermissions(role).camera
      for (const call of calls) {
        const allowed = call.level === 'view' ? level !== 'none' : level === 'edit'
        expect(await code(() => call.run(roleCtx(role))), `${role} ${call.name}`).toBe(
          allowed ? 'ok' : 'PERMISSION_DENIED'
        )
      }
    }
  })

  it('camera.* ayarlarını yalnız camera düzenleme yetkisi olan değiştirir; telefondan hiç değiştirilemez', async () => {
    const { settings } = await setup()
    expect(await code(() => settings.set(roleCtx('reception'), { 'camera.enabled': true }))).toBe(
      'PERMISSION_DENIED'
    )
    expect(await code(() => settings.set(roleCtx('owner'), { 'camera.enabled': true }))).toBe('ok')
    const phone = ctxFromPermissions('u', 'phone', 'http', defaultPermissions('owner'))
    expect(await code(() => settings.set(phone, { 'camera.similarityThreshold': 0.5 }))).toBe(
      'PERMISSION_DENIED'
    )
    expect(settings.get(roleCtx('owner'))['camera.similarityThreshold']).toBe(0.36)
  })

  it('sır değişikliği ve yeniden başlatma yalnız otelin kendi penceresinden (telefon/HTTP olmaz)', async () => {
    const { service } = await setup()
    service.attach(fakeRuntime().runtime)
    const phone = ctxFromPermissions('u', 'phone', 'http', defaultPermissions('owner'))
    const out = async (fn: () => unknown): Promise<string> => {
      try {
        await fn()
        return 'ok'
      } catch (error) {
        return (error as AppError).messageKey
      }
    }
    expect(await out(() => service.setSecrets(phone, { source: SOURCE }))).toBe('errors.remoteLocalOnly')
    expect(await out(() => service.restart(phone))).toBe('errors.remoteLocalOnly')
    expect(await out(() => service.testTelegram(phone))).toBe('errors.remoteLocalOnly')
    expect(service.status(phone).secrets.source).toBe(false) // reading the state is fine
  })
})

describe('camera sırları (K-49, K-51)', () => {
  it('sırlar durum yanıtında, denetim kaydında ve hata metninde değer olarak hiç görünmez', async () => {
    const { service, deps } = await setup()
    service.attach(fakeRuntime().runtime)
    const owner = roleCtx('owner')
    await service.setSecrets(owner, { source: SOURCE, telegramToken: TOKEN, telegramChatIds: '-100123, 42' })
    const status = service.status(owner)
    expect(status.secrets).toEqual({ source: true, telegramToken: true, telegramChats: true })
    expect(JSON.stringify(status)).not.toMatch(/s3cret|TESTtoken|192\.168/)
    const rows = deps.db.select().from(auditLog).all()
    const secretRows = rows.filter((r) => r.entity === 'camera' && r.entityId === 'secrets')
    expect(secretRows).toHaveLength(1)
    expect(secretRows[0]!.afterJson).toContain('camera.source')
    expect(JSON.stringify(rows)).not.toMatch(/s3cret|TESTtoken/)
    expect(service.sidecarSource()).toBe(SOURCE)
  })

  it('yalnız webcam numarası ya da rtsp:// adresi; geçersiz belirteç ve sohbet kimliği reddedilir', async () => {
    const { service } = await setup()
    const owner = roleCtx('owner')
    const key = async (input: Parameters<typeof service.setSecrets>[1]) => {
      try {
        await service.setSecrets(owner, input)
        return 'ok'
      } catch (e) {
        return (e as AppError).messageKey
      }
    }
    expect(await key({ source: 'http://evil.example/stream' })).toBe('errors.cameraSourceInvalid')
    expect(await key({ source: 'rtsp://10.0.0.2/x' })).toBe('ok')
    expect(await key({ source: '0' })).toBe('ok')
    expect(await key({ telegramToken: 'abc' })).toBe('errors.cameraTelegramInvalid')
    expect(await key({ telegramChatIds: '1; drop' })).toBe('errors.cameraTelegramInvalid')
    expect(await key({ telegramChatIds: '-100123,@otelkanal' })).toBe('ok')
  })

  it('kamera adresi değişince yan süreç yeniden başlatılır; null değer sırrı siler', async () => {
    const { service } = await setup()
    const rt = fakeRuntime()
    service.attach(rt.runtime)
    const owner = roleCtx('owner')
    await service.setSecrets(owner, { telegramChatIds: '42' })
    expect(rt.applied).toEqual([]) // Telegram bilgisi sidecar'ı ilgilendirmez
    await service.setSecrets(owner, { source: SOURCE })
    expect(rt.applied).toEqual([{ restart: true }])
    await service.setSecrets(owner, { source: null })
    expect(service.status(owner).secrets.source).toBe(false)
  })

  it('yan süreç barındırmayan bilgisayarda durum "unavailable", yeniden başlatma CONFLICT', async () => {
    const { service } = await setup()
    expect(service.status(roleCtx('owner')).state).toBe('unavailable')
    expect(await code(() => service.restart(roleCtx('owner')))).toBe('CONFLICT')
  })
})

describe('Telegram testi ve çökme bildirimi (K-50)', () => {
  it('ağ ya da Telegram ayarı kapalıyken tek istek çıkmaz; açılınca bilgiler tamamsa gider', async () => {
    const seen: string[] = []
    const fetchFn: FetchLike = (url) => {
      seen.push(url)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    const { service, settings } = await setup(fetchFn)
    const owner = roleCtx('owner')
    await service.setSecrets(owner, { telegramToken: TOKEN, telegramChatIds: '42' })

    expect(await service.testTelegram(owner)).toEqual({ ok: false, reason: 'off' }) // camera.telegram.enabled varsayılan kapalı
    settings.set(owner, { 'camera.telegram.enabled': true, 'network.enabled': false })
    expect(await service.testTelegram(owner)).toEqual({ ok: false, reason: 'off' })
    expect(seen).toHaveLength(0)

    settings.set(owner, { 'network.enabled': true })
    expect(await service.testTelegram(owner)).toEqual({ ok: true, reason: null })
    expect(seen).toEqual([`https://api.telegram.org/bot${TOKEN}/sendMessage`])
  })

  it('3 çökme / vazgeçme bildirimi notifications tablosuna ve denetim kaydına yazılır', async () => {
    const { service, deps } = await setup()
    service.noticeProblem(systemCtx(), { kind: 'crashed', crashes: 3 })
    service.noticeProblem(systemCtx(), { kind: 'gaveUp', crashes: 5 })
    const rows = deps.db.select().from(notifications).all()
    expect(rows.map((r) => [r.kind, r.refId, r.title])).toEqual([
      ['camera_problem', 'crashed', 'main.camera.crashedTitle'],
      ['camera_problem', 'gaveUp', 'main.camera.gaveUpTitle']
    ])
    expect(
      deps.db
        .select()
        .from(auditLog)
        .all()
        .filter((a) => a.entity === 'camera' && a.entityId === 'sidecar' && a.action === 'create')
    ).toHaveLength(2)
  })
})
