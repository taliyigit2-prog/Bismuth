import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { sampleWeather, withExternal } from '@/test/fake-external'
import { WeatherCard } from './weather-card'

describe('Bugün hava kartı (G-113, S-19, S-90)', () => {
  it('şimdiki durum, en düşük/en yüksek, yağmur mm, rüzgâr, 7 günlük şerit ve atıf gösterilir; yüzde yok', async () => {
    await renderWithProviders(<WeatherCard />, { transport: withExternal() })
    const card = await screen.findByTestId('weather-card')
    expect(within(card).getByText('Hava durumu · Kadıköy (İstanbul)')).toBeInTheDocument()
    const now = within(card).getByTestId('weather-now')
    expect(now).toHaveTextContent('18°')
    expect(now).toHaveTextContent('Hafif sağanak')
    expect(now).toHaveTextContent('En düşük 12° · en yüksek 20°')
    expect(now).toHaveTextContent('Yağmur bekleniyor · 1,6 mm')
    expect(now).toHaveTextContent('Rüzgâr 15 km/sa')
    expect(within(card).getAllByRole('listitem')).toHaveLength(7)
    expect(within(card).getByRole('img', { name: 'Yağmur' })).toBeInTheDocument()
    expect(card).toHaveTextContent('Veri: MET Norway · Simgeler: Yr/NRK')
    expect(card.textContent).not.toMatch(/%/)
  })

  it('çevrimdışıyken son tahmin "X saat önce" rozetiyle kalır', async () => {
    const weather = { ...sampleWeather('2026-10-04T15:00:00.000Z'), fetchedAt: '2026-10-04T09:30:00.000Z' }
    await renderWithProviders(<WeatherCard />, { transport: withExternal({ weather }) })
    expect(await screen.findByText('5 saat önce')).toBeInTheDocument()
  })

  it('hiç tahmin yoksa ya da hava kapalıysa kart hiç görünmez', async () => {
    const none = { ...sampleWeather(), forecast: null }
    const { container } = await renderWithProviders(<WeatherCard />, {
      transport: withExternal({ weather: none })
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(container.querySelector('[data-testid="weather-card"]')).toBeNull()
    const off = { ...sampleWeather(), enabled: false }
    await renderWithProviders(<WeatherCard />, { transport: withExternal({ weather: off }) })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('weather-card')).not.toBeInTheDocument()
  })
})
