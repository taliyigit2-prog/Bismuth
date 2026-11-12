import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AppInfo } from '@shared/contract'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { ApiError, type Transport } from '@/lib/transport'
import { AboutPage } from './about-page'

const INFO: AppInfo = {
  name: 'Bismuth',
  version: '1.0.0',
  build: { commit: '33b453e', date: '2026-10-05' },
  versions: { electron: '37.10.3', chrome: '138.0.0.0', node: '22.20.0', sqlite: '3.50.4' },
  platform: 'win32',
  arch: 'x64',
  packaged: true,
  dataDir: 'C:\\Users\\Otel\\AppData\\Roaming\\Bismuth',
  schemaVersion: 14,
  integrity: 'ok',
  transport: 'ipc'
}

function withInfo(result: () => Promise<unknown>): Transport {
  const base = fakeTransport()
  return {
    kind: 'ipc',
    call: (name, input) => (name === 'app.getInfo' ? result() : base.call(name, input))
  } as Transport
}

describe('Hakkında ekranı', { timeout: 20_000 }, () => {
  it('sürümü, derleme tarihini ve derleme kimliğini gösterir', async () => {
    await renderWithProviders(<AboutPage />, { transport: withInfo(async () => INFO) })
    expect(await screen.findByTestId('about-version')).toHaveTextContent('1.0.0')
    expect(screen.getByTestId('about-build-date')).toHaveTextContent('5 Ekim 2026')
    expect(screen.getByTestId('about-commit')).toHaveTextContent('33b453e')
    expect(screen.getByText('Derleme tarihi')).toBeInTheDocument()
  })

  it('geliştirme sürümünde derleme damgası yoksa o satırlar hiç görünmez', async () => {
    const dev = { ...INFO, build: { commit: null, date: null } }
    await renderWithProviders(<AboutPage />, { transport: withInfo(async () => dev) })
    expect(await screen.findByTestId('about-version')).toBeInTheDocument()
    expect(screen.queryByTestId('about-build-date')).toBeNull()
    expect(screen.queryByTestId('about-commit')).toBeNull()
  })

  it('Rusça arayüzde derleme tarihi Rusça biçimde yazılır', async () => {
    await renderWithProviders(<AboutPage />, {
      settings: { 'ui.language': 'ru' },
      transport: withInfo(async () => INFO)
    })
    expect(await screen.findByTestId('about-build-date')).toHaveTextContent('5 октября 2026 г.')
    expect(screen.getByText('Дата сборки')).toBeInTheDocument()
  })

  it('bilgi gelene kadar yükleniyor, gelmezse hata ve yeniden dene gösterir', async () => {
    const pending = await renderWithProviders(<AboutPage />, {
      transport: withInfo(() => new Promise(() => {}))
    })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    pending.unmount()

    const failing = withInfo(() => Promise.reject(new ApiError('INTERNAL', 500, 'errors.loadFailed')))
    await renderWithProviders(<AboutPage />, { transport: failing })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('lisans listesi her zaman görünür; düğme bütün lisans metinlerini bir pencerede açar', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<AboutPage />, { transport: withInfo(async () => INFO) })
    expect(await screen.findByTestId('license-list')).toHaveTextContent('react')
    await user.click(screen.getByTestId('show-licenses'))
    const dialog = await screen.findByRole('dialog', { name: 'Lisans metinleri' })
    const texts = await within(dialog).findByTestId('license-texts')
    expect(texts).toHaveTextContent('Third-party notices — Bismuth')
    expect(texts).toHaveTextContent('MIT License')
    expect(texts).toHaveTextContent('better-sqlite3')
  })
})
