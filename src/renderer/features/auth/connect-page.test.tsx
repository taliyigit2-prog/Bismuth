// The connection screen of client mode (faz-13 madde 3, "Faz 4'ten notlar"): main computers found on the local
// network, an address typed by hand, what happens when it cannot be reached or runs another version, and "set up
// here alone". The main process answers the remote.* procedures; here a fake stands in for it.
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProcedureName } from '@shared/contract'
import type { ClientStatus, FoundHost, SavedHotel } from '@shared/contract/remote'
import { ApiError } from '@/lib/transport'
import { fakeTransport, type FakeTransport } from '@/test/render'
import { currentHref, renderApp } from '@/test/render-app'

const URL_ = 'http://192.168.1.20:7373'
const mine = { version: '0.1.0', schemaVersion: 11 }

const noIdentity = { known: null, offered: null }

function clientTransport(
  opts: {
    found?: FoundHost[]
    answer?: 'ok' | 'down' | 'other' | 'stranger' | 'timeout' | 'denied'
    status?: ClientStatus
    hotels?: SavedHotel[]
  } = {}
) {
  let hotels = opts.hotels ?? []
  const base = fakeTransport(undefined, { setup: 'needed', mode: 'client', signedIn: null })
  let status: ClientStatus = opts.status ?? {
    mode: 'client',
    hostUrl: null,
    state: 'none',
    host: null,
    mine,
    lastContactAt: null,
    identity: noIdentity
  }
  let left = 0
  const transport: FakeTransport & { left: () => number } = Object.assign(
    Object.create(base) as FakeTransport,
    {
      left: () => left,
      async call(name: ProcedureName, input: unknown) {
        base.calls.push({ name, input })
        switch (name) {
          case 'remote.clientStatus':
            return status as never
          case 'remote.discover':
            return (opts.found ?? []) as never
          case 'remote.hotels':
            return hotels as never
          case 'remote.hotelRemove':
            hotels = hotels.filter((h) => h.code !== (input as { code: string }).code)
            return hotels as never
          case 'remote.hotelUpdate': {
            const patch = input as { code: string; name?: string; url?: string }
            hotels = hotels.map((h) =>
              h.code === patch.code ? { ...h, name: patch.name ?? h.name, url: patch.url ?? h.url } : h
            )
            return hotels as never
          }
          case 'remote.connect': {
            if (opts.answer === 'timeout') throw new ApiError('UNAVAILABLE', 503, 'errors.hostTimeout')
            if (opts.answer === 'denied') throw new ApiError('UNAVAILABLE', 503, 'errors.hostDenied')
            if (opts.answer === 'down') throw new ApiError('UNAVAILABLE', 503, 'errors.hostUnreachable')
            if (opts.answer === 'stranger' && !(input as { acceptIdentity?: string }).acceptIdentity)
              throw new ApiError('CONFLICT', 409, 'errors.hostIdentityChanged', {
                known: 'AB12-CD34-EF56-7890',
                offered: '9999-8888-7777-6666'
              })
            const host = {
              app: 'bismuth' as const,
              version: opts.answer === 'other' ? '0.2.0' : '0.1.0',
              schemaVersion: 11,
              hotelName: 'Pandora'
            }
            status = {
              ...status,
              hostUrl: URL_,
              host,
              state: opts.answer === 'other' ? 'incompatible' : 'connected'
            }
            if (status.state === 'connected') base.auth.setup = 'done'
            return status as never
          }
          case 'remote.forgetHost':
            status = { ...status, hostUrl: null, state: 'none', host: null }
            return status as never
          case 'remote.acceptHostIdentity':
            status = {
              ...status,
              state: 'connected',
              identity: { known: status.identity.offered, offered: null }
            }
            base.auth.setup = 'done'
            return status as never
          case 'remote.openInBrowser':
            return { ok: true } as never
          case 'remote.leaveClient':
            left++
            base.auth.mode = 'standalone'
            return { ok: true } as never
          default:
            return base.call(name, input as never)
        }
      }
    }
  )
  return transport
}

describe('bağlantı ekranı (istemci modu)', () => {
  it('yerel ağda bulunan ana bilgisayara dokununca bağlanır ve oturum açma ekranına geçer', async () => {
    const transport = clientTransport({
      found: [{ name: 'Bismuth (OTEL-PC)', url: URL_, hotelName: 'Pandora', version: '0.1.0' }]
    })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    expect(await screen.findByTestId('connect')).toBeInTheDocument()
    const user = userEvent.setup()
    const host = await screen.findByTestId('connect-found-host')
    expect(host).toHaveTextContent('Pandora')
    expect(host).toHaveTextContent(URL_)
    await user.click(host)
    await waitFor(() => expect(currentHref()).toMatch(/^\/login/))
    expect(transport.calls.find((c) => c.name === 'remote.connect')?.input).toEqual({ url: URL_ })
  })

  it('elle yazılan adres; ulaşılamazsa ne yapılacağını söyler', async () => {
    const transport = clientTransport({ answer: 'down' })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    expect(await screen.findByTestId('connect-none-found')).toHaveTextContent(
      'Yerel ağda Bismuth ana bilgisayarı bulunamadı. Adresi aşağıya yazın.'
    )
    const user = userEvent.setup()
    const input = screen.getByLabelText('Ana bilgisayarın adresi')
    expect(input).toHaveAccessibleDescription(/Ayarlar → Uzaktan erişim/)
    await user.type(input, '192.168.1.20{Enter}')
    expect(await screen.findByTestId('connect-error')).toHaveTextContent(
      'Ana bilgisayara ulaşılamadı. Açık olduğunu ve aynı ağda olduğunuzu kontrol edin.'
    )
  })

  it('farklı sürüm: hangi tarafın güncelleneceğini söyler, tarayıcıda açmayı önerir', async () => {
    const transport = clientTransport({ answer: 'other' })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Ana bilgisayarın adresi'), '192.168.1.20')
    await user.click(screen.getByTestId('connect-submit'))
    const alert = await screen.findByTestId('connect-incompatible')
    expect(alert).toHaveTextContent('Bu bilgisayardaki Bismuth (0.1.0) ana bilgisayardakinden (0.2.0) eski.')
    await user.click(screen.getByTestId('connect-open-browser'))
    await waitFor(() => expect(transport.calls.some((c) => c.name === 'remote.openInBrowser')).toBe(true))
    expect(currentHref()).toBe('/connect')
  })

  it('kayıtlı ana bilgisayara ulaşılamıyorsa durum ve "başka adres gir" görünür', async () => {
    const transport = clientTransport({
      status: {
        mode: 'client',
        hostUrl: URL_,
        state: 'unreachable',
        host: null,
        mine,
        lastContactAt: null,
        identity: noIdentity
      }
    })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    expect(await screen.findByTestId('connect-unreachable')).toHaveTextContent(`${URL_} yanıt vermiyor.`)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Başka adres gir' }))
    await waitFor(() => expect(screen.queryByTestId('connect-unreachable')).not.toBeInTheDocument())
  })

  it('"Bu bilgisayarı tek başına kur" istemci modundan çıkar ve kurulum açılır', async () => {
    const transport = clientTransport()
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    await userEvent.setup().click(await screen.findByTestId('connect-standalone'))
    await waitFor(() => expect(currentHref()).toMatch(/^\/setup/))
    expect(transport.left()).toBe(1)
  })

  it('başka kimlikle cevap veren adrese bağlanmaz; iki kimliği gösterir, kabul edilirse bağlanır (K-45)', async () => {
    const transport = clientTransport({ answer: 'stranger' })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Ana bilgisayarın adresi'), '192.168.1.20{Enter}')
    const alert = await screen.findByTestId('connect-identity-changed')
    expect(alert).toHaveTextContent('Ana bilgisayarın kimliği değişti')
    expect(alert).toHaveTextContent('AB12-CD34-EF56-7890')
    expect(alert).toHaveTextContent('9999-8888-7777-6666')
    expect(screen.queryByTestId('connect-error')).not.toBeInTheDocument()
    expect(currentHref()).toBe('/connect')
    await user.click(screen.getByTestId('connect-accept-identity'))
    await waitFor(() => expect(currentHref()).toMatch(/^\/login/))
    expect(transport.calls.filter((c) => c.name === 'remote.connect').at(-1)?.input).toEqual({
      url: '192.168.1.20',
      // N-7: the fingerprint the screen showed, not a bare "yes".
      acceptIdentity: '9999-8888-7777-6666'
    })
  })

  it('kayıtlı ana bilgisayarın kimliği değiştiyse bağlantı ekranı uyarır ve kabul etmeyi sorar', async () => {
    const transport = clientTransport({
      status: {
        mode: 'client',
        hostUrl: URL_,
        state: 'identityChanged',
        host: null,
        mine,
        lastContactAt: null,
        identity: { known: 'AB12-CD34-EF56-7890', offered: '9999-8888-7777-6666' }
      }
    })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    expect(await screen.findByTestId('connect-identity-changed')).toHaveTextContent('9999-8888-7777-6666')
    await userEvent.setup().click(screen.getByTestId('connect-accept-identity'))
    await waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'remote.acceptHostIdentity')?.input).toEqual({
        fingerprint: '9999-8888-7777-6666'
      })
    )
  })

  const pandora: SavedHotel = {
    code: 'pandora',
    name: 'Pandora',
    url: URL_,
    fingerprint: 'AB12-CD34-EF56-7890',
    lastUsedAt: '2026-11-10T09:30:00.000Z',
    active: false
  }
  const bosphorus: SavedHotel = {
    code: 'bosphorus',
    name: 'Bosphorus Inn',
    url: 'http://100.64.0.20:7373',
    fingerprint: null,
    lastUsedAt: null,
    active: false
  }

  it('kayıtlı oteller listelenir (ad, adres, parmak izi); dokununca o adrese bağlanır', async () => {
    const transport = clientTransport({ hotels: [pandora, bosphorus] })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const rows = await screen.findAllByTestId('hotel-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Pandora')
    expect(rows[0]).toHaveTextContent('AB12-CD34-EF56-7890')
    expect(rows[1]).toHaveTextContent('Henüz bağlanılmadı')
    const user = userEvent.setup()
    await user.click(rows[1]!.querySelector('[data-testid="hotel-connect"]') as HTMLElement)
    await waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'remote.connect')?.input).toEqual({
        url: 'http://100.64.0.20:7373'
      })
    )
  })

  it('kayıtlı otel yokken boş durum yazar', async () => {
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport: clientTransport() })
    expect(await screen.findByTestId('hotel-list-empty')).toHaveTextContent('Henüz kayıtlı otel yok.')
  })

  it('otelin adı ve adresi düzenlenir; adres hatalıysa kaydedilmez ve nedeni yazar', async () => {
    const transport = clientTransport({ hotels: [pandora] })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('hotel-edit'))
    const name = await screen.findByTestId('hotel-name')
    await user.clear(name)
    await user.type(name, 'Pandora Kadıköy')
    const url = screen.getByTestId('hotel-url')
    await user.clear(url)
    await user.type(url, '192.168.1.20:99999')
    expect(await screen.findByText(/Bağlantı noktası 1 ile 65535/)).toBeInTheDocument()
    expect(screen.getByTestId('hotel-save')).toBeDisabled()
    await user.clear(url)
    await user.type(url, '192.168.1.30')
    await user.click(screen.getByTestId('hotel-save'))
    await waitFor(() => expect(screen.getByTestId('hotel-row')).toHaveTextContent('Pandora Kadıköy'))
    expect(transport.calls.find((c) => c.name === 'remote.hotelUpdate')?.input).toEqual({
      code: 'pandora',
      name: 'Pandora Kadıköy',
      url: '192.168.1.30'
    })
  })

  it('kullanımdaki otelin adresi düzenlenemez', async () => {
    await renderApp({
      setup: 'needed',
      mode: 'client',
      signedIn: null,
      transport: clientTransport({ hotels: [{ ...pandora, active: true }] })
    })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('hotel-edit'))
    expect(await screen.findByTestId('hotel-url')).toBeDisabled()
  })

  it('otel listeden kaldırılırken onay ister', async () => {
    const transport = clientTransport({ hotels: [pandora, bosphorus] })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    await user.click((await screen.findAllByTestId('hotel-remove'))[0]!)
    expect(await screen.findByText('Listeden kaldırılsın mı: Pandora?')).toBeInTheDocument()
    await user.click(screen.getByTestId('hotel-remove-confirm'))
    await waitFor(() => expect(screen.getAllByTestId('hotel-row')).toHaveLength(1))
    expect(screen.getByTestId('hotel-row')).toHaveTextContent('Bosphorus Inn')
  })

  it('geçersiz adres sorulmadan, nedeniyle reddedilir (H-33)', async () => {
    const transport = clientTransport()
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    const input = await screen.findByLabelText('Ana bilgisayarın adresi')
    await user.type(input, 'https://192.168.1.20{Enter}')
    expect(await screen.findByText(/https desteklenmez/)).toBeInTheDocument()
    expect(transport.calls.some((c) => c.name === 'remote.connect')).toBe(false)
  })

  it.each([
    ['timeout', 'Ana bilgisayar zamanında yanıt vermedi.'],
    ['denied', 'Ana bilgisayar bu bilgisayarın bağlanmasını kabul etmedi.'],
    ['down', 'Ana bilgisayara ulaşılamadı.']
  ] as const)('bağlantı hatası nedenini ve adresi söyler: %s', async (answer, text) => {
    const transport = clientTransport({ answer, hotels: [pandora] })
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null, transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('hotel-connect'))
    const error = await screen.findByTestId('connect-error')
    expect(error).toHaveTextContent(text)
    expect(error).toHaveTextContent(URL_)
  })
})
