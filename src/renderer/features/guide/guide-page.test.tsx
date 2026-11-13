import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setViewAs } from '@/lib/view-as'
import { renderApp } from '@/test/render-app'
import { resetTour } from './tour-store'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  act(() => {
    setViewAs(null)
    resetTour()
  })
})

describe('Kılavuz ekranı', () => {
  it('ana sayfa bütün bölümleri kartlarla gösterir; sahip için hepsi açık', async () => {
    await renderApp({ hash: '#/guide' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Kılavuz' })).toBeInTheDocument()
    const home = await screen.findByTestId('guide-home')
    expect(within(home).getAllByRole('link')).toHaveLength(21)
    expect(within(home).getByText('Rezervasyon nasıl yazılır')).toBeInTheDocument()
    expect(screen.getByTestId('guide-audience')).toHaveTextContent('Sahip ve müdür')
  })

  it('adresteki bölümü açar; önceki/sonraki bölüm ve yazdırma kopyası var', async () => {
    await renderApp({ hash: '#/guide?s=payments&a=cash-drawer' })
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ödeme alınca ne yapılır' })
    ).toBeInTheDocument()
    expect(document.getElementById('guide-cash-drawer')).not.toBeNull()
    expect(screen.getByTestId('guide-previous')).toHaveTextContent('Rezervasyon nasıl yazılır')
    expect(screen.getByTestId('guide-next')).toHaveTextContent('Defter ve giderler')
    expect(screen.getByTestId('guide-print')).toHaveTextContent('Ödeme alınca ne yapılır')
    expect(screen.getByTestId('guide-print-button')).toBeInTheDocument()
    expect(screen.getByTestId('guide-section-payments')).toHaveAttribute('aria-current', 'page')
  })

  it('arama sonuçları başlığına gider; sonuç yoksa ne yapılacağını söyler', async () => {
    await renderApp({ hash: '#/guide' })
    const user = userEvent.setup()
    const box = await screen.findByTestId('guide-search')
    await user.type(box, 'kapora')
    const results = await screen.findAllByTestId('guide-result')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.getAttribute('href')?.includes('s=payments&a=deposit'))).toBe(true)
    await user.clear(box)
    await user.type(box, 'zzzqqq')
    expect(await screen.findByText('Sonuç bulunamadı')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Aramayı temizle' })[0]!)
    expect(await screen.findByTestId('guide-home')).toBeInTheDocument()
  })

  it('rol süzgeci kullanıcının rolüyle açılır: resepsiyon personel bölümünü listede görmez', async () => {
    await renderApp({ signedIn: 'u-deniz', hash: '#/guide' })
    const home = await screen.findByTestId('guide-home')
    expect(screen.getByTestId('guide-audience')).toHaveTextContent('Resepsiyon')
    expect(within(home).queryByText('Personel ve maaş')).not.toBeInTheDocument()
    expect(within(home).getByText('Otelde kalanlar ve KBS')).toBeInTheDocument()
  })

  it('olmayan bölüm adresi "bulunamadı" der ve bölümlere döndürür', async () => {
    await renderApp({ hash: '#/guide?s=olmayan' })
    expect(await screen.findByText('Bu bölüm bulunamadı')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tüm bölümler' })).toBeInTheDocument()
  })

  it('üst çubuktaki "?" açık ekranın bölümüne götürür; kılavuzun kendisinde görünmez', async () => {
    await renderApp({ hash: '#/ledger' })
    const help = await screen.findByTestId('guide-help')
    expect(help.getAttribute('href')).toContain('/guide?s=ledger')
    expect(help).toHaveAccessibleName('Bu ekranın kılavuzu')
    await userEvent.setup().click(help)
    expect(await screen.findByRole('heading', { level: 2, name: 'Defter ve giderler' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('guide-help')).not.toBeInTheDocument())
  })

  it('Ayarlar → Kılavuz bölümü herkese açık: kılavuzu açar, turu başlatır', async () => {
    await renderApp({ signedIn: 'u-deniz', hash: '#/settings?tab=guide' })
    const card = await screen.findByTestId('guide-settings')
    expect(within(card).getByTestId('guide-settings-open').getAttribute('href')).toContain('/guide')
    // Reception may not change the hotel's settings: the switch is shown, disabled.
    expect(within(card).getByRole('switch')).toBeDisabled()
    await userEvent.setup().click(within(card).getByTestId('guide-settings-tour'))
    expect(await screen.findByTestId('guide-tour')).toBeInTheDocument()
  })
})
