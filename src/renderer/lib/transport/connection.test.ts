import { describe, expect, it } from 'vitest'
import { createConnectionStore } from './connection'
import { createHttpTransport } from './http'
import { createIpcTransport } from './ipc'
import { withConnection } from './index'
import { ApiError, type Transport } from './types'

const failing = (error: unknown): Transport => ({
  kind: 'ipc',
  call: () => Promise.reject(error)
})

describe('bağlantı durumu (faz-13 madde 3)', () => {
  it('ulaşılamayınca "bağlantı yok", yanıt gelince "bağlı"; farklı sürüm yenileyene dek kalır', async () => {
    let now = 1_000
    const store = createConnectionStore(() => now)
    const ok = withConnection({ kind: 'http', call: async () => ({}) as never }, store)
    const down = withConnection(failing(new ApiError('NETWORK', 0, 'errors.network')), store)
    const away = withConnection(failing(new ApiError('UNAVAILABLE', 503, 'errors.hostUnreachable')), store)
    const other = withConnection(failing(new ApiError('UNAVAILABLE', 503, 'errors.hostVersion')), store)
    const refused = withConnection(
      failing(new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')),
      store
    )

    await ok.call('remote.hello', {})
    expect(store.get()).toMatchObject({ status: 'online', lastOkAt: 1_000 })
    now = 2_000
    await expect(down.call('rooms.list', {})).rejects.toBeInstanceOf(ApiError)
    expect(store.get()).toMatchObject({ status: 'offline', since: 2_000, lastOkAt: 1_000 })
    await expect(away.call('rooms.list', {})).rejects.toBeInstanceOf(ApiError)
    expect(store.get().status).toBe('offline')
    // A refusal is an answer: the main computer is there.
    await expect(refused.call('rooms.list', {})).rejects.toBeInstanceOf(ApiError)
    expect(store.get().status).toBe('online')
    await expect(other.call('rooms.list', {})).rejects.toBeInstanceOf(ApiError)
    expect(store.get().status).toBe('outdated')
    await ok.call('remote.hello', {})
    expect(store.get().status).toBe('outdated')
  })

  it('tarayıcı taşıması: ana bilgisayarın sürümü sayfa açıkken değişirse "sürüm farklı" der ve durur', async () => {
    let version = '0.1.0'
    const transport = createHttpTransport(
      'http://192.168.1.20:7373',
      async () => new Response('{"ok":true}', { headers: { 'x-bismuth-version': version } })
    )
    await expect(transport.call('remote.hello', {})).resolves.toEqual({ ok: true })
    version = '0.2.0'
    await expect(transport.call('rooms.list', {})).rejects.toMatchObject({ messageKey: 'errors.hostVersion' })
  })

  it('tarayıcı taşıması: ağ hatası NETWORK olur; istek JSON ve aynı kaynak çereziyle gider', async () => {
    const seen: RequestInit[] = []
    const ok = createHttpTransport('http://h:7373/', async (url, init) => {
      seen.push({ ...init, headers: { ...(init.headers as object), url } as never })
      return new Response('{}')
    })
    await ok.call('rooms.list', {})
    expect(seen[0]).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(seen[0]?.headers).toMatchObject({
      'content-type': 'application/json',
      url: 'http://h:7373/api/rooms.list'
    })
    const down = createHttpTransport('http://h:7373', () => Promise.reject(new TypeError('failed')))
    await expect(down.call('rooms.list', {})).rejects.toMatchObject({
      code: 'NETWORK',
      messageKey: 'errors.network'
    })
  })

  it('203 yanıtı "yedek kopya": salt okunur durum; kopyadan gelen ret durumu değiştirmez; canlı yanıt geri getirir', async () => {
    let status = 203
    let refuse = false
    const store = createConnectionStore(() => 5_000)
    const transport = withConnection(
      {
        kind: 'ipc',
        call: async () => ({}) as never,
        callWithStatus: async () => {
          if (refuse) throw new ApiError('CONFLICT', 409, 'errors.readOnlyCopy')
          return { output: {} as never, status }
        }
      },
      store
    )
    await transport.call('rooms.list', {})
    expect(store.get()).toMatchObject({ status: 'readonly', lastOkAt: 5_000 })
    refuse = true
    await expect(transport.call('guests.create', {} as never)).rejects.toMatchObject({
      messageKey: 'errors.readOnlyCopy'
    })
    expect(store.get().status).toBe('readonly')
    refuse = false
    status = 200
    await transport.call('rooms.list', {})
    expect(store.get().status).toBe('online')
  })

  it('IPC taşıması yanıtın durumunu da verir (203 = kopyadan)', async () => {
    const ipc = createIpcTransport({
      api: async () => ({ status: 203, body: '{"ok":true}' }),
      ready: () => undefined,
      platform: 'darwin'
    } as never)
    await expect(ipc.callWithStatus!('auth.ping', {})).resolves.toEqual({ output: { ok: true }, status: 203 })
  })
})
