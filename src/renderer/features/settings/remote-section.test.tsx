// Ayarlar → Uzaktan erişim on real procedures (faz-13 madde 1): the mode, the addresses with a QR code, the port,
// "always on", the remote session length, client mode's own card, and who may change what.
import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import type { ClientStatus, HostStatus } from '@shared/contract/remote'
import { renderWithProviders } from '@/test/render'
import { adminTransport } from './admin-fake'
import { RemoteSection } from './remote-section'

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls when it opens.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const RUNNING: HostStatus = {
  mode: 'host',
  running: true,
  port: 7373,
  addresses: [
    { url: 'http://192.168.1.20:7373', address: '192.168.1.20', kind: 'lan', iface: 'Ethernet' },
    { url: 'http://100.92.10.4:7373', address: '100.92.10.4', kind: 'netbird', iface: 'wt0' }
  ],
  error: null,
  openAtLogin: false,
  announced: true,
  listenLan: true,
  unservedPrivate: [],
  identity: 'AB12-CD34-EF56-7890'
}

function remoteTransport(initial: HostStatus = RUNNING, kind: 'ipc' | 'http' = 'ipc', client?: ClientStatus) {
  const base = adminTransport({
    settings: { ...SETTINGS_DEFAULTS, ...(client ? { 'app.mode': 'client' as const } : {}) }
  })
  let status = initial
  const calls: { name: ProcedureName; input: unknown }[] = []
  return Object.assign(Object.create(base) as typeof base, {
    kind,
    remoteCalls: calls,
    status: () => status,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      switch (name) {
        case 'remote.hostStatus':
          return status as never
        case 'remote.setMode': {
          const mode = (input as { mode: 'host' | 'standalone' }).mode
          status =
            mode === 'host'
              ? { ...RUNNING }
              : { ...status, mode: 'standalone', running: false, addresses: [], announced: false }
          return status as never
        }
        case 'remote.setOpenAtLogin':
          status = { ...status, openAtLogin: (input as { enabled: boolean }).enabled }
          return status as never
        case 'remote.setListenLan': {
          const enabled = (input as { enabled: boolean }).enabled
          status = {
            ...status,
            listenLan: enabled,
            addresses: enabled ? RUNNING.addresses : RUNNING.addresses.filter((a) => a.kind !== 'lan')
          }
          return status as never
        }
        case 'remote.acceptHostIdentity':
          return {
            ...client,
            state: 'connected',
            identity: { known: client?.identity.offered ?? null, offered: null }
          } as never
        case 'remote.becomeClient':
        case 'remote.leaveClient':
          return { ok: true } as never
        case 'remote.clientStatus':
          return client as never
        case 'remote.forgetHost':
          return { ...client, hostUrl: null, state: 'none' } as never
        default:
          return base.call(name, input as never)
      }
    }
  })
}

describe('Ayarlar → Uzaktan erişim', () => {
  it('ana bilgisayar çalışıyor: adresler (otel ağı + NetBird), QR kodu ve yerel ağ duyurusu görünür', async () => {
    await renderWithProviders(<RemoteSection />, { transport: remoteTransport() })
    expect(await screen.findByTestId('server-on')).toHaveTextContent('Ana bilgisayar çalışıyor')
    const list = screen.getByTestId('host-addresses')
    expect(within(list).getByText('Otel içinden (Wi‑Fi)')).toBeInTheDocument()
    expect(within(list).getByText('Dışarıdan (NetBird)')).toBeInTheDocument()
    expect(screen.getAllByTestId('host-address').map((e) => e.textContent)).toEqual([
      'http://192.168.1.20:7373',
      'http://100.92.10.4:7373'
    ])
    expect(screen.queryByTestId('no-private')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'QR kodu: http://100.92.10.4:7373' }))
    expect(screen.getByRole('img', { name: 'http://100.92.10.4:7373 adresinin QR kodu' })).toBeInTheDocument()
    expect(screen.getByText(/bağlantı ekranında listede görür/)).toBeInTheDocument()
  })

  it('hafif mod anahtarı varsayılan kapalıdır ve ayarı yazar', async () => {
    const transport = remoteTransport()
    await renderWithProviders(<RemoteSection />, { transport })
    const toggle = await screen.findByRole('switch', { name: 'Pencere kapanınca tepside çalışsın' })
    expect(toggle).not.toBeChecked()
    await userEvent.setup().click(toggle)
    await waitFor(() => expect(transport.settings['app.lightMode']).toBe(true))
  })

  it('tek bilgisayardan ana bilgisayara geçer; açılışta başlatma anahtarı çalışır; oturum süresi kaydedilir', async () => {
    const transport = remoteTransport({
      ...RUNNING,
      mode: 'standalone',
      running: false,
      addresses: [],
      announced: false
    })
    await renderWithProviders(<RemoteSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('remote-mode-server'))
    await waitFor(() => expect(transport.status().mode).toBe('host'))
    expect(await screen.findByTestId('server-on')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: "Bilgisayar açılınca Bismuth'u başlat" }))
    await waitFor(() => expect(transport.status().openAtLogin).toBe(true))
    await user.click(screen.getByTestId('session-hours'))
    await user.click(await screen.findByRole('option', { name: '7 gün' }))
    await waitFor(() => expect(transport.settings['host.sessionHours']).toBe(168))
  })

  it('port kullanımdaysa anlaşılır uyarı; yeni port kaydedilir; özel ağ yoksa NetBird hatırlatması', async () => {
    const transport = remoteTransport({ ...RUNNING, running: false, addresses: [], error: 'portInUse' })
    await renderWithProviders(<RemoteSection />, { transport })
    expect(await screen.findByTestId('server-off')).toHaveTextContent(
      '7373 numaralı bağlantı noktasını başka bir program kullanıyor.'
    )
    const user = userEvent.setup()
    const port = screen.getByTestId('host-port')
    await user.clear(port)
    await user.type(port, '80')
    expect(screen.getByText('1024 ile 65535 arasında bir sayı yazın.')).toBeInTheDocument()
    await user.type(port, '80{Enter}')
    await waitFor(() => expect(transport.settings['host.port']).toBe(8080))
  })

  it('ondalıklı port sessizce değiştirilmez, "tam sayı yazın" denir ve Kaydet kapalı kalır (QA3d)', async () => {
    const transport = remoteTransport(RUNNING)
    await renderWithProviders(<RemoteSection />, { transport })
    const user = userEvent.setup()
    const port = await screen.findByTestId('host-port')
    await user.clear(port)
    await user.type(port, '47694.5')
    expect(port).toHaveValue('47694.5')
    expect(screen.getByText('Tam sayı yazın.')).toBeInTheDocument()
    expect(port.closest('form')?.querySelector('button[type="submit"]')).toBeDisabled()
  })

  it('istemciye geçiş önce sorar ("Vazgeç" hiçbir şey yapmaz)', async () => {
    const transport = remoteTransport()
    await renderWithProviders(<RemoteSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('remote-mode-client'))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Bu bilgisayar ana bilgisayara bağlansın mı?'
    )
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(transport.remoteCalls.some((c) => c.name === 'remote.becomeClient')).toBe(false)
    await user.click(screen.getByTestId('remote-mode-client'))
    await user.click(await screen.findByTestId('confirm-client'))
    await waitFor(() =>
      expect(transport.remoteCalls.some((c) => c.name === 'remote.becomeClient')).toBe(true)
    )
  })

  it('telefondan (HTTP) görülür ama değiştirilemez: "yalnız ana bilgisayarda" notu', async () => {
    await renderWithProviders(<RemoteSection />, { transport: remoteTransport(RUNNING, 'http') })
    expect(await screen.findByText(/yalnız otelin ana bilgisayarında değişir/)).toBeInTheDocument()
    expect(await screen.findByTestId('remote-mode-single')).toBeDisabled()
    expect(screen.getByTestId('host-port')).toBeDisabled()
  })

  it('istemci modunda bu bilgisayarın kartı: ana bilgisayar adresi ve bağlantı durumu', async () => {
    const client: ClientStatus = {
      mode: 'client',
      hostUrl: 'http://192.168.1.20:7373',
      state: 'connected',
      host: { app: 'bismuth', version: '0.1.0', schemaVersion: 11, hotelName: 'Lale' },
      mine: { version: '0.1.0', schemaVersion: 11 },
      lastContactAt: null,
      identity: { known: 'AB12-CD34-EF56-7890', offered: null }
    }
    const transport = remoteTransport(RUNNING, 'ipc', client)
    await renderWithProviders(<RemoteSection />, { transport, settings: { 'app.mode': 'client' } })
    const card = await screen.findByTestId('remote-client-card')
    expect(await within(card).findByTestId('client-link-state')).toHaveTextContent('Bağlı')
    expect(card).toHaveTextContent('http://192.168.1.20:7373')
    expect(screen.queryByTestId('remote-mode-card')).not.toBeInTheDocument()
    expect(transport.remoteCalls.some((c) => c.name === 'remote.hostStatus')).toBe(false)
    expect(within(card).getByTestId('client-identity')).toHaveTextContent('AB12-CD34-EF56-7890')
  })

  it('otelin ağı varsayılan kapalı; açarken misafir Wi‑Fi uyarısı sorar, adres listesi buna uyar (K-45)', async () => {
    const transport = remoteTransport({
      ...RUNNING,
      listenLan: false,
      addresses: RUNNING.addresses.filter((a) => a.kind !== 'lan')
    })
    await renderWithProviders(<RemoteSection />, { transport })
    const user = userEvent.setup()
    const toggle = await screen.findByRole('switch', { name: 'Otelin ağından bağlantı' })
    expect(toggle).not.toBeChecked()
    expect(screen.getAllByTestId('host-address').map((e) => e.textContent)).toEqual([
      'http://100.92.10.4:7373'
    ])
    await user.click(toggle)
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Misafirlerin bağlandığı Wi‑Fi otelin kendi ağından ayrı olmalı')
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    expect(transport.remoteCalls.some((c) => c.name === 'remote.setListenLan')).toBe(false)
    await user.click(toggle)
    await user.click(await screen.findByTestId('confirm-listen-lan'))
    await waitFor(() => expect(transport.status().listenLan).toBe(true))
    await waitFor(() =>
      expect(screen.getAllByTestId('host-address').map((e) => e.textContent)).toContain(
        'http://192.168.1.20:7373'
      )
    )
    // Switching it off asks nothing.
    await user.click(screen.getByRole('switch', { name: 'Otelin ağından bağlantı' }))
    await waitFor(() => expect(transport.status().listenLan).toBe(false))
  })

  it('bu bilgisayarın kimliği görünür; NetBird/Tailscale olmayan 100.x adresi için uyarı (D1)', async () => {
    await renderWithProviders(<RemoteSection />, {
      transport: remoteTransport({ ...RUNNING, unservedPrivate: [{ address: '100.80.4.4', iface: 'Wi-Fi' }] })
    })
    expect(await screen.findByTestId('host-identity')).toHaveTextContent('AB12-CD34-EF56-7890')
    expect(screen.getByTestId('unserved-private')).toHaveTextContent(
      '100.80.4.4 NetBird ya da Tailscale adresi değil'
    )
  })

  it('telefondan otelin ağı ayarı ve oturum süresi değiştirilemez', async () => {
    await renderWithProviders(<RemoteSection />, { transport: remoteTransport(RUNNING, 'http') })
    expect(await screen.findByRole('switch', { name: 'Otelin ağından bağlantı' })).toBeDisabled()
    expect(screen.getByTestId('session-hours')).toBeDisabled()
  })

  it('istemcide ana bilgisayarın kimliği değişince uyarır; kabul onayla yapılır (K-45)', async () => {
    const client: ClientStatus = {
      mode: 'client',
      hostUrl: 'http://192.168.1.20:7373',
      state: 'identityChanged',
      host: null,
      mine: { version: '0.1.0', schemaVersion: 11 },
      lastContactAt: null,
      identity: { known: 'AB12-CD34-EF56-7890', offered: '9999-8888-7777-6666' }
    }
    const transport = remoteTransport(RUNNING, 'ipc', client)
    await renderWithProviders(<RemoteSection />, { transport, settings: { 'app.mode': 'client' } })
    const alert = await screen.findByTestId('identity-changed')
    expect(alert).toHaveTextContent('Ana bilgisayarın kimliği değişti')
    expect(alert).toHaveTextContent('9999-8888-7777-6666')
    expect(screen.getByTestId('client-link-state')).toHaveTextContent('Kimlik değişti')
    const user = userEvent.setup()
    await user.click(screen.getByTestId('accept-identity'))
    await user.click(await screen.findByTestId('confirm-accept-identity'))
    // N-7: the fingerprint shown in the alert goes with the acceptance.
    await waitFor(() =>
      expect(transport.remoteCalls.find((c) => c.name === 'remote.acceptHostIdentity')?.input).toEqual({
        fingerprint: '9999-8888-7777-6666'
      })
    )
  })
})
