import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type SettingsValues } from '@shared/contract'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { sampleOverview, sampleWeather, withExternal, type ExternalData } from '@/test/fake-external'
import { setViewAs } from '@/lib/view-as'
import { ApiError, type Transport } from '@/lib/transport'
import { CurrencyPage } from './currency-page'
import { convertMinor, parseRateMicro, rateTable, roundMinor } from './fx-model'

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

function render(data: Partial<ExternalData> = {}, settings: Partial<SettingsValues> = {}) {
  const values = { ...SETTINGS_DEFAULTS, ...settings }
  const transport = withExternal(data, fakeTransport(values))
  return renderWithProviders(<CurrencyPage />, { settings: values, transport })
}

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

describe('döviz hesapları', () => {
  it('çapraz kur ana birim üzerinden tam sayı kuruşla; otel kuru açıksa o kullanılır', () => {
    const o = sampleOverview()
    const market = rateTable(o, false)
    // 100 EUR × 55,277 = 5.527,70 TL
    expect(convertMinor(10_000, 'EUR', 'TRY', market)).toBe(552_770)
    expect(convertMinor(552_770, 'TRY', 'EUR', market)).toBe(10_000)
    expect(convertMinor(250_000, 'TRY', 'USD', market)).toBe(5_089)
    expect(convertMinor(10_000, 'EUR', 'XXX', market)).toBeNull()
    expect(convertMinor(10_000, 'EUR', 'TRY', rateTable(o, true))).toBe(500_000)
  })

  it('yuvarlama yalnız söylenen tutarda: tam sayıya ve 10’un katına, yarım yukarı', () => {
    expect(roundMinor(5_089, 'USD', 'minor')).toBe(5_089)
    expect(roundMinor(5_089, 'USD', 'unit')).toBe(5_100)
    expect(roundMinor(5_049, 'USD', 'unit')).toBe(5_000)
    expect(roundMinor(5_089, 'USD', 'ten')).toBe(5_000)
    expect(roundMinor(425_026, 'RUB', 'ten')).toBe(425_000)
    expect(roundMinor(-150, 'EUR', 'unit')).toBe(-200)
  })

  it('elle yazılan kur ondalıklı metinden okunur', () => {
    expect(parseRateMicro('49,25', 'tr')).toBe(49_250_000)
    expect(parseRateMicro('49.25', 'en')).toBe(49_250_000)
    expect(parseRateMicro('0', 'tr')).toBeNull()
    expect(parseRateMicro('abc', 'tr')).toBeNull()
  })
})

describe('Döviz ekranı', { timeout: 20_000 }, () => {
  it('veri gelene kadar yükleniyor, gelmezse yeniden dene düğmesi gösterir', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    await renderWithProviders(<CurrencyPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('kurlar okunamazsa yeniden dene düğmesi çıkar', async () => {
    const base = fakeTransport()
    const failing: Transport = {
      kind: 'ipc',
      call: (name, input) =>
        name === 'fx.overview'
          ? Promise.reject(new ApiError('INTERNAL', 500, 'errors.internal'))
          : base.call(name, input)
    }
    await renderWithProviders(<CurrencyPage />, { transport: failing })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('hiç kur yoksa boş durumu anlatır', async () => {
    const empty = sampleOverview()
    empty.rates = empty.rates.map((r) => ({ ...r, marketMicro: null, hotelMicro: null, marketAt: null }))
    await render({ overview: empty })
    expect(await screen.findByText('Henüz kur yok')).toBeInTheDocument()
  })

  it('her birim için kur kartı, kaynağı, saati, TCMB satırı ve 7 günlük geçmiş görünür', async () => {
    await render()
    const eur = await screen.findByTestId('rate-EUR')
    expect(within(eur).getByText('Otel kuru')).toBeInTheDocument()
    expect(within(eur).getByText(/^Piyasa: /)).toBeInTheDocument()
    const usd = screen.getByTestId('rate-USD')
    expect(within(usd).getByText('Piyasa orta kuru')).toBeInTheDocument()
    expect(within(usd).getByText(/^Truncgil · /)).toBeInTheDocument()
    expect(within(usd).getByText(/Düne göre -%0,15/)).toBeInTheDocument()
    expect(within(usd).getByTestId('tcmb-line')).toHaveTextContent('TCMB: 48,9910')
    expect(within(screen.getByTestId('fx-history')).getAllByRole('row')).toHaveLength(3)
    expect(within(screen.getByTestId('rate-GBP')).getByTitle(/sterlin/i)).toHaveClass('line-clamp-1')
  })

  it('kur geçmişinde "Bugün" otelin gününe göredir: gece 01:30 İstanbul’da dünkü satır bugün sayılmaz (P14fix #14)', async () => {
    const o = sampleOverview('2026-10-04T22:30:00.000Z')
    // 22:30 UTC = 01:30 on the 5th in Istanbul: the server's newest daily close is the 5th.
    const shifted = {
      ...o,
      today: '2026-10-05',
      rates: o.rates.map((r) => ({
        ...r,
        history: [
          { date: '2026-10-04', micro: r.previousMicro ?? 1 },
          { date: '2026-10-05', micro: r.marketMicro ?? 1 }
        ]
      }))
    }
    await render({ overview: shifted })
    const rows = within(await screen.findByTestId('fx-history')).getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/^Bugün/)
    expect(rows[2]).not.toHaveTextContent(/^Bugün/)
  })

  it('6 saatten eski kur rozet alır; 48 saatten eskisi kırmızı', async () => {
    const o = sampleOverview('2026-10-04T09:00:00.000Z')
    o.rates[1] = { ...o.rates[1]!, marketAt: '2026-10-04T01:00:00.000Z' }
    o.rates[2] = { ...o.rates[2]!, marketAt: '2026-10-01T09:00:00.000Z' }
    await render({ overview: o })
    expect(within(await screen.findByTestId('rate-USD')).getByTestId('fx-age')).toHaveTextContent(
      '8 saat önceki kur'
    )
    expect(within(screen.getByTestId('rate-GBP')).getByTestId('fx-age')).toHaveClass('text-destructive')
    expect(within(screen.getByTestId('rate-RUB')).queryByTestId('fx-age')).not.toBeInTheDocument()
  })

  it('çevirici 2.500 TL ile açılır, yazarken hesaplar, yön değiştirir', async () => {
    const user = userEvent.setup()
    await render({}, { 'fx.quoteHotelRate': false, 'ui.showMinor': true })
    const result = await screen.findByTestId('fx-result')
    // 2.500 TL at 55,277 → 45,23 €
    expect(result).toHaveTextContent('€45,23')
    const amount = screen.getByLabelText('Tutar')
    await user.clear(amount)
    await user.type(amount, '5000')
    expect(result).toHaveTextContent('€90,45')
    await user.click(screen.getByRole('button', { name: 'Yönü değiştir' }))
    expect(screen.getByLabelText('Tutar')).toHaveValue('90,45')
  })

  it('yuvarlama ayarı çeviricinin sonucuna uygulanır', async () => {
    await render({}, { 'fx.quoteHotelRate': false, 'ui.showMinor': true, 'fx.rounding': 'unit' })
    expect(await screen.findByTestId('fx-result')).toHaveTextContent(/€45(?!,)/)
    expect(screen.getByRole('combobox', { name: 'Yuvarlama' })).toHaveTextContent('Tam sayıya')
  })

  it('internet kapalı ayarında son bilinen kurla çevrilir, güncelle pasifleşir', async () => {
    await render({}, { 'network.enabled': false, 'fx.quoteHotelRate': false, 'ui.showMinor': true })
    expect(await screen.findByTestId('fx-offline')).toHaveTextContent('son bilinen kurlar')
    expect(screen.getByRole('button', { name: 'Şimdi güncelle' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'İnternetten güncelle' })).not.toBeChecked()
    expect(screen.getByTestId('fx-result')).toHaveTextContent('€45,23')
  })

  it('internetten güncelleme anahtarı ayarı yazar; şimdi güncelle yenileme ister', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByRole('button', { name: 'Şimdi güncelle' }))
    await user.click(screen.getByRole('switch', { name: 'İnternetten güncelle' }))
    const calls = (transport as ReturnType<typeof withExternal>).calls.map((c) => c.name)
    expect(calls).toContain('fx.refresh')
    expect(calls).toContain('settings.set')
  })

  it('otel kuru diyaloğu: geçersiz kur kaydedilmez, geçerlisi servise gider', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByRole('button', { name: 'Otel kuru gir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Otel kuru' })
    await user.type(within(dialog).getByLabelText('1 EUR kaç TRY'), 'abc{Enter}')
    expect(within(dialog).getByText('Kuru sayı olarak yazın (örn. 49,25).')).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('1 EUR kaç TRY'))
    await user.type(within(dialog).getByLabelText('1 EUR kaç TRY'), '51,5{Enter}')
    const calls = (transport as ReturnType<typeof withExternal>).calls
    expect(calls.find((c) => c.name === 'fx.setHotelRate')?.input).toEqual({
      currency: 'EUR',
      rateMicro: 51_500_000
    })
  })

  it('resepsiyon kuru görür ama otel kurunu değiştiremez, TCMB satırını kapatamaz', async () => {
    act(() => setViewAs('reception'))
    await render()
    expect(await screen.findByTestId('rate-EUR')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Otel kuru gir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'TCMB satırını gizle' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'İnternetten güncelle' })).toBeDisabled()
  })

  it('TCMB satırı ayarla gizlenir', async () => {
    await render({}, { 'fx.showTcmb': false })
    expect(await screen.findByTestId('rate-USD')).toBeInTheDocument()
    expect(screen.queryByTestId('tcmb-line')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TCMB satırını göster' })).toBeInTheDocument()
  })

  it('telefonda çevirici en üstte gelir; anahtar satırı 44 px', async () => {
    phone()
    await render()
    const converter = await screen.findByTestId('converter')
    const cards = screen.getByTestId('rate-cards')
    expect(converter.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'İnternetten güncelle' }).closest('label')).toHaveClass(
      'max-md:min-h-11'
    )
  })
})

describe('çevirici tutar denetimi', () => {
  it('eksi, fazla ondalıklı ve çok büyük tutar açıklamalı hata verir (H-26)', async () => {
    const user = userEvent.setup()
    await render()
    const converter = await screen.findByTestId('converter')
    const input = within(converter).getByLabelText('Tutar')
    for (const [text, message] of [
      ['-5', /sıfırdan küçük/],
      ['1.000,555', /sayı olmalı/],
      ['99999999999999999', /çok büyük/]
    ] as const) {
      await user.clear(input)
      await user.type(input, text)
      expect(await within(converter).findByText(message)).toBeInTheDocument()
    }
  })
})

describe('Hava ve Bayramlar sekmeleri', { timeout: 20_000 }, () => {
  it('Hava sekmesi: konum, şimdi, saatlik ve haftalık tahmin, kaynak atfı', async () => {
    const user = userEvent.setup()
    await render()
    await user.click(await screen.findByRole('tab', { name: 'Hava durumu' }))
    expect(await screen.findByTestId('weather-place')).toHaveTextContent('Kadıköy (İstanbul)')
    expect(screen.getByTestId('weather-now')).toHaveTextContent('18°')
    expect(screen.getByTestId('weather-now')).toHaveTextContent('Yağmur bekleniyor · 1,6 mm')
    expect(within(screen.getByTestId('weather-days')).getAllByRole('listitem')).toHaveLength(7)
    expect(within(screen.getByTestId('weather-hours')).getAllByRole('listitem')).toHaveLength(24)
    expect(screen.getByTestId('weather-attribution')).toHaveTextContent('Veri: MET Norway · Simgeler: Yr/NRK')
    expect(screen.getByRole('img', { name: 'Yoğun kar sağanağı, gök gürültülü' })).toBeInTheDocument()
  })

  it('Hava: tahmin yoksa boş durum; internet kapalıysa nedeni yazılır', async () => {
    const user = userEvent.setup()
    await render(
      { weather: { ...sampleWeather(), forecast: null, fetchedAt: null } },
      { 'network.enabled': false }
    )
    await user.click(await screen.findByRole('tab', { name: 'Hava durumu' }))
    expect(await screen.findByText('Henüz hava bilgisi yok')).toBeInTheDocument()
    expect(screen.getByText(/güncelleme kapalı olduğu için/)).toBeInTheDocument()
  })

  it('Bayramlar sekmesi son denetimin farklarını gösterir; yetkisi olmayana görünmez', async () => {
    const user = userEvent.setup()
    await render({
      lastChecks: [
        {
          year: 2027,
          source: 'google',
          skipped: false,
          checkedAt: '2026-10-04T09:00:00.000Z',
          diffs: [
            {
              groupKey: 'ramazan-bayrami:2027-03-09',
              title: { tr: 'Ramazan Bayramı 1. Gün', en: 'Eid al-Fitr, day 1', ru: 'Ураза-байрам, 1-й день' },
              before: ['2027-03-08', '2027-03-11'],
              after: ['2027-03-09', '2027-03-12'],
              outcome: 'moved',
              tentative: true
            }
          ]
        }
      ]
    })
    await user.click(await screen.findByRole('tab', { name: 'Bayramlar' }))
    const result = await screen.findByTestId('holiday-result-2027')
    expect(result).toHaveTextContent('Ramazan Bayramı')
    expect(result).toHaveTextContent('Tarih düzeltildi')
    expect(result).toHaveTextContent('Kesin değil')
    act(() => setViewAs('accountant'))
    expect(screen.queryByRole('tab', { name: 'Bayramlar' })).not.toBeInTheDocument()
  })
})
