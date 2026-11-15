// Camera setup wizard's service calls (Faz 20 P20g, G-23, K-49, K-59): computer facts and profile suggestion, the
// local-network search and the one-picture test. Every role × call, the hotel computer's own window only, the open
// setup wizard (no user yet), and the router letting only the setup wizard and signed-in users reach them.
import { afterEach, describe, expect, it } from 'vitest'
import { defaultPermissions, SYSTEM_ROLE_CODES, type SystemRoleCode } from '@shared/permissions'
import { accessOf } from '@shared/contract'
import type { CameraDiscovery, CameraProbe } from '@shared/contract/camera'
import { mayCall } from '../../src/main/api/app'
import { auditLog } from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createFaceCrypto } from '../../src/main/camera/crypto'
import { createSecretStore } from '../../src/main/camera/secrets'
import { createCameraService } from '../../src/main/services/camera-service'
import { anonymousCtx, ctxFromPermissions, setupCtx, type Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { createSettingsService } from '../../src/main/services/settings-service'
import { depsOf, roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const S = 'rtsp:' + '//'
const GOOD = S + 'kamera:gizli@192.168.1.64:554/Streaming/Channels/101'
const PICTURE: CameraProbe = {
  ok: true,
  reason: null,
  image: 'data:image/jpeg;base64,/9j/',
  width: 128,
  height: 72
}
const FOUND: CameraDiscovery = {
  devices: [
    {
      ip: '192.168.1.64',
      protocols: ['onvif', 'sadp'],
      model: 'DS-2CD0000X-I',
      serial: '',
      mac: '',
      activated: true
    }
  ],
  problem: null
}

async function setup(
  hardware = { cpuModel: 'Test CPU', cores: 8, ramGb: 8, platform: 'win32', osRelease: '10.0', arch: 'x64' }
) {
  handle = await seededDatabase()
  const clock = testClock()
  const probed: string[] = []
  let searches = 0
  const service = createCameraService({
    ...depsOf(handle, clock),
    secrets: createSecretStore(null, null),
    faceCrypto: createFaceCrypto(null, null),
    hardware: () => hardware,
    discover: () => {
      searches += 1
      return Promise.resolve(FOUND)
    },
    probe: (source) => {
      probed.push(source)
      return Promise.resolve(PICTURE)
    }
  })
  const settings = createSettingsService(handle.db, clock)
  return { service, settings, probed, searches: () => searches }
}

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn()
    return 'ok'
  } catch (error) {
    return error instanceof AppError ? `${error.code}` : 'other'
  }
}

describe('kamera kurulum sihirbazı yetkisi (P20g)', () => {
  it('her rol × her çağrı: camera düzenleme yetkisi olmayan rol PERMISSION_DENIED alır', async () => {
    const { service } = await setup()
    const calls: { name: string; run: (c: Ctx) => unknown }[] = [
      { name: 'camera.hardware', run: (c) => service.hardware(c) },
      { name: 'camera.discover', run: (c) => service.discover(c) },
      { name: 'camera.probe', run: (c) => service.probe(c, { source: GOOD }) }
    ]
    for (const role of SYSTEM_ROLE_CODES as readonly SystemRoleCode[]) {
      const allowed = defaultPermissions(role)['camera'] === 'edit'
      for (const call of calls)
        expect(await code(() => call.run(roleCtx(role))), `${role} ${call.name}`).toBe(
          allowed ? 'ok' : 'PERMISSION_DENIED'
        )
    }
  })

  it('yalnız kamera görüntüleme yetkisi olan kullanıcı kuruluma dokunamaz', async () => {
    const { service, probed, searches } = await setup()
    const viewer = ctxFromPermissions('u', 'd', 'ipc', { camera: 'view' })
    expect(await code(() => service.installAddon(viewer))).toBe('PERMISSION_DENIED')
    expect(await code(() => service.hardware(viewer))).toBe('PERMISSION_DENIED')
    expect(await code(() => service.discover(viewer))).toBe('PERMISSION_DENIED')
    expect(await code(() => service.probe(viewer, { source: GOOD }))).toBe('PERMISSION_DENIED')
    expect(probed).toEqual([])
    expect(searches()).toBe(0)
  })

  it('telefondan (HTTP) hiçbiri çalışmaz: yalnız otel bilgisayarının kendi penceresi', async () => {
    const { service, probed, searches } = await setup()
    const phone = ctxFromPermissions('u', 'phone', 'http', defaultPermissions('owner'))
    for (const run of [
      () => service.hardware(phone),
      () => service.discover(phone),
      () => service.probe(phone, { source: GOOD })
    ])
      expect(await code(run)).toBe('PERMISSION_DENIED')
    expect(probed).toEqual([])
    expect(searches()).toBe(0)
  })

  it('kurulum penceresi (kullanıcı henüz yok) üçünü de çağırabilir; kurulum bitince yönlendirici reddeder', async () => {
    const { service } = await setup()
    const wizard = setupCtx('d1', 'ipc')
    expect(await code(() => service.hardware(wizard))).toBe('ok')
    expect(await code(() => service.discover(wizard))).toBe('ok')
    expect(await code(() => service.probe(wizard, { source: GOOD }))).toBe('ok')
    // The router: setup + signed-in callers only; nobody signed in is refused; a remote wizard is refused.
    for (const name of [
      'camera.hardware',
      'camera.discover',
      'camera.probe',
      'camera.installAddon',
      'camera.addonInstallState',
      'camera.setSecrets',
      'camera.status'
    ] as const)
      expect(accessOf(name), name).toEqual(['setup', 'user'])
    const access = accessOf('camera.probe')
    expect(mayCall(wizard, access, 'ipc')).toBe(true)
    expect(mayCall(setupCtx('d1', 'http'), access, 'http')).toBe(false)
    expect(mayCall(anonymousCtx('d1', 'ipc'), access, 'ipc')).toBe(false)
    expect(mayCall(roleCtx('owner'), access, 'ipc')).toBe(true)
    // The wizard's rights end the moment setup closes (setupCtx checks on every use).
    let open = true
    const closing = setupCtx('d1', 'ipc', () => open)
    open = false
    expect(await code(() => service.probe(closing, { source: GOOD }))).toBe('PERMISSION_DENIED')
  })
})

describe('kamera kurulum sihirbazı davranışı (P20g, K-59)', () => {
  it('donanım bilgisi ve ayardaki eşiklere göre önerilen profil döner', async () => {
    const { service, settings } = await setup()
    const owner = roleCtx('owner')
    expect(service.hardware(owner)).toMatchObject({
      cores: 8,
      ramGb: 8,
      cpuModel: 'Test CPU',
      recommended: 'standard'
    })
    // The limits are a setting: raising the memory limit makes the same computer "light".
    const table = JSON.parse(JSON.stringify(await readTable(settings, owner)))
    table.rules.lightBelowRamGb = 12
    settings.set(owner, { 'camera.profiles': JSON.stringify(table) })
    expect(service.hardware(owner).recommended).toBe('light')
  })

  it('bozuk profil tablosu ayara yazılamaz', async () => {
    const { settings } = await setup()
    expect(await code(() => settings.set(roleCtx('owner'), { 'camera.profiles': '{"rules":1}' }))).toBe(
      'VALIDATION'
    )
    expect(await code(() => settings.set(roleCtx('owner'), { 'camera.profile': 'ultra' as never }))).toBe(
      'VALIDATION'
    )
  })

  it('keşif sonucu olduğu gibi döner ve her çağrıda yeniden aranır', async () => {
    const { service, searches } = await setup()
    expect(await service.discover(roleCtx('owner'))).toEqual(FOUND)
    await service.discover(roleCtx('owner'))
    expect(searches()).toBe(2)
  })

  it('deneme: özel ağ adresi denenir, başka adres açılmadan reddedilir', async () => {
    const { service, probed } = await setup()
    const owner = roleCtx('owner')
    expect(await service.probe(owner, { source: GOOD })).toEqual(PICTURE)
    for (const bad of [S + 'a:b@8.8.8.8/x', S + 'kamera.example.com/x', S + 'a:b@[::1]/x'])
      expect(await service.probe(owner, { source: bad })).toMatchObject({ ok: false, reason: 'badAddress' })
    expect(probed).toEqual([GOOD])
  })

  it('deneme adresi rtsp olmalı: başka adres doğrulamadan geçemez', async () => {
    const { service } = await setup()
    for (const bad of ['http://192.168.1.64/x', '0', '', S])
      expect(await code(() => service.probe(roleCtx('owner'), { source: bad }))).toBe('VALIDATION')
  })

  it('deneme süreci yoksa "kullanılamıyor" döner', async () => {
    handle = await seededDatabase()
    const service = createCameraService({
      ...depsOf(handle, testClock()),
      secrets: createSecretStore(null, null),
      faceCrypto: createFaceCrypto(null, null)
    })
    expect(await service.probe(roleCtx('owner'), { source: GOOD })).toMatchObject({
      ok: false,
      reason: 'unavailable'
    })
  })

  it('denenen adres ve şifre denetim kaydına yazılmaz', async () => {
    const { service } = await setup()
    await service.probe(roleCtx('owner'), { source: GOOD })
    await service.discover(roleCtx('owner'))
    const rows = handle.db.select().from(auditLog).all()
    expect(JSON.stringify(rows)).not.toContain('gizli')
    expect(JSON.stringify(rows)).not.toContain('192.168.1.64')
  })

  it('kurulum penceresi kamera adresini kaydedebilir, kaydın içeriği geri okunmaz', async () => {
    const { service } = await setup()
    const wizard = setupCtx('d1', 'ipc')
    await service.setSecrets(wizard, { source: GOOD })
    const status = service.status(wizard)
    expect(status.secrets.source).toBe(true)
    expect(JSON.stringify(status)).not.toContain('gizli')
  })
})

async function readTable(settings: ReturnType<typeof createSettingsService>, ctx: Ctx): Promise<unknown> {
  return JSON.parse(settings.get(ctx)['camera.profiles'])
}
