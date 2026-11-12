// Faz 16 madde 2: a screen that throws shows what to do (in the user's language), reports the error once for the log
// and comes back with "Yeniden dene"; window-level errors give one short notice. Service refusals are not crashes.
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from '@tanstack/react-router'
import { initI18n } from '@/i18n'
import { ApiError, type Transport } from '@/lib/transport'
import { crashReportOf, installCrashReporting, isCrash } from '@/lib/crash-report'
import { CrashBoundary, RouteCrash } from './crash-screen'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

function fakeTransport() {
  const call = vi.fn(() => Promise.resolve({ ok: true }))
  return { transport: { kind: 'ipc', call } as unknown as Transport, call }
}

describe('beklenmeyen hata ekranı', () => {
  it('hata veren ekran yerine ne yapılacağını söyler, hatayı bir kez bildirir, "Yeniden dene" ekranı geri getirir', async () => {
    await initI18n('tr')
    const { transport, call } = fakeTransport()
    installCrashReporting(transport)
    let broken = true
    const Page = () => {
      if (broken) throw new Error('Cannot read properties of undefined')
      return <p>Misafirler</p>
    }
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/', component: Page })]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      defaultErrorComponent: RouteCrash
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    expect(await screen.findByText('Bu ekranda beklenmeyen bir sorun oluştu')).toBeInTheDocument()
    expect(screen.getByText(/Kaydettiğiniz bilgiler saklandı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ekranı yeniden yükle' })).toBeInTheDocument()
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith(
      'system.reportError',
      expect.objectContaining({ kind: 'render', message: 'Cannot read properties of undefined' })
    )
    broken = false
    await userEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }))
    expect(await screen.findByText('Misafirler')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('kabuğun dışındaki hata da Rusça açıklamayla yakalanır', async () => {
    await initI18n('ru')
    const Broken = () => {
      throw new Error('shell')
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CrashBoundary>
          <Broken />
        </CrashBoundary>
      </QueryClientProvider>
    )
    expect(screen.getByRole('alert')).toHaveTextContent('На этом экране произошла непредвиденная ошибка')
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    spy.mockRestore()
    await initI18n('tr')
  })

  it('pencere düzeyindeki hata bildirilir ve tek bir uyarı gösterilir; hizmetin reddi ve tarayıcı gürültüsü sayılmaz', async () => {
    await initI18n('tr')
    const { transport, call } = fakeTransport()
    installCrashReporting(transport)
    toastError.mockClear()
    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('x is not a function') }))
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('again') }))
    })
    expect(call).toHaveBeenCalledWith('system.reportError', expect.objectContaining({ kind: 'window' }))
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith(
      'Beklenmeyen bir sorun oluştu. Son işlemi yeniden deneyin; sorun sürerse ekranı yeniden yükleyin.'
    )
    expect(isCrash(new ApiError('CONFLICT', 409, 'errors.roomOccupied'))).toBe(false)
    expect(isCrash(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false)
  })

  it('bildirimde ekranın yolu sorgusuz gider (aramaya yazılan metin gitmez)', () => {
    window.location.hash = '#/guests?q=Melis%20Karada%C4%9Fl%C4%B1'
    expect(crashReportOf('render', new Error('x')).route).toBe('/guests')
    window.location.hash = ''
  })
})
