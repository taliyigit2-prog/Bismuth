// P20e (K-52, K-58, S-107): the privacy notice (text from the settings, three languages, print), the staff exclusion list
// and the destruction report on Ayarlar → Kamera.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { setViewAs } from '@/lib/view-as'
import { cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { CameraSection } from '../settings/camera-section'
import { CameraPage } from './camera-page'
import { PrivacyNotice, PrivacyNoticeButton, type PrivacyFacts } from './privacy-notice'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const FACTS: PrivacyFacts = {
  hotel: 'Örnek Otel, İstanbul',
  contact: 'Örnek Sk. 1, 0212 000 00 00',
  telegram: false,
  telegramPhoto: true,
  faceRetentionDays: 0,
  alertRetentionDays: 3
}

describe('aydınlatma metni (K-58)', () => {
  it('veri sorumlusu, amaç, haklar ve saklama süreleri ayarlardan gelir; Telegram kapalıyken yurt dışı notu yok', async () => {
    await renderWithProviders(<PrivacyNotice facts={FACTS} lang="tr" />)
    const text = await screen.findByTestId('privacy-notice')
    expect(text).toHaveTextContent('Bu otelde kamera ile kayıt alınmaktadır')
    expect(text).toHaveTextContent('Örnek Otel, İstanbul. İletişim: Örnek Sk. 1, 0212 000 00 00')
    expect(text).toHaveTextContent('çıkış yapınca silinir')
    expect(text).toHaveTextContent('3 gün sonra silinir')
    expect(text).toHaveTextContent('11. maddesi')
    expect(screen.queryByTestId('privacy-telegram')).toBeNull()
    expect(text).not.toHaveTextContent('Telegram')
  })

  it('Telegram açıkken yurt dışı aktarım notu çıkar (fotoğraf ayarına göre); çıkış sonrası saklama gün sayısı yazılır; iletişim boşsa doldurulacak çizgi kalır', async () => {
    await renderWithProviders(
      <PrivacyNotice facts={{ ...FACTS, telegram: true, faceRetentionDays: 7, contact: '' }} lang="tr" />
    )
    expect(await screen.findByTestId('privacy-telegram')).toHaveTextContent(
      'yurt dışındaki Telegram sunucularından geçer'
    )
    expect(screen.getByTestId('privacy-telegram')).toHaveTextContent('yüz görüntüsü de eklenir')
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('çıkıştan 7 gün sonra silinir')
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('İletişim: ....')
  })

  it('metin üç dilde çıkar; Rusça gün çoğulu doğru', async () => {
    const ru = await renderWithProviders(
      <PrivacyNotice facts={{ ...FACTS, faceRetentionDays: 2, alertRetentionDays: 5 }} lang="ru" />
    )
    expect(await screen.findByTestId('privacy-sign')).toHaveTextContent(
      'В этом отеле ведётся видеонаблюдение'
    )
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('через 2 дня после выезда')
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('через 5 дней')
    ru.unmount()
    await renderWithProviders(<PrivacyNotice facts={FACTS} lang="en" />)
    expect(await screen.findByTestId('privacy-sign')).toHaveTextContent(
      'Camera recording is in use at this hotel'
    )
    expect(screen.getByTestId('privacy-notice')).toHaveTextContent('Under article 11')
  })

  it('Kamera ekranında "Aydınlatma metni" düğmesi metni açar; dil seçilir; yazdır düğmesi var', async () => {
    const transport = cameraTransport(emptyCamera())
    await renderWithProviders(<CameraPage />, {
      transport,
      settings: { 'hotel.name': 'Örnek Otel', 'hotel.city': 'İstanbul', 'camera.faceRetentionDays': 2 }
    })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('privacy-notice-open'))
    const dialog = await screen.findByRole('dialog', { name: 'Aydınlatma metni' })
    expect(await within(dialog).findByTestId('privacy-notice')).toHaveTextContent('Örnek Otel, İstanbul')
    expect(within(dialog).getByTestId('privacy-notice')).toHaveTextContent('çıkıştan 2 gün sonra silinir')
    await user.click(within(dialog).getByTestId('privacy-lang-en'))
    expect(within(dialog).getByTestId('privacy-sign')).toHaveTextContent('Camera recording is in use')
    expect(within(dialog).getByTestId('privacy-print-button')).toBeEnabled()
  })

  it('düğme sihirbaz için dışarıdan verilen değerleri kullanır (henüz kaydedilmemiş otel adı)', async () => {
    await renderWithProviders(<PrivacyNoticeButton facts={{ hotel: 'Taslak Otel' }} />)
    await userEvent.setup().click(await screen.findByTestId('privacy-notice-open'))
    expect(await screen.findByTestId('privacy-notice')).toHaveTextContent('Taslak Otel')
  })
})

async function openSettings(
  state = emptyCamera(),
  opts: Parameters<typeof cameraTransport>[1] = {},
  patch: Record<string, unknown> = {}
) {
  const transport = cameraTransport(state, opts)
  const saved: unknown[] = []
  await renderWithProviders(
    <CameraSection values={{ ...SETTINGS_DEFAULTS, ...patch }} onSave={(p) => saved.push(p)} />,
    { transport }
  )
  await screen.findByTestId('camera-privacy')
  return { transport, saved, user: userEvent.setup() }
}

const person = (id: string, name: string, faces = 0) => ({
  employeeId: id,
  name,
  position: 'Resepsiyon',
  faces
})

describe('Ayarlar → Kamera → Gizlilik ve saklama', () => {
  it('başvuru adresi ayara yazılır', async () => {
    const { saved, user } = await openSettings()
    await user.type(screen.getByTestId('camera-privacy-contact'), 'Örnek Sk. 1')
    await user.click(
      within(screen.getByTestId('camera-privacy-contact').closest('form')!).getByRole('button', {
        name: 'Kaydet'
      })
    )
    expect(saved).toEqual([{ 'camera.privacyContact': 'Örnek Sk. 1' }])
  })

  it('personel listesi: boşken açıklama; çalışan seçilip kameradan yüz alınır; listeye girer', async () => {
    const state = emptyCamera()
    state.staff.others = [person('e1', 'Hasan Personel'), person('e2', 'Ayşe Ek')]
    const { transport, user } = await openSettings(state)
    const staff = await screen.findByTestId('camera-staff')
    expect(await within(staff).findByText('Listede kimse yok')).toBeInTheDocument()
    expect(within(staff).getByTestId('camera-staff-take')).toBeDisabled()
    await user.click(within(staff).getByTestId('camera-staff-pick'))
    await user.click(await screen.findByRole('option', { name: /Hasan Personel/ }))
    await user.click(within(staff).getByTestId('camera-staff-take'))
    await waitFor(() => expect(transport.callsTo('camera.enrollStaff')).toEqual([{ employeeId: 'e1' }]))
    const row = await within(staff).findByTestId('camera-staff-row')
    expect(row).toHaveTextContent('Hasan Personel')
    expect(row).toHaveTextContent('1 yüz')
    expect(toast.success).toHaveBeenCalledWith('Yüz alındı')
  })

  it('listeden çıkarma onay ister, onaylanınca yüz silinir ve kişi seçim listesine döner', async () => {
    const state = emptyCamera()
    state.staff.listed = [person('e1', 'Hasan Personel', 2)]
    const { transport, user } = await openSettings(state)
    const staff = await screen.findByTestId('camera-staff')
    await user.click(await within(staff).findByTestId('camera-staff-remove'))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Hasan Personel listeden çıkarılsın mı?')
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    expect(transport.callsTo('camera.removeStaff')).toEqual([])
    await user.click(await within(staff).findByTestId('camera-staff-remove'))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByTestId('camera-staff-remove-confirm')
    )
    await waitFor(() => expect(transport.callsTo('camera.removeStaff')).toEqual([{ employeeId: 'e1' }]))
    await waitFor(() => expect(within(staff).queryByTestId('camera-staff-row')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Listeden çıkarıldı')
  })

  it('ana bilgisayar dışında yüz alınmaz: açıklama çıkar, düğme yok', async () => {
    const state = emptyCamera()
    state.staff.others = [person('e1', 'Hasan Personel')]
    await openSettings(state, { kind: 'http' })
    const staff = await screen.findByTestId('camera-staff')
    expect(await within(staff).findByText(/ana bilgisayarındaki pencereden alınır/)).toBeInTheDocument()
    expect(within(staff).queryByTestId('camera-staff-take')).toBeNull()
  })

  it('imha raporu: aralıktaki silmeler nedenine göre, elde kalanlar ve geçerli kurallar görünür', async () => {
    const state = emptyCamera()
    state.report = {
      ...state.report,
      faces: { checkout: 4, retention: 1, manual: 2 },
      staff: { removed: 1, left: 0 },
      crops: 9,
      held: { guestFaces: 3, waitingForDeletion: 1, staffFaces: 2, alarmCrops: 5 },
      policy: { faceRetentionDays: 7, alertRetentionDays: 3 }
    }
    const { transport } = await openSettings(state)
    const rows = await screen.findByTestId('camera-report-rows')
    expect(within(rows).getByTestId('camera-report-checkout')).toHaveTextContent(
      'Çıkışta silinen misafir yüzü4'
    )
    expect(within(rows).getByTestId('camera-report-crops')).toHaveTextContent('9')
    expect(within(rows).getByTestId('camera-report-total')).toHaveTextContent('17')
    expect(screen.getByTestId('camera-report-held')).toHaveTextContent('Silinmeyi bekleyen misafir yüzü1')
    expect(screen.getByTestId('camera-report')).toHaveTextContent('çıkıştan 7 gün sonra silinir')
    const input = transport.callsTo('camera.retentionReport').at(-1) as { from: string; to: string }
    expect(input.from <= input.to).toBe(true)
    expect(screen.getByTestId('camera-report-print')).toBeEnabled()
  })

  it('yetkisiz kullanıcı (yalnız izleme) personel listesini göremez', async () => {
    act(() => setViewAs('housekeeping'))
    await openSettings()
    expect(screen.queryByTestId('camera-staff')).toBeNull()
  })
})
