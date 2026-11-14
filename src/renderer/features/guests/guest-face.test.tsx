// "Kameradan yüz al" on the guest card (Faz 20 P20c; K-51…K-53): the state of the guest's face record, taking a face, the
// confirmed delete, the cases where taking is not possible (not in the house, no key store, a phone/client window) and the
// roles that do not see it at all.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, configure, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setViewAs } from '@/lib/view-as'
import { cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { GuestFace } from './guest-face'

configure({ asyncUtilTimeout: 4000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  act(() => setViewAs('owner'))
})

describe('misafir kartında yüz kaydı', () => {
  it('kayıt yokken "Yüz kaydı yok"; "Kameradan yüz al" yüzü alır ve durum güncellenir', async () => {
    const transport = cameraTransport()
    await renderWithProviders(<GuestFace guestId="g1" />, { transport })
    expect(await screen.findByTestId('guest-face-state')).toHaveTextContent('Yüz kaydı yok')
    expect(screen.queryByTestId('guest-face-delete')).toBeNull()
    await userEvent.setup().click(screen.getByTestId('guest-face-enroll'))
    await waitFor(() => expect(transport.callsTo('camera.enrollFace')).toEqual([{ guestId: 'g1' }]))
    expect(await screen.findByText('1 yüz kaydı var')).toBeInTheDocument()
    expect(screen.getByTestId('guest-face-delete')).toBeInTheDocument()
  })

  it('silme onay ister; onaylayınca tüm yüz kayıtları silinir, vazgeçince hiçbir şey olmaz', async () => {
    const state = emptyCamera()
    state.face = { ...state.face, count: 2, enrolledAt: '2026-11-13T09:00:00.000Z' }
    const transport = cameraTransport(state)
    await renderWithProviders(<GuestFace guestId="g1" />, { transport })
    expect(await screen.findByText('2 yüz kaydı var')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('guest-face-delete'))
    expect(await screen.findByText('Yüz kaydı silinsin mi?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(transport.callsTo('camera.deleteFaces')).toHaveLength(0)
    await user.click(screen.getByTestId('guest-face-delete'))
    await user.click(await screen.findByTestId('guest-face-delete-confirm'))
    await waitFor(() => expect(transport.callsTo('camera.deleteFaces')).toEqual([{ guestId: 'g1' }]))
    expect(await screen.findByText('Yüz kaydı yok')).toBeInTheDocument()
  })

  it('misafir otelde değilse düğme kapalı ve nedeni yazılır', async () => {
    const state = emptyCamera()
    state.face = { ...state.face, inHouse: false }
    await renderWithProviders(<GuestFace guestId="g1" />, { transport: cameraTransport(state) })
    expect(await screen.findByText(/Misafir otelde değil/)).toBeInTheDocument()
    expect(screen.getByTestId('guest-face-enroll')).toBeDisabled()
  })

  it('bu bilgisayarda anahtar deposu yoksa düğme kapalı ve nedeni yazılır', async () => {
    const state = emptyCamera()
    state.face = { ...state.face, keyStore: false }
    await renderWithProviders(<GuestFace guestId="g1" />, { transport: cameraTransport(state) })
    expect(await screen.findByText(/yüz bilgisini güvenle saklayamıyor/)).toBeInTheDocument()
    expect(screen.getByTestId('guest-face-enroll')).toBeDisabled()
  })

  it('HTTP istemcisinde (telefon/Mac) yüz alınamaz: düğme kapalı, "yalnız ana bilgisayardan" yazar; silme açık', async () => {
    const state = emptyCamera()
    state.face = { ...state.face, count: 1, enrolledAt: '2026-11-13T09:00:00.000Z' }
    await renderWithProviders(<GuestFace guestId="g1" />, {
      transport: cameraTransport(state, { kind: 'http' })
    })
    expect(await screen.findByText(/yalnız otelin ana bilgisayarından/)).toBeInTheDocument()
    expect(screen.getByTestId('guest-face-enroll')).toBeDisabled()
    expect(screen.getByTestId('guest-face-delete')).toBeEnabled()
  })

  it('en çok yüz kaydına ulaşınca düğme kapanır', async () => {
    const state = emptyCamera()
    state.face = { ...state.face, count: 5 }
    await renderWithProviders(<GuestFace guestId="g1" />, { transport: cameraTransport(state) })
    expect(await screen.findByText('5 yüz kaydı var')).toBeInTheDocument()
    expect(screen.getByTestId('guest-face-enroll')).toBeDisabled()
  })

  it('kayıtlı yüzün resmi gösterilir', async () => {
    const state = emptyCamera()
    state.face = {
      ...state.face,
      count: 1,
      enrolledAt: '2026-11-13T09:00:00.000Z',
      crop: 'data:image/jpeg;base64,/9j/'
    }
    await renderWithProviders(<GuestFace guestId="g1" />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('guest-face-crop')).toHaveAttribute('src', 'data:image/jpeg;base64,/9j/')
  })

  it('yetkisi olmayan rol (kat hizmetleri) bölümü hiç görmez ve yüz bilgisi istemez', async () => {
    act(() => setViewAs('housekeeping'))
    const transport = cameraTransport()
    await renderWithProviders(<GuestFace guestId="g1" />, { transport })
    await waitFor(() => expect(screen.queryByTestId('guest-face')).toBeNull())
    expect(transport.callsTo('camera.faceStatus')).toHaveLength(0)
  })
})
