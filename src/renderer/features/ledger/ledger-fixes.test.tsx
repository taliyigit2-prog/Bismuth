// Early bug hunt fixes on the ledger screen (P7fix): the payment's "Doğrudan" channel kept (B25), the typed rate
// asked only when no rate is known (K-43), the owner's section never paid from the drawer (K-42), a closed day locked
// for those who may not write into it (B26), "everything up to today" shown as taken (B17), the cash filter with
// drawer expenses (B19) and the dictionary on closed days (B16).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { CashDrawerPanel } from '@/components/cash-drawer/cash-drawer-panel'
import { expense, income, ledgerTransport, sampleLedger, TODAY } from './ledger-fake'
import { LedgerPage } from './ledger-page'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const render = (transport = ledgerTransport()) => renderWithProviders(<LedgerPage />, { transport })

async function openPayment(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('add-payment'))
  const dialog = await screen.findByRole('dialog', { name: 'Ödeme ekle' })
  await user.click(await within(dialog).findByTestId('reservation-hit'))
  return dialog
}

describe('Defter: erken hata avı düzeltmeleri', { timeout: 30_000 }, () => {
  it('Booking rezervasyonuna "Doğrudan" seçilen ödeme doğrudan kanalla yazılır (B25)', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByLabelText('Kanal'))
    await user.click(await screen.findByRole('option', { name: 'Doğrudan' }))
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addPayment')).toHaveLength(1))
    expect(transport.callsTo('ledger.addPayment')[0]).toMatchObject({ channelId: 'ch-direct' })
  })

  it('kur biliniyorsa elle kur alanı yok; kur bilinmeyen para biriminde "1 EUR kaç TRY" sorulur (K-43)', async () => {
    const known = ledgerTransport()
    const user = userEvent.setup()
    const first = await render(known)
    await user.click(await screen.findByTestId('add-expense'))
    let dialog = await screen.findByRole('dialog', { name: 'Gider ekle' })
    await user.click(within(dialog).getByRole('combobox', { name: 'Para birimi' }))
    await user.click(await screen.findByRole('option', { name: /EUR/ }))
    await waitFor(() => expect(known.callsTo('ledger.knownRates').length).toBeGreaterThan(0))
    expect(within(dialog).queryByTestId('manual-rate')).not.toBeInTheDocument()
    first.unmount()

    const state = sampleLedger()
    state.missingRates = ['EUR']
    const offline = ledgerTransport(state)
    await render(offline)
    await user.click(await screen.findByTestId('add-expense'))
    dialog = await screen.findByRole('dialog', { name: 'Gider ekle' })
    await user.type(within(dialog).getByLabelText('Tutar'), '20')
    await user.type(within(dialog).getByTestId('expense-description'), 'Çiçek')
    await user.click(within(dialog).getByRole('combobox', { name: 'Para birimi' }))
    await user.click(await screen.findByRole('option', { name: /EUR/ }))
    const rate = await within(dialog).findByLabelText('Kur: 1 EUR kaç TRY')
    await user.type(rate, '38,5')
    await user.click(within(dialog).getByTestId('ledger-expense-save'))
    await waitFor(() => expect(offline.callsTo('ledger.addExpense')).toHaveLength(1))
    expect(offline.callsTo('ledger.addExpense')[0]).toMatchObject({
      currency: 'EUR',
      manualRateMicro: 38_500_000
    })
  })

  it('yönetici bölümü seçilince "kasadan ödendi" seçeneği görünmez ve gider kasadan yazılmaz (K-42)', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-expense'))
    const dialog = await screen.findByRole('dialog', { name: 'Gider ekle' })
    expect(within(dialog).getByTestId('expense-drawer')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Tutar'), '900')
    await user.type(within(dialog).getByTestId('expense-description'), 'Kira')
    await user.click(within(dialog).getByTestId('expense-section'))
    await user.click(await screen.findByRole('option', { name: 'Sahip giderleri' }))
    expect(within(dialog).queryByTestId('expense-drawer')).not.toBeInTheDocument()
    expect(within(dialog).getByTestId('expense-not-from-drawer')).toBeInTheDocument()
    await user.click(within(dialog).getByTestId('ledger-expense-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addExpense')).toHaveLength(1))
    expect(transport.callsTo('ledger.addExpense')[0]).toMatchObject({
      sectionId: 's-owner',
      paidFromDrawer: false
    })
  })

  it('kapalı günde kapalı güne yazma yetkisi olmayan rol gerekçe alanı değil kilit açıklaması görür (B26)', async () => {
    act(() => setViewAs('manager'))
    const state = sampleLedger()
    state.options = { ...state.options, closingEnabled: true }
    state.closed = [TODAY]
    const transport = ledgerTransport(state)
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-payment'))
    const dialog = await screen.findByRole('dialog', { name: 'Ödeme ekle' })
    expect(within(dialog).getByTestId('closed-day-locked')).toHaveTextContent(
      'Kapalı güne yazma yetkiniz yok'
    )
    expect(within(dialog).queryByTestId('closed-day-reason')).not.toBeInTheDocument()
    expect(within(dialog).getByTestId('ledger-payment-save')).toBeDisabled()
    expect(screen.getByTestId('day-note-locked')).toBeInTheDocument()
  })

  it('Sahip kapalı güne gerekçeyle yazar (B26)', async () => {
    const state = sampleLedger()
    state.options = { ...state.options, closingEnabled: true }
    state.closed = [TODAY]
    const transport = ledgerTransport(state)
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    await user.type(within(within(dialog).getByTestId('closed-day-reason')).getByRole('textbox'), 'geç gelen')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addPayment')).toHaveLength(1))
    expect(transport.callsTo('ledger.addPayment')[0]).toMatchObject({ dayClosedReason: 'geç gelen' })
  })

  it('"Bugüne kadar hepsi" ileri tarihli ödemeyi göstermez: gösterilen = alınan (B17)', async () => {
    const state = sampleLedger()
    state.income.push(income({ id: 'p-future', amountMinor: 700_000, date: '2026-10-06' as typeof TODAY }))
    const user = userEvent.setup()
    await renderWithProviders(<CashDrawerPanel />, { transport: ledgerTransport(state) })
    const panel = await screen.findByTestId('cash-drawer-panel')
    await user.click(within(panel).getByTestId('drawer-collect'))
    const dialog = await screen.findByRole('dialog', { name: 'Para teslim alınsın mı?' })
    // Cash up to today 3.000 (the 7.000 of 6 October waits) less the drawer expense 400 (QA2a: net).
    const total = within(dialog).getByTestId('handover-total-TRY')
    expect(within(total).getByTestId('handover-net')).toHaveTextContent('₺2.600')
    expect(within(total).getByTestId('handover-parts')).toHaveTextContent('Nakit ödemeler₺3.000')
  })

  it('ay görünümünde "Nakit" süzgeci kasadan ödenen gideri de gösterir (B19)', async () => {
    const user = userEvent.setup()
    await render()
    await user.click(await screen.findByTestId('view-month'))
    await user.click(await screen.findByTestId('filter-method'))
    await user.click(await screen.findByRole('option', { name: 'Nakit' }))
    const bands = await screen.findByTestId('month-bands')
    const band = within(bands).getAllByTestId('month-band')[0]!
    await user.click(band)
    expect(within(bands).getByText('Market')).toBeInTheDocument()
  })

  it('sözlükte kapalı günde kalan satırlar bildirilir (B16)', async () => {
    const info = vi.spyOn(toast, 'info')
    const state = sampleLedger()
    state.expenses.push(expense({ id: 'e-su1', amountMinor: 1_000, description: 'su', descriptionKey: 'su' }))
    state.skippedClosed = 1
    const user = userEvent.setup()
    await render(ledgerTransport(state))
    await user.click(await screen.findByTestId('open-dictionary'))
    const dialog = await screen.findByRole('dialog', { name: 'Açıklama sözlüğü' })
    const group = within(dialog)
      .getAllByTestId('dictionary-group')
      .find((g) => g.textContent?.startsWith('su')) as HTMLElement
    await user.click(within(group).getByRole('button', { name: 'Yeniden adlandır' }))
    const input = within(group).getByTestId('dictionary-rename')
    await user.clear(input)
    await user.type(input, 'Su')
    await user.click(within(group).getByTestId('dictionary-save'))
    await waitFor(() =>
      expect(info).toHaveBeenCalledWith('Ad değişti. Kapalı gündeki 1 satır eski adıyla kaldı.')
    )
  })
})
