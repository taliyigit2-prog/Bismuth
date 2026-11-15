import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, today } from '@shared/date'
import { setViewAs } from '@/lib/view-as'
import { alertOf, cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { CameraPage } from './camera-page'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

function phone(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const NOW = today()
const YESTERDAY = addDays(NOW, -1)

function withAlerts() {
  const state = emptyCamera()
  state.alerts = [
    alertOf(9, `${NOW}T02:10:00`),
    alertOf(8, `${NOW}T01:05:00`, 'seen'),
    alertOf(7, `${YESTERDAY}T23:40:00`, 'handled')
  ]
  return state
}

describe('Kamera ekranı: ana bilgisayar penceresi', () => {
  it('çalışırken durum, canlı görüntü, şerit ve yüz kutuları görünür; resim yalnız yan sürecin adresinden', async () => {
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    expect(await screen.findByTestId('camera-state-badge')).toHaveTextContent('Çalışıyor')
    const img = await screen.findByTestId('camera-live-img')
    expect(img).toHaveAttribute('src', 'http://127.0.0.1:51234/api/stream?st=1.abc')
    const strip = await screen.findByTestId('camera-strip')
    expect(strip).toHaveTextContent('Merdiven')
    expect(strip).toHaveTextContent('4 kayıtlı misafir')
    const boxes = await screen.findAllByTestId('camera-box')
    expect(boxes).toHaveLength(2)
    expect(boxes[0]).toHaveAttribute('data-kind', 'known')
    expect(boxes[0]).toHaveTextContent('Иван Петров') // Cyrillic is drawn by the screen, not by the camera program
    expect(boxes[1]).toHaveAttribute('data-kind', 'unknown')
  })

  it('görüntü hata verirse "Görüntü alınamadı" ve yeniden dene; deneyince yeni adres istenir', async () => {
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    const img = await screen.findByTestId('camera-live-img')
    fireEvent.error(img)
    expect(await screen.findByText('Görüntü alınamadı.')).toBeInTheDocument()
    const before = transport.callsTo('camera.streamUrl').length
    await userEvent.setup().click(screen.getByRole('button', { name: 'Yeniden dene' }))
    await waitFor(() => expect(transport.callsTo('camera.streamUrl').length).toBeGreaterThan(before))
    expect(await screen.findByTestId('camera-live-img')).toHaveAttribute('data-state', 'loading')
  })

  it('canlı adres alınamıyorsa görüntü yerine açıklama gösterilir', async () => {
    const state = withAlerts()
    state.streamUrl = null
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByText(/Görüntü adresi alınamadı/)).toBeInTheDocument()
    expect(screen.queryByTestId('camera-live-img')).toBeNull()
  })

  it('alarmlar güne göre gruplanır; "Görüldü olarak işaretle" ve "Halledildi olarak işaretle" durumu değiştirir, "Yeniden aç" geri alır', async () => {
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    const row = await screen.findByTestId('camera-alert-9')
    expect(row).toHaveAttribute('data-state', 'new')
    expect(screen.getByText('Bugün')).toBeInTheDocument()
    expect(screen.getByText('Dün')).toBeInTheDocument()
    const user = userEvent.setup()
    expect(within(row).getByRole('button', { name: 'Görüldü olarak işaretle' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Halledildi olarak işaretle' })).toBeInTheDocument()
    await user.click(screen.getByTestId('camera-alert-seen-9'))
    await waitFor(() => expect(screen.getByTestId('camera-alert-9')).toHaveAttribute('data-state', 'seen'))
    await user.click(screen.getByTestId('camera-alert-handled-9'))
    await waitFor(() => expect(screen.getByTestId('camera-alert-9')).toHaveAttribute('data-state', 'handled'))
    expect(transport.callsTo('camera.markAlert')).toEqual([
      { id: '9', state: 'seen' },
      { id: '9', state: 'handled' }
    ])
    await user.click(screen.getByTestId('camera-alert-reopen-9'))
    await waitFor(() => expect(screen.getByTestId('camera-alert-9')).toHaveAttribute('data-state', 'new'))
  })

  it('süzgeç yalnız seçilen durumdakileri gösterir ve sayıları yazar', async () => {
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(withAlerts()) })
    const filter = await screen.findByTestId('camera-alert-filter')
    expect(within(filter).getByText('Hepsi · 3')).toBeInTheDocument()
    expect(within(filter).getByText('Yeni · 1')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('camera-filter-handled'))
    await waitFor(() => expect(screen.queryByTestId('camera-alert-9')).toBeNull())
    expect(screen.getByTestId('camera-alert-7')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('camera-filter-new'))
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
  })

  it('alarm yoksa boş durum; liste alınamıyorsa nedenini söyler', async () => {
    const state = emptyCamera()
    const { unmount } = await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByText('Alarm yok')).toBeInTheDocument()
    unmount()
    const off = emptyCamera()
    off.available = false
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(off) })
    expect(await screen.findByText('Alarm listesi alınamıyor')).toBeInTheDocument()
  })

  it('"Alarmları duraklat" anahtarı yan sürece iletir', async () => {
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    await userEvent.setup().click(await screen.findByRole('switch', { name: 'Alarmları duraklat' }))
    await waitFor(() => expect(transport.callsTo('camera.setAlarmsPaused')).toEqual([{ paused: true }]))
    expect(await screen.findByText('Alarmlar duraklatıldı')).toBeInTheDocument()
  })

  it('"Yeniden başlat" düğmesi çalışır', async () => {
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    await userEvent.setup().click(await screen.findByTestId('camera-restart'))
    await waitFor(() => expect(transport.callsTo('camera.restart')).toHaveLength(1))
  })

  it('Resepsiyon (yalnız görür): alarmları işaretler ama yeniden başlatma, duraklatma ve ayar bağlantısı yok', async () => {
    act(() => setViewAs('reception'))
    const transport = cameraTransport(withAlerts())
    await renderWithProviders(<CameraPage />, { transport })
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
    expect(screen.queryByTestId('camera-restart')).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Alarmları duraklat' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Kamera ayarları' })).toBeNull()
    await userEvent.setup().click(screen.getByTestId('camera-alert-seen-9'))
    await waitFor(() => expect(transport.callsTo('camera.markAlert')).toHaveLength(1))
  })
})

describe('Kamera ekranı: durumlar', () => {
  it.each([
    ['kapalı', { enabled: false }, 'Kapalı', /Açmak için Ayarlar/],
    [
      'adres yok',
      { blocked: 'noSource' as const, state: 'stopped' as const },
      'Kamera adresi yok',
      /Kamera adresi girilmedi/
    ],
    [
      'bu bilgisayarda yok',
      { state: 'unavailable' as const },
      'Bu bilgisayarda yok',
      /ana bilgisayarını kullanın/
    ],
    [
      'kamera eki yok',
      { addonInstalled: false, state: 'stopped' as const },
      'Kamera eki kurulu değil',
      /Bismuth-Kamera-Windows\.zip.*Kamera ekini kur….*camera-addon klasörünü/
    ]
  ])('%s: tek başlık, ne yapılacağı ve görüntü yok', async (_name, patch, title, body) => {
    const state = emptyCamera()
    Object.assign(state.status, patch)
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText(body)).toBeInTheDocument()
    expect(screen.queryByTestId('camera-live')).toBeNull()
    expect(screen.queryByTestId('camera-alerts')).toBeNull()
  })

  it('kapalıyken sahip "Kamera ayarları" bağlantısını görür', async () => {
    const state = emptyCamera()
    state.status.enabled = false
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByRole('link', { name: 'Kamera ayarları' })).toBeInTheDocument()
  })

  it('başlıyor: durum kartı var, canlı görüntü henüz yok', async () => {
    const state = withAlerts()
    state.status.state = 'starting'
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('camera-state-badge')).toHaveTextContent('Başlıyor')
    expect(screen.queryByTestId('camera-live')).toBeNull()
  })

  it('durdu ve üç kez çöktü: hata rozeti, son hata satırı ve yeniden başlat', async () => {
    const state = withAlerts()
    Object.assign(state.status, {
      state: 'gaveUp',
      totalCrashes: 5,
      crashes: 5,
      lastError: 'RuntimeError: camera lost'
    })
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    expect(await screen.findByTestId('camera-state-badge')).toHaveTextContent('Hata: durdu')
    expect(screen.getByText('RuntimeError: camera lost')).toBeInTheDocument()
    expect(screen.getByText('Program açıldığından beri 5 kez durdu.')).toBeInTheDocument()
    expect(screen.getByTestId('camera-restart')).toBeInTheDocument()
  })

  it('durum alınamazsa hata ekranı yeniden dene sunar; yetkisiz yanıt "yetkiniz yok" der', async () => {
    const transport = cameraTransport()
    const call = transport.call.bind(transport)
    transport.call = ((name: string, input: unknown) =>
      name === 'camera.status'
        ? Promise.reject(Object.assign(new Error('x'), { code: 'NETWORK' }))
        : call(name as never, input as never)) as typeof transport.call
    await renderWithProviders(<CameraPage />, { transport })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })
})

describe('Kamera ekranı: telefon ve istemci (S-108)', () => {
  it('telefon düzeninde canlı görüntü ve yönetim düğmeleri yok; yalnız durum ve alarm listesi', async () => {
    phone()
    const transport = cameraTransport(withAlerts(), { kind: 'http' })
    await renderWithProviders(<CameraPage />, { transport })
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
    expect(screen.getByTestId('camera-state-badge')).toHaveTextContent('Çalışıyor')
    expect(screen.queryByTestId('camera-live')).toBeNull()
    expect(screen.queryByTestId('camera-restart')).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Alarmları duraklat' })).toBeNull()
    expect(transport.callsTo('camera.streamUrl')).toHaveLength(0)
    expect(transport.callsTo('camera.live')).toHaveLength(0)
  })

  it('geniş pencerede bile HTTP istemcisi (Mac) canlı görüntü istemez', async () => {
    const transport = cameraTransport(withAlerts(), { kind: 'http' })
    await renderWithProviders(<CameraPage />, { transport })
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
    expect(screen.queryByTestId('camera-live')).toBeNull()
    expect(transport.callsTo('camera.streamUrl')).toHaveLength(0)
  })

  it('telefonda alarm düğmeleri paylaşılan Button bileşenidir (44 px hedefi o sağlar)', async () => {
    phone()
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(withAlerts(), { kind: 'http' }) })
    const button = await screen.findByTestId('camera-alert-seen-9')
    expect(button).toHaveAttribute('data-slot', 'button')
  })
})

describe('Kamera ekranı: "Misafir olarak kaydet" (P20c, K-53)', () => {
  function withCrop() {
    const state = withAlerts()
    state.alerts[0] = { ...state.alerts[0]!, hasCrop: true }
    state.alerts[1] = { ...state.alerts[1]!, hasCrop: true, linked: true }
    state.candidates = [
      { guestId: 'g1', name: 'Ayşe Örnek', room: '204', faces: 0 },
      { guestId: 'g2', name: 'Can Örnek', room: '205', faces: 2 }
    ]
    return state
  }

  it('resmi saklanan alarmda düğme çıkar; resim açılır, otelde kalan misafir seçilir, kaydedince alarm bağlanır', async () => {
    const transport = cameraTransport(withCrop())
    await renderWithProviders(<CameraPage />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('camera-alert-save-9'))
    expect(await screen.findByTestId('camera-save-guest-crop')).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,/9j/'
    )
    expect(transport.callsTo('camera.alertCrop')).toEqual([{ id: '9' }])
    const confirm = screen.getByTestId('camera-save-guest-confirm')
    expect(confirm).toBeDisabled() // no guest picked yet
    await user.click(screen.getByTestId('camera-save-guest'))
    await user.click(await screen.findByRole('option', { name: /Can Örnek · 205 · 2 yüz kaydı/ }))
    await user.click(confirm)
    await waitFor(() =>
      expect(transport.callsTo('camera.saveAlertAsGuest')).toEqual([{ id: '9', guestId: 'g2' }])
    )
    // The list reloads: the alarm is linked and handled, and its button is gone.
    expect(await screen.findAllByText('Misafire bağlandı')).toHaveLength(2)
    await waitFor(() => expect(screen.queryByTestId('camera-alert-save-9')).toBeNull())
  })

  it('zaten bağlanmış alarmda düğme yok; resmi olmayan (silinmiş) alarmda da yok', async () => {
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(withCrop()) })
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
    expect(screen.queryByTestId('camera-alert-save-8')).toBeNull() // linked
    expect(screen.queryByTestId('camera-alert-save-7')).toBeNull() // no crop kept
    expect(screen.getAllByText('Misafire bağlandı')).toHaveLength(1)
  })

  it('otelde kalan misafir yoksa nedenini söyler; resim silinmişse kaydet kapalı kalır', async () => {
    const state = withCrop()
    state.candidates = []
    state.crop = null
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(state) })
    await userEvent.setup().click(await screen.findByTestId('camera-alert-save-9'))
    expect(await screen.findByText('Şu an otelde kalan misafir yok.')).toBeInTheDocument()
    expect(await screen.findByText(/resmi artık yok/)).toBeInTheDocument()
    expect(screen.getByTestId('camera-save-guest-confirm')).toBeDisabled()
  })

  it('telefonda ve HTTP istemcisinde düğme yok (servis resim bilgisini vermez; yalnız kimlik, zaman, durum)', async () => {
    phone()
    await renderWithProviders(<CameraPage />, {
      transport: cameraTransport(withAlerts(), { kind: 'http' })
    })
    expect(await screen.findByTestId('camera-alert-9')).toBeInTheDocument()
    expect(screen.queryByTestId('camera-alert-save-9')).toBeNull()
  })

  it('yüz kaydı yetkisi olmayan rol alarmı görür ama düğmeyi görmez', async () => {
    act(() => setViewAs('housekeeping'))
    await renderWithProviders(<CameraPage />, { transport: cameraTransport(withCrop()) })
    await waitFor(() => expect(screen.queryByTestId('camera-alert-save-9')).toBeNull())
  })
})
