import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { setViewAs } from '@/lib/view-as'
import { cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { CameraSection } from './camera-section'
import { numberValid, parseNumber } from './camera-numbers'

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

async function open(opts: Parameters<typeof cameraTransport>[1] = {}, patch = {}) {
  const transport = cameraTransport(emptyCamera(), opts)
  const saved: unknown[] = []
  const values = { ...SETTINGS_DEFAULTS, ...patch }
  await renderWithProviders(<CameraSection values={values} onSave={(p) => saved.push(p)} />, { transport })
  await screen.findByTestId('camera-settings')
  // The state card's flags (which secrets are saved) arrive with the status.
  await waitFor(() => expect(screen.getByTestId('camera-source-state')).toHaveTextContent('Kayıtlı'))
  return { transport, saved, user: userEvent.setup() }
}

describe('Ayarlar → Kamera', () => {
  it('anahtarlar ve metin alanları ayarı kaydeder', async () => {
    const { saved, user } = await open()
    await user.click(screen.getByRole('switch', { name: 'Kamera sistemini aç' }))
    await user.click(screen.getByRole('switch', { name: "Alarmı Telegram'a da gönder" }))
    await user.click(screen.getByRole('switch', { name: 'Alarm fotoğrafını da gönder' }))
    await user.type(screen.getByTestId('camera-location'), 'Merdiven')
    await user.click(
      within(screen.getByTestId('camera-location').closest('form')!).getByRole('button', { name: 'Kaydet' })
    )
    expect(saved).toEqual([
      { 'camera.enabled': true },
      { 'camera.telegram.enabled': true },
      { 'camera.telegram.photo': false },
      { 'camera.location': 'Merdiven' }
    ])
  })

  it('sayı alanı sınır dışı değeri kaydetmez ve nedenini söyler; geçerli değer virgülle de olur', async () => {
    const { saved, user } = await open()
    const field = screen.getByTestId('camera-cooldown')
    const form = field.closest('form')!
    await user.clear(field)
    await user.type(field, '2')
    expect(within(form).getByRole('alert')).toHaveTextContent('5 ile 3600 arasında bir sayı girin.')
    expect(within(form).getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    await user.clear(field)
    await user.type(field, '90')
    await user.click(within(form).getByRole('button', { name: 'Kaydet' }))
    expect(saved).toEqual([{ 'camera.alarmCooldownSeconds': 90 }])
  })

  it('tanıma eşikleri "Tanıma ayarları" altında; kesirli sayı virgülle yazılabilir', async () => {
    const { saved, user } = await open()
    expect(screen.queryByTestId('camera-advanced')).toBeNull()
    await user.click(screen.getByTestId('camera-advanced-toggle'))
    const field = await screen.findByTestId('camera-similarity')
    await user.clear(field)
    await user.type(field, '0,5')
    await user.click(within(field.closest('form')!).getByRole('button', { name: 'Kaydet' }))
    expect(saved).toEqual([{ 'camera.similarityThreshold': 0.5 }])
  })

  it('kamera adresi yalnız yazılır: "Kayıtlı" der, değeri hiçbir yerde göstermez; kaydedince gönderir ve kutuyu boşaltır', async () => {
    const { transport, user } = await open()
    expect(screen.getByTestId('camera-source-state')).toHaveTextContent('Kayıtlı')
    const input = screen.getByTestId('camera-source') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.type).toBe('password')
    const address = 'rtsp:' + '//kamera:gizli@192.168.1.64:554/Streaming/Channels/101'
    await user.type(input, address)
    await user.click(within(input.closest('form')!).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(transport.callsTo('camera.setSecrets')).toEqual([{ source: address }]))
    await waitFor(() => expect(input.value).toBe(''))
    expect(document.body.textContent).not.toContain('gizli@')
  })

  it('"Kaldır" kayıtlı adresi siler (null gider)', async () => {
    const { transport, user } = await open()
    await user.click(
      within(screen.getByTestId('camera-source').closest('form')!).getByRole('button', { name: 'Kaldır' })
    )
    await waitFor(() => expect(transport.callsTo('camera.setSecrets')).toEqual([{ source: null }]))
    await waitFor(() => expect(screen.getByTestId('camera-source-state')).toHaveTextContent('Girilmedi'))
  })

  it('Telegram bilgileri ve sohbet numaraları ayrı ayrı gönderilir; belirteç gizli alandır', async () => {
    const { transport, user } = await open()
    const token = screen.getByTestId('camera-telegram-token') as HTMLInputElement
    expect(token.type).toBe('password')
    await user.type(token, '123456:ABCdef')
    await user.click(within(token.closest('form')!).getByRole('button', { name: 'Kaydet' }))
    const chats = screen.getByTestId('camera-telegram-chats')
    await user.type(chats, '-1001234567890, 42')
    await user.click(within(chats.closest('form')!).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(transport.callsTo('camera.setSecrets')).toEqual([
        { telegramToken: '123456:ABCdef' },
        { telegramChatIds: '-1001234567890, 42' }
      ])
    )
  })

  it.each([
    [{ ok: true, reason: null }, 'success', 'Deneme mesajı gönderildi'],
    [{ ok: false, reason: 'off' as const }, 'error', /Telegram kapalı/],
    [{ ok: false, reason: 'invalidCredentials' as const }, 'error', /kabul edilmedi/],
    [{ ok: false, reason: 'timeout' as const }, 'error', /yanıt vermedi/],
    [{ ok: false, reason: null }, 'error', /Mesaj gönderilemedi/]
  ])('"Telegram\'ı dene" sonucu %o söylenir', async (result, kind, text) => {
    const { transport, user } = await open()
    transport.state.telegramTest = result
    await user.click(screen.getByTestId('camera-telegram-test'))
    await waitFor(() =>
      expect(toast[kind as 'success' | 'error']).toHaveBeenCalledWith(expect.stringMatching(text))
    )
    expect(transport.callsTo('camera.testTelegram')).toHaveLength(1)
  })

  it('Telegram açık ama çevrimiçi veri kapalıysa bunu söyler', async () => {
    const state = emptyCamera()
    state.status.telegram = { enabled: true, networkEnabled: false }
    const transport = cameraTransport(state)
    await renderWithProviders(
      <CameraSection values={{ ...SETTINGS_DEFAULTS, 'camera.telegram.enabled': true }} onSave={() => {}} />,
      { transport }
    )
    expect(await screen.findByTestId('camera-network-off')).toHaveTextContent('Çevrimiçi veri kapalı')
  })

  it('HTTP istemcisinde (telefon, Mac) sırlar ve Telegram denemesi kapalı, ayar anahtarları açık kalır', async () => {
    await open({ kind: 'http' })
    expect(screen.getByTestId('camera-source')).toBeDisabled()
    expect(screen.getByTestId('camera-telegram-token')).toBeDisabled()
    expect(screen.queryByTestId('camera-telegram-test')).toBeNull()
    expect(screen.getByText(/yalnızca otelin ana bilgisayarında değiştirilir/)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Kamera sistemini aç' })).toBeEnabled()
  })

  it('"Yeniden tara" kurulum akışını diyalogda açar ve Kapat ile kapanır; telefonda ve yalnız görende düğme yoktur (P20g)', async () => {
    const { transport, user } = await open()
    await user.click(screen.getByTestId('camera-rescan'))
    const dialog = await screen.findByRole('dialog', { name: 'Kamera kurulumu' })
    expect(await within(dialog).findByTestId('setup-camera-flow')).toBeInTheDocument()
    await user.click(within(dialog).getByTestId('setup-camera-scan'))
    await waitFor(() => expect(transport.callsTo('camera.discover')).toHaveLength(1))
    await user.click(within(dialog).getByTestId('camera-rescan-close'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"Yeniden tara" HTTP istemcisinde (telefon) görünmez (P20g)', async () => {
    await open({ kind: 'http' })
    expect(screen.queryByTestId('camera-rescan')).toBeNull()
  })

  it('"Yeniden tara" yalnız görüntüleyen rolde görünmez (P20g)', async () => {
    act(() => setViewAs('reception'))
    await open()
    expect(screen.queryByTestId('camera-rescan')).toBeNull()
  })

  it('Resepsiyon (yalnız görür): her alan kapalı, kaydet düğmesi yok', async () => {
    act(() => setViewAs('reception'))
    await open()
    expect(screen.getByRole('switch', { name: 'Kamera sistemini aç' })).toBeDisabled()
    expect(screen.getByTestId('camera-cooldown')).toBeDisabled()
    expect(screen.getByTestId('camera-source')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull()
    expect(screen.queryByTestId('camera-telegram-test')).toBeNull()
  })
})

describe('sayı kuralları', () => {
  it('virgül ve nokta ondalık sayılır; harf ve boş değer geçersizdir', () => {
    expect(parseNumber('0,45')).toBe(0.45)
    expect(parseNumber(' 12 ')).toBe(12)
    expect(parseNumber('')).toBeNaN()
    expect(parseNumber('1e3')).toBeNaN()
    expect(parseNumber('abc')).toBeNaN()
  })

  it('tam sayı alanı kesir kabul etmez; sınırlar dahildir', () => {
    const days = { min: 0, max: 365, integer: true }
    expect(numberValid('0', days)).toBe(true)
    expect(numberValid('365', days)).toBe(true)
    expect(numberValid('366', days)).toBe(false)
    expect(numberValid('1,5', days)).toBe(false)
    expect(numberValid('0,36', { min: 0.1, max: 0.95, integer: false })).toBe(true)
  })
})
