// The link state in the top bar and the strip under it (faz-13 madde 3): only where the data lives elsewhere.
import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import { connection } from '@/lib/transport'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { ConnectionBadge, ConnectionBanner } from './connection-status'

afterEach(() => connection.reset())

function remote(kind: 'ipc' | 'http', linkState = 'connected') {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  const asked: ProcedureName[] = []
  return Object.assign(Object.create(base) as typeof base, {
    kind,
    asked,
    async call(name: ProcedureName, input: unknown) {
      asked.push(name)
      if (name === 'remote.hello')
        return { app: 'bismuth', version: '0.1.0', schemaVersion: 11, hotelName: 'x' } as never
      if (name === 'remote.replicaStatus' || name === 'remote.replicaSync')
        return {
          state: 'relay',
          asOf: new Date().toISOString(),
          source: 'relay',
          serving: true,
          userName: 'Sahip',
          key: { exists: true, available: true },
          box: { folder: '/x', chosen: null, problem: null, lastReadAt: null },
          takeover: { possible: true, reason: null }
        } as never
      if (name === 'remote.clientStatus')
        return {
          mode: 'client',
          hostUrl: 'http://192.168.1.20:7373',
          state: linkState,
          host: null,
          mine: { version: '0.1.0', schemaVersion: 11 },
          lastContactAt: null,
          identity: { known: 'AAAA-AAAA-AAAA-AAAA', offered: 'BBBB-BBBB-BBBB-BBBB' }
        } as never
      if (name === 'remote.epochState')
        return {
          epoch: 1,
          replaced: { epoch: 2, by: 'Sahibin Mac', at: '2026-10-05T09:00:00.000Z' }
        } as never
      return base.call(name, input as never)
    }
  })
}

describe('bağlantı rozeti ve şeridi', () => {
  it('otelin kendi bilgisayarında (IPC, kendi verisi) hiçbir şey göstermez', async () => {
    await renderWithProviders(
      <>
        <ConnectionBadge />
        <ConnectionBanner />
      </>,
      { transport: remote('ipc') }
    )
    act(() => connection.lost())
    expect(screen.queryByTestId('connection-badge')).not.toBeInTheDocument()
    expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument()
  })

  it('telefonda: bağlıyken rozet; kopunca "bağlantı yok" şeridi, "Şimdi dene" ana bilgisayara sorar ve şerit kalkar', async () => {
    const transport = remote('http')
    await renderWithProviders(
      <>
        <ConnectionBadge />
        <ConnectionBanner />
      </>,
      { transport }
    )
    expect(await screen.findByTestId('connection-badge')).toHaveAttribute('data-status', 'online')
    act(() => connection.lost())
    expect(screen.getByTestId('connection-badge')).toHaveTextContent('Bağlantı yok')
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(
      'Ana bilgisayara ulaşılamıyor. Değişiklikler şu an kaydedilemez'
    )
    await userEvent.setup().click(screen.getByTestId('connection-retry'))
    await waitFor(() => expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument())
    expect(transport.asked).toContain('remote.hello')
  })

  it('istemci modundaki bilgisayarda (IPC ama app.mode=client) da gösterilir; sürüm farkında yenileme ister', async () => {
    await renderWithProviders(<ConnectionBanner />, {
      transport: remote('ipc'),
      settings: { 'app.mode': 'client' }
    })
    act(() => connection.outdated())
    expect(await screen.findByTestId('connection-banner')).toHaveTextContent(
      'Ana bilgisayardaki Bismuth güncellendi.'
    )
    expect(screen.getByRole('button', { name: 'Ekranı yenile' })).toBeInTheDocument()
  })

  it('yedek kopya yanıt verirken (P13b): rozet "Yedek kopya · saat", şerit nedenini söyler; "Şimdi dene" kopyayı eşitler', async () => {
    const transport = remote('ipc')
    await renderWithProviders(
      <>
        <ConnectionBadge />
        <ConnectionBanner />
      </>,
      { transport, settings: { 'app.mode': 'client' } }
    )
    act(() => connection.readOnly())
    await waitFor(() =>
      expect(screen.getByTestId('connection-badge')).toHaveTextContent(/^Yedek kopya · \d{2}:\d{2}$/)
    )
    expect(screen.getByTestId('connection-badge')).toHaveAttribute('data-status', 'readonly')
    expect(screen.getByTestId('read-only-reason')).toHaveTextContent(
      /Bilgiler \d{2}:\d{2} itibarıyla yedek kopyadan gösteriliyor; değişiklik yapılamaz/
    )
    await userEvent.setup().click(screen.getByTestId('connection-retry'))
    await waitFor(() => expect(transport.asked).toContain('remote.replicaSync'))
  })

  it('yerine başkası geçen ana bilgisayarda: "Salt okunur" rozeti ve kimin devraldığı', async () => {
    await renderWithProviders(
      <>
        <ConnectionBadge />
        <ConnectionBanner />
      </>,
      { transport: remote('ipc') }
    )
    act(() => connection.readOnly())
    expect(await screen.findByTestId('connection-badge')).toHaveTextContent('Salt okunur')
    await waitFor(() =>
      expect(screen.getByTestId('read-only-reason')).toHaveTextContent('“Sahibin Mac” devraldı')
    )
    expect(screen.getByTestId('replaced-details')).toHaveTextContent('Ne yapmalı?')
  })

  it('ana bilgisayarın kimliği değişince her ekranda: rozet "Kimlik değişti", şerit Ayarlar bağlantısını verir, "kendiliğinden döner" demez (QA3d D2)', async () => {
    await renderWithProviders(
      <>
        <ConnectionBadge />
        <ConnectionBanner />
      </>,
      { transport: remote('ipc', 'identityChanged'), settings: { 'app.mode': 'client' } }
    )
    act(() => connection.lost())
    await waitFor(() => expect(screen.getByTestId('connection-badge')).toHaveTextContent('Kimlik değişti'))
    const banner = screen.getByTestId('connection-banner')
    expect(banner).toHaveTextContent('Ayarlar → Uzaktan erişimde')
    expect(banner).not.toHaveTextContent('kendiliğinden')
    await userEvent.setup().click(screen.getByTestId('identity-details'))
    expect(window.location.hash).toBe('#/settings?tab=remote')
  })
})
