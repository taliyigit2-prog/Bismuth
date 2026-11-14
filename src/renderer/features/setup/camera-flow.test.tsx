// The camera setup flow (Faz 20 P20g, K-59): the computer and its profile, the network search, the Hikvision address built
// from the form, the one-picture test (success and every failure), and the save that seals the address and switches the
// camera on. Over the camera stand-in transport; addresses and passwords are invented.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { cameraTransport, emptyCamera } from '@/test/camera-fake'
import { renderWithProviders } from '@/test/render'
import { CameraFlow } from './camera-flow'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  vi.clearAllMocks()
})

const S = 'rtsp:' + '//'

async function open(
  patch: (s: ReturnType<typeof emptyCamera>) => void = () => undefined,
  opts: Parameters<typeof cameraTransport>[1] = {}
) {
  const state = emptyCamera()
  patch(state)
  const transport = cameraTransport(state, opts)
  const onSaved = vi.fn()
  await renderWithProviders(<CameraFlow onSaved={onSaved} />, { transport })
  await screen.findByTestId('setup-camera-flow')
  return { transport, onSaved, user: userEvent.setup() }
}

const type = async (user: ReturnType<typeof userEvent.setup>, id: string, text: string) => {
  const input = screen.getByTestId(id)
  await user.clear(input)
  if (text) await user.type(input, text)
}

describe('kamera kurulum akışı', () => {
  it('bilgisayar özetini ve önerilen profili gösterir; profili uygulayınca profil ayarlarını yazar', async () => {
    const { transport, user } = await open((s) => {
      s.hardware = { ...s.hardware, cores: 4, ramGb: 3.9, recommended: 'light' }
    })
    expect(await screen.findByTestId('setup-camera-computer')).toHaveTextContent(
      'Test CPU, 4 çekirdek, 3.9 GB bellek, Windows'
    )
    // The suggested profile is ticked for the person; "Önerilen" marks it.
    expect(screen.getByTestId('setup-camera-recommended-light')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Hafif/ })).toBeChecked()
    await user.click(screen.getByTestId('setup-camera-apply-profile'))
    await screen.findByTestId('setup-camera-profile-applied')
    expect(transport.callsTo('settings.set')).toEqual([
      {
        'camera.profile': 'light',
        'camera.processEveryN': 5,
        'camera.streamMaxWidth': 640,
        'camera.idleFaceScanEvery': 6
      }
    ])
  })

  it('profil elle değiştirilebilir', async () => {
    const { transport, user } = await open()
    await screen.findByTestId('setup-camera-computer')
    await user.click(screen.getByRole('radio', { name: /Yüksek/ }))
    await user.click(screen.getByTestId('setup-camera-apply-profile'))
    await waitFor(() => expect(transport.callsTo('settings.set')).toHaveLength(1))
    expect(transport.callsTo('settings.set')[0]).toMatchObject({
      'camera.profile': 'high',
      'camera.processEveryN': 2
    })
  })

  it('bilgisayar okunamazsa mesaj gösterir ve profil elle seçilebilir kalır', async () => {
    await open(undefined, { canEdit: false })
    expect(await screen.findByTestId('setup-camera-computer-failed')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Standart/ })).toBeChecked()
  })

  it('ağı tarar, bulunanları listeler ve "Bunu kullan" IP alanını doldurur', async () => {
    const { transport, user } = await open((s) => {
      s.discovery = {
        problem: null,
        devices: [
          {
            ip: '192.168.1.64',
            protocols: ['onvif', 'sadp'],
            model: 'DS-2CD0000X-I',
            serial: 'SN1',
            mac: '',
            activated: true
          },
          { ip: '192.168.1.70', protocols: ['sadp'], model: '', serial: '', mac: '', activated: false }
        ]
      }
    })
    await user.click(screen.getByTestId('setup-camera-scan'))
    const row = await screen.findByTestId('setup-camera-device-192.168.1.64')
    expect(within(row).getByText('DS-2CD0000X-I')).toBeInTheDocument()
    expect(within(row).getByText('ONVIF')).toBeInTheDocument()
    expect(within(row).getByText('SADP')).toBeInTheDocument()
    expect(screen.getByText('2 kamera bulundu')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('setup-camera-device-192.168.1.70')).getByText('Etkinleştirilmemiş')
    ).toBeInTheDocument()
    expect(screen.getByTestId('setup-camera-scan')).toHaveTextContent('Yeniden tara')
    await user.click(screen.getByTestId('setup-camera-use-192.168.1.64'))
    expect(screen.getByTestId('setup-camera-ip')).toHaveValue('192.168.1.64')
    expect(transport.callsTo('camera.discover')).toHaveLength(1)
  })

  it('kamera bulunamazsa ve ağ yoksa ne yapılacağını söyler', async () => {
    const { user } = await open()
    await user.click(screen.getByTestId('setup-camera-scan'))
    expect(await screen.findByTestId('setup-camera-none')).toHaveTextContent('Kamera bulunamadı')
  })

  it('özel ağ adresi yoksa ağ sorunu söylenir', async () => {
    const { user } = await open((s) => {
      s.discovery = { devices: [], problem: 'network' }
    })
    await user.click(screen.getByTestId('setup-camera-scan'))
    expect(await screen.findByText(/yerel ağa bağlı görünmüyor/)).toBeInTheDocument()
  })

  it('geçersiz formda deneme gitmez, hata alanın altında görünür', async () => {
    const { transport, user } = await open()
    await user.click(screen.getByTestId('setup-camera-test'))
    expect(await screen.findByTestId('setup-camera-ip-error')).toHaveTextContent('Geçerli bir IP adresi')
    expect(transport.callsTo('camera.probe')).toEqual([])
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await type(user, 'setup-camera-user', '')
    expect(await screen.findByTestId('setup-camera-user-error')).toBeInTheDocument()
    await type(user, 'setup-camera-user', 'admin')
    await type(user, 'setup-camera-channels', '40')
    expect(await screen.findByTestId('setup-camera-channels-error')).toBeInTheDocument()
    expect(transport.callsTo('camera.probe')).toEqual([])
  })

  it('formdan Hikvision adresi kurulur (özel karakterler kodlanır) ve ekranda şifre maskelenir', async () => {
    const { transport, user } = await open()
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await type(user, 'setup-camera-user', 'admin')
    await user.type(screen.getByTestId('setup-camera-password'), 'p@ss:w/rd')
    await user.click(screen.getByTestId('setup-camera-test'))
    await screen.findByTestId('setup-camera-test-ok')
    expect(transport.callsTo('camera.probe')).toEqual([
      { source: S + 'admin:p%40ss%3Aw%2Frd@192.168.1.64:554/Streaming/Channels/101' }
    ])
    const shown = screen.getByTestId('setup-camera-address').textContent ?? ''
    expect(shown).toContain('***@192.168.1.64:554/Streaming/Channels/101')
    expect(shown).not.toContain('p@ss')
    expect(shown).not.toContain('p%40ss')
  })

  it('başarılı denemede önizleme görüntüsü ve boyut gösterilir', async () => {
    const { user } = await open()
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await user.click(screen.getByTestId('setup-camera-test'))
    expect(await screen.findByTestId('setup-camera-test-ok')).toHaveTextContent('1280×720')
    expect(screen.getByTestId('setup-camera-preview')).toHaveAttribute('src', 'data:image/jpeg;base64,/9j/')
    expect(screen.getByTestId('setup-camera-preview')).toHaveAccessibleName(
      'Kameradan alınan deneme görüntüsü'
    )
  })

  it.each([
    ['timeout', 'Kamera zamanında yanıt vermedi'],
    ['unreachable', 'Bu adreste kamera bulunamadı'],
    ['auth', 'Kullanıcı adı ya da şifre yanlış'],
    ['path', 'Kamera bu kanalı tanımıyor'],
    ['noFrame', 'görüntü alınamadı'],
    ['badAddress', 'otelin kendi ağındaki'],
    ['unavailable', 'Kamera bölümü bu bilgisayarda çalışmıyor'],
    ['noAddon', 'Kamera eki kurulu değil']
  ] as const)(
    'deneme "%s" nedeniyle başarısızsa anlaşılır mesaj verir ve görüntü göstermez',
    async (reason, text) => {
      const { user } = await open((s) => {
        s.probe = { ok: false, reason, image: null, width: 0, height: 0 }
      })
      await type(user, 'setup-camera-ip', '192.168.1.64')
      await user.click(screen.getByTestId('setup-camera-test'))
      expect(await screen.findByTestId('setup-camera-test-error')).toHaveTextContent(text)
      expect(screen.queryByTestId('setup-camera-preview')).toBeNull()
    }
  )

  it('kamera eki yoksa akışın başında nereden indirilip nereye açılacağı yazar; ek varsa uyarı yok', async () => {
    await open((s) => {
      s.status.addonInstalled = false
    })
    expect(await screen.findByTestId('camera-addon-missing')).toHaveTextContent(
      /Bismuth-Kamera-Windows\.zip.*camera-addon klasörünü/
    )
  })

  it('kamera eki kuruluysa uyarı çıkmaz', async () => {
    await open()
    await screen.findByTestId('setup-camera-computer')
    expect(screen.queryByTestId('camera-addon-missing')).toBeNull()
  })

  it('adres değişince eski deneme sonucu kalkar', async () => {
    const { user } = await open()
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await user.click(screen.getByTestId('setup-camera-test'))
    await screen.findByTestId('setup-camera-test-ok')
    await type(user, 'setup-camera-user', 'baska')
    expect(screen.queryByTestId('setup-camera-test-ok')).toBeNull()
  })

  it('Enter bağlantıyı dener', async () => {
    const { transport, user } = await open()
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await user.type(screen.getByTestId('setup-camera-user'), '{Enter}')
    await screen.findByTestId('setup-camera-test-ok')
    expect(transport.callsTo('camera.probe')).toHaveLength(1)
  })

  it('birden çok kanalda kanal seçimi çıkar; tek kanalda çıkmaz', async () => {
    const { user } = await open()
    expect(screen.queryByTestId('setup-camera-channel')).toBeNull()
    await type(user, 'setup-camera-channels', '4')
    expect(await screen.findByTestId('setup-camera-channel')).toBeInTheDocument()
  })

  it('kaydet: adres mühürlenmek üzere gönderilir, kamera açılır, profil yazılır, şifre ekrandan silinir', async () => {
    const { transport, onSaved, user } = await open()
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await user.type(screen.getByTestId('setup-camera-password'), 'gizli')
    await user.click(screen.getByTestId('setup-camera-save'))
    await screen.findByTestId('setup-camera-saved')
    expect(transport.callsTo('camera.setSecrets')).toEqual([
      { source: S + 'admin:gizli@192.168.1.64:554/Streaming/Channels/101' }
    ])
    // The address is a secret, never a setting: the settings call carries the profile and the switch only.
    expect(transport.callsTo('settings.set')).toEqual([
      {
        'camera.profile': 'standard',
        'camera.processEveryN': 3,
        'camera.streamMaxWidth': 960,
        'camera.idleFaceScanEvery': 3,
        'camera.enabled': true
      }
    ])
    expect(JSON.stringify(transport.callsTo('settings.set'))).not.toContain('gizli')
    expect(screen.getByTestId('setup-camera-password')).toHaveValue('')
    expect(screen.getByTestId('setup-camera-save')).toBeDisabled()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('geçersiz formda kaydetme gitmez', async () => {
    const { transport, user } = await open()
    await user.click(screen.getByTestId('setup-camera-save'))
    expect(await screen.findByTestId('setup-camera-ip-error')).toBeInTheDocument()
    expect(transport.callsTo('camera.setSecrets')).toEqual([])
    expect(transport.callsTo('settings.set')).toEqual([])
  })

  it('kayıt reddedilirse hata gösterilir ve kamera açılmaz', async () => {
    const { transport, user } = await open(undefined, { canEdit: true })
    const original = transport.call.bind(transport)
    transport.call = ((name: string, input: unknown) =>
      name === 'camera.setSecrets'
        ? Promise.reject(Object.assign(new Error('x'), { messageKey: 'errors.cameraSourceInvalid' }))
        : original(name as never, input as never)) as typeof transport.call
    await type(user, 'setup-camera-ip', '192.168.1.64')
    await user.click(screen.getByTestId('setup-camera-save'))
    expect(await screen.findByTestId('setup-camera-save-error')).toBeInTheDocument()
    expect(transport.callsTo('settings.set')).toEqual([])
    expect(screen.queryByTestId('setup-camera-saved')).toBeNull()
    await act(async () => undefined)
  })

  it('seçilen profil tablodaki değerlerle yazılır (ayardaki tablo değişince değerler değişir)', async () => {
    const table = JSON.parse(SETTINGS_DEFAULTS['camera.profiles'])
    table.profiles.standard.processEveryN = 7
    const state = emptyCamera()
    const settings = { 'camera.profiles': JSON.stringify(table) }
    const transport = cameraTransport(state, { settings })
    await renderWithProviders(<CameraFlow />, { transport, settings })
    const user = userEvent.setup()
    await screen.findByTestId('setup-camera-computer')
    await user.click(screen.getByTestId('setup-camera-apply-profile'))
    await waitFor(() => expect(transport.callsTo('settings.set')).toHaveLength(1))
    expect(transport.callsTo('settings.set')[0]).toMatchObject({ 'camera.processEveryN': 7 })
  })
})
