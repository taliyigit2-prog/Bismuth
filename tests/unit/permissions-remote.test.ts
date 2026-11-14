// Who may use Ayarlar → Uzaktan erişim (faz-13 madde 1; G-23): `remote.settings` view to read, edit to change; the
// server's way of working changes only from the hotel's own window (IPC), never from a phone (HTTP).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteHandlers } from '../../src/main/api/handlers/remote'
import { createServices } from '../../src/main/services'
import { localOwnerCtx } from '../../src/main/services/context'
import { createRemoteService, setRemoteRuntime } from '../../src/main/server/remote-service'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roleCtx } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'
import { hostIdentity } from '../../src/main/server/host-identity'

let handle: DatabaseHandle
afterEach(() => {
  setRemoteRuntime(null)
  handle?.close()
})

async function setup() {
  handle = await seededDatabase()
  const services = createServices(handle, {
    name: 'Bismuth',
    version: '0.1.0',
    packaged: false,
    dataDir: tempDataDir(),
    electron: null,
    chrome: null
  })
  const runtime = {
    applyMode: vi.fn(async () => undefined),
    server: () => ({
      running: true,
      addresses: [],
      error: null,
      announced: true,
      listenLan: false,
      unservedPrivate: []
    }),
    identity: hostIdentity(Buffer.alloc(32, 5)),
    openAtLogin: () => false,
    setOpenAtLogin: vi.fn(),
    becomeClient: vi.fn(),
    discover: vi.fn(async () => []),
    version: '0.1.0',
    schemaVersion: () => handle.schemaVersion
  }
  setRemoteRuntime(runtime)
  return { services, runtime, remote: createRemoteService(services) }
}

describe('uzaktan erişim ayarları — yetki', () => {
  it('sahip durumu görür ve ana bilgisayar modunu açar (yalnız otel bilgisayarından)', async () => {
    const { remote, runtime, services } = await setup()
    const owner = roleCtx('owner')
    expect(remote.hostStatus(owner)).toMatchObject({ mode: 'standalone', port: 7373, running: true })
    const after = await remote.setMode(owner, 'host', 'ipc')
    expect(after.mode).toBe('host')
    expect(runtime.applyMode).toHaveBeenCalledWith('host')
    expect(services.settings.get(localOwnerCtx())['app.mode']).toBe('host')
  })

  it('rolü uzaktan erişim yetkisi olmayan (Resepsiyon, Müdür) durumu göremez ve değiştiremez → 403', async () => {
    const { remote, runtime } = await setup()
    for (const role of ['reception', 'manager', 'housekeeping'] as const) {
      expect(() => remote.hostStatus(roleCtx(role))).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
      await expect(remote.setMode(roleCtx(role), 'host', 'ipc')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      })
      expect(() => remote.setOpenAtLogin(roleCtx(role), true, 'ipc')).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
      expect(() => remote.becomeClient(roleCtx(role), 'ipc')).toThrow(
        expect.objectContaining({ code: 'PERMISSION_DENIED' })
      )
    }
    expect(runtime.applyMode).not.toHaveBeenCalled()
  })

  it('telefondan (HTTP) sahip bile sunucuyu kapatamaz, istemciye geçiremez, açılış ayarını değiştiremez', async () => {
    const { remote, runtime } = await setup()
    const owner = roleCtx('owner')
    await expect(remote.setMode(owner, 'standalone', 'http')).rejects.toMatchObject({
      messageKey: 'errors.remoteLocalOnly'
    })
    expect(() => remote.setOpenAtLogin(owner, true, 'http')).toThrow(
      expect.objectContaining({ messageKey: 'errors.remoteLocalOnly' })
    )
    expect(() => remote.becomeClient(owner, 'http')).toThrow(
      expect.objectContaining({ messageKey: 'errors.remoteLocalOnly' })
    )
    expect(runtime.applyMode).not.toHaveBeenCalled()
    expect(runtime.becomeClient).not.toHaveBeenCalled()
  })

  it('ağdan yerel ağ araması yaptırılamaz; istemci yordamları bu bilgisayarda "istemci değil" der', async () => {
    const { remote, runtime } = await setup()
    expect(await remote.discover('http')).toEqual([])
    expect(runtime.discover).not.toHaveBeenCalled()
    await remote.discover('ipc')
    expect(runtime.discover).toHaveBeenCalledTimes(1)
    expect(() => remote.notClient()).toThrow(expect.objectContaining({ messageKey: 'errors.notClientMode' }))
    expect(remote.clientStatus()).toMatchObject({ mode: 'local', state: 'none' })
  })

  it('kayıtlı otel listesi yordamları ana bilgisayarda "istemci değil" der (P21b)', async () => {
    const { services } = await setup()
    const handlers = remoteHandlers(services)
    const env = { transport: 'ipc' } as never
    const ctx = localOwnerCtx()
    for (const call of [
      () => handlers['remote.hotels'](ctx, {}, env),
      () => handlers['remote.hotelUpdate'](ctx, { code: 'pandora', name: 'X' }, env),
      () => handlers['remote.hotelRemove'](ctx, { code: 'pandora' }, env)
    ])
      expect(call).toThrow(expect.objectContaining({ messageKey: 'errors.notClientMode' }))
  })

  it('otelin ağını açmak remote.settings düzenleme ister ve yalnız otel bilgisayarından (K-45)', async () => {
    const { remote, runtime, services } = await setup()
    const applyListen = vi.fn(async () => undefined)
    setRemoteRuntime({ ...runtime, applyListen })
    for (const role of ['reception', 'manager'] as const)
      await expect(remote.setListenLan(roleCtx(role), true, 'ipc')).rejects.toMatchObject({
        code: 'PERMISSION_DENIED'
      })
    await expect(remote.setListenLan(roleCtx('owner'), true, 'http')).rejects.toMatchObject({
      messageKey: 'errors.remoteLocalOnly'
    })
    expect(applyListen).not.toHaveBeenCalled()
    await remote.setListenLan(roleCtx('owner'), true, 'ipc')
    expect(applyListen).toHaveBeenCalledTimes(1)
    expect(services.settings.get(localOwnerCtx())['host.listenLan']).toBe(true)
    expect(remote.hostStatus(roleCtx('owner'))).toMatchObject({
      identity: expect.stringMatching(/^[0-9A-F-]{19}$/)
    })
  })

  it('port ve oturum süresi ayarı remote.settings ister (Müdür değiştiremez)', async () => {
    const { services } = await setup()
    expect(() => services.settings.set(roleCtx('manager'), { 'host.port': 8080 })).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED' })
    )
    expect(() => services.settings.set(roleCtx('manager'), { 'app.mode': 'host' })).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED' })
    )
    expect(services.settings.set(roleCtx('owner'), { 'host.sessionHours': 24 })['host.sessionHours']).toBe(24)
  })
})
