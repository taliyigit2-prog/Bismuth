import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { CameraAddonMissing } from './addon-missing'

describe('Kamera eki kurulu değil bildirimi', () => {
  it('"Kamera ekini kur…" düğmesi dosya seçtirir; iptal edilirse hata göstermez', async () => {
    const state = emptyCamera()
    state.addon.pick = 'canceled'
    const transport = cameraTransport(state)
    await renderWithProviders(<CameraAddonMissing />, { transport })
    await userEvent.click(await screen.findByRole('button', { name: 'Kamera ekini kur…' }))
    await waitFor(() => expect(transport.callsTo('camera.installAddon')).toHaveLength(1))
    expect(screen.queryByTestId('camera-addon-error')).toBeNull()
    expect(screen.queryByTestId('camera-addon-progress')).toBeNull()
  })

  it('kurulurken ilerleme çubuğu görünür ve düğme kapalıdır', async () => {
    const state = emptyCamera()
    state.addon.install = { phase: 'unpacking', percent: 40, error: null }
    await renderWithProviders(<CameraAddonMissing />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('camera-addon-progress')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kamera ekini kur…' })).toBeDisabled()
  })

  it('başarısız kurulumda nedeni gösterir, düğme yeniden açılır', async () => {
    const state = emptyCamera()
    state.addon.install = { phase: 'failed', percent: 0, error: 'wrongSystem' }
    await renderWithProviders(<CameraAddonMissing />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('camera-addon-error')).toHaveTextContent('başka bir bilgisayar türü')
    expect(screen.getByRole('button', { name: 'Kamera ekini kur…' })).toBeEnabled()
  })

  it('kurulum bitince yeniden başlatma notu görünür', async () => {
    const state = emptyCamera()
    state.addon.install = { phase: 'done', percent: 100, error: null }
    await renderWithProviders(<CameraAddonMissing />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('camera-addon-done')).toHaveTextContent('yeniden başlatılıyor')
  })
})
