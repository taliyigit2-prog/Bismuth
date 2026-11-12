import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { startRenderCount, stopRenderCount } from '@/lib/render-count'
import { setViewAs } from '@/lib/view-as'
import { CashDrawerButton } from '@/components/cash-drawer/cash-drawer-button'
import { expense, income, ledgerTransport, sampleLedger, TODAY } from './ledger-fake'
import { LedgerPage } from './ledger-page'

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

const render = (transport = ledgerTransport()) => renderWithProviders(<LedgerPage />, { transport })

describe('Defter ve kasa (Faz 7, gerçek servis)', { timeout: 30_000 }, () => {
  it('veri gelene kadar yükleniyor, okunamazsa yeniden dene gösterir', async () => {
    const pending = ledgerTransport()
    pending.call = () => new Promise(() => {})
    await render(pending)
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('okunamazsa "Yeniden dene" çıkar; yetkisi olmayan rol ekranı göremez', async () => {
    const first = await render(ledgerTransport(sampleLedger(), { fail: ['ledger.options'] }))
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
    first.unmount()
    act(() => setViewAs('housekeeping'))
    await render()
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('günün gelirleri nakit → IBAN → kart sırasıyla; iptal satırı üstü çizili, kuru olmayan satır rozetli', async () => {
    await render()
    const table = await screen.findByTestId('day-payments')
    const groups = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent ?? '')
      .filter((text) => /^(Nakit|IBAN|Kredi kartı)\d/.test(text))
      .map((text) => text.replace(/\d.*$/, ''))
    expect(groups).toEqual(['Nakit', 'IBAN', 'Kredi kartı'])
    const voided = table.querySelector('[data-voided]') as HTMLElement
    expect(within(voided).getByText('İptal edildi')).toBeInTheDocument()
    expect(within(table).getByTestId('rate-none')).toHaveTextContent('Kur yok')
    expect(within(table).getByRole('columnheader', { name: 'TRY karşılığı' })).toBeInTheDocument()
    // Totals per currency: TRY and EUR on their own rows.
    const totals = within(screen.getByTestId('currency-totals'))
    expect(totals.getByRole('rowheader', { name: 'EUR' })).toBeInTheDocument()
    expect(totals.getByRole('rowheader', { name: 'TRY' })).toBeInTheDocument()
    expect(screen.getByText('1 kaydın kuru yok; toplama katılmadı.')).toBeInTheDocument()
  })

  it('maaş ödemesi türüyle ve kilitli görünür; defterden düzenlenemez', async () => {
    await render()
    const expenses = await screen.findByTestId('day-expenses')
    const salary = within(expenses).getByText('Selin Kaya').closest('tr') as HTMLElement
    expect(within(salary).getByTestId('expense-locked')).toHaveTextContent('Maaş ödemesi')
    expect(within(salary).queryByRole('button', { name: /Gider işlemleri/ })).not.toBeInTheDocument()
    const market = within(expenses).getByText('Market').closest('tr') as HTMLElement
    expect(within(market).getByRole('button', { name: 'Gider işlemleri · Market' })).toBeInTheDocument()
  })

  it('kasa paneli kasadaki nakdi verir; "Teslim al" hepsini alır ve geçmişe yazar', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const panel = await screen.findByTestId('cash-drawer-panel')
    // Uncollected cash 3.000 (the EUR row aside) minus the drawer expense 400.
    expect(within(panel).getByTestId('drawer-TRY')).toHaveTextContent('₺2.600')
    expect(within(panel).getByTestId('drawer-matrix')).toHaveTextContent('Kredi kartı')
    await user.click(within(panel).getByTestId('drawer-collect'))
    const dialog = await screen.findByRole('dialog', { name: 'Para teslim alınsın mı?' })
    // QA2a: the net cash the history keeps (3.000 − 400), then card and IBAN rows.
    const total = within(dialog).getByTestId('handover-total-TRY')
    expect(within(total).getByTestId('handover-net')).toHaveTextContent('₺2.600')
    expect(total).toHaveTextContent('Kredi kartı₺5.000')
    expect(total).toHaveTextContent('IBAN₺1.000')
    await user.click(within(dialog).getByTestId('handover-confirm'))
    await waitFor(() => expect(transport.callsTo('ledger.handover')).toHaveLength(1))
    expect(transport.callsTo('ledger.handover')[0]).toMatchObject({
      upToDate: expect.any(String),
      onlyCash: false
    })
    await waitFor(() => expect(within(panel).getByTestId('drawer-TRY')).toHaveTextContent('₺0'))
    expect(within(panel).getByTestId('drawer-empty')).toHaveTextContent('Teslim alınmamış para yok.')
    await user.click(within(panel).getByTestId('drawer-history-toggle'))
    const history = await within(panel).findByTestId('handover-history')
    expect(within(history).getAllByRole('listitem')).toHaveLength(1)
    await user.click(within(history).getByTestId('handover-undo'))
    const undo = await screen.findByRole('dialog', { name: 'Teslim geri alınsın mı?' })
    await user.click(within(undo).getByTestId('undo-confirm'))
    expect(within(undo).getByText('Bir gerekçe yazın.')).toBeInTheDocument()
    await user.type(within(undo).getByLabelText('Neden'), 'yanlış sayıldı')
    await user.click(within(undo).getByTestId('undo-confirm'))
    await waitFor(() =>
      expect(transport.callsTo('ledger.revertHandover')).toEqual([
        { id: expect.any(String), reason: 'yanlış sayıldı' }
      ])
    )
  })

  it('satır seçilince "Teslim aldım" yalnız seçilenleri alır', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const table = await screen.findByTestId('day-payments')
    await user.click(
      within(table).getAllByRole('checkbox', { name: 'Teslim almak için seç · 101 · Deniz Yıldırım' })[0]!
    )
    await user.click(await within(table).findByRole('button', { name: 'Teslim aldım (1)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Para teslim alınsın mı?' })
    expect(within(dialog).getByTestId('handover-scope-selected')).toBeChecked()
    await user.click(within(dialog).getByTestId('handover-confirm'))
    await waitFor(() => expect(transport.callsTo('ledger.handover')).toHaveLength(1))
    expect(transport.callsTo('ledger.handover')[0]).toMatchObject({ paymentIds: [expect.any(String)] })
  })

  it('Resepsiyon "x" koyamaz; gizli bölüm olan günde "kısmi görünüm" rozeti çıkar', async () => {
    act(() => setViewAs('reception'))
    const state = sampleLedger()
    state.partial = true
    await render(ledgerTransport(state))
    const table = await screen.findByTestId('day-payments')
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('partial-badge')).toHaveTextContent('Kısmi görünüm')
    expect(screen.getByTestId('expenses-partial')).toBeInTheDocument()
    const panel = await screen.findByTestId('cash-drawer-panel')
    expect(within(panel).queryByTestId('drawer-collect')).not.toBeInTheDocument()
    expect(within(panel).getByTestId('drawer-partial')).toBeInTheDocument()
  })

  it('"Ödeme ekle": rezervasyon seçilir, bakiye tutara gelir, aynı ödeme kaydı yazılır', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-payment'))
    const dialog = await screen.findByRole('dialog', { name: 'Ödeme ekle' })
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutarı yazın')
    await user.click(await within(dialog).findByTestId('reservation-hit'))
    expect(within(dialog).getByTestId('picked-reservation')).toHaveTextContent('Deniz Yıldırım')
    expect(within(dialog).getByLabelText('Tutar')).toHaveValue('4.500')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addPayment')).toHaveLength(1))
    expect(transport.callsTo('ledger.addPayment')[0]).toMatchObject({
      reservationId: 'r-1',
      date: TODAY,
      kind: 'payment',
      amountMinor: 450_000,
      currency: 'TRY',
      methodId: 'm-cash',
      channelId: 'ch-booking'
    })
  })

  it('ek hizmet satışı (bavul emaneti) odasız gelir olarak yazılır', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-payment'))
    const dialog = await screen.findByRole('dialog', { name: 'Ödeme ekle' })
    await user.click(within(dialog).getByTestId('target-sale'))
    await user.clear(within(dialog).getByLabelText('Adet'))
    await user.type(within(dialog).getByLabelText('Adet'), '2')
    expect(within(dialog).getByTestId('sale-total')).toHaveTextContent('₺300')
    await user.type(within(dialog).getByLabelText('Satış adı'), '2 bavul')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await waitFor(() => expect(transport.callsTo('ledger.sellExtra')).toHaveLength(1))
    expect(transport.callsTo('ledger.sellExtra')[0]).toMatchObject({
      extraServiceId: 'x-luggage',
      qty: 2,
      unitMinor: 15_000,
      description: '2 bavul',
      payment: { methodId: 'm-cash' }
    })
  })

  it('"Gider ekle": önceki açıklamalar önerilir; kasadan ödenen gider ürün satırıyla yazılır', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-expense'))
    const dialog = await screen.findByRole('dialog', { name: 'Gider ekle' })
    await user.type(within(dialog).getByLabelText('Tutar'), '300')
    await user.type(within(dialog).getByTestId('expense-description'), 'Ma')
    await waitFor(() =>
      expect(
        [...dialog.querySelectorAll('[data-testid="expense-suggestions"] option')].map((o) =>
          o.getAttribute('value')
        )
      ).toEqual(['Market'])
    )
    await user.clear(within(dialog).getByTestId('expense-description'))
    await user.type(within(dialog).getByTestId('expense-description'), 'Su')
    await user.click(within(dialog).getByRole('button', { name: 'Ürün satırı ekle' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Ürün' }))
    await user.click(await screen.findByRole('option', { name: /Damacana su/ }))
    await user.clear(within(dialog).getByLabelText('Miktar'))
    await user.type(within(dialog).getByLabelText('Miktar'), '2')
    await user.type(within(dialog).getByLabelText('Birim fiyat'), '150')
    await user.click(within(dialog).getByTestId('ledger-expense-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addExpense')).toHaveLength(1))
    expect(transport.callsTo('ledger.addExpense')[0]).toMatchObject({
      date: TODAY,
      sectionId: 's-general',
      amountMinor: 30_000,
      description: 'Su',
      paidFromDrawer: true,
      methodId: null,
      items: [{ productId: 'prod-water', qtyMilli: 2_000, unitPriceMinor: 15_000 }]
    })
  })

  it('sıralama "Saate göre" seçilince hatırlanmak üzere kaydedilir', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('order-time'))
    await waitFor(() => expect(transport.callsTo('ledger.setSort')).toEqual([{ sort: 'time' }]))
    const table = screen.getByTestId('day-payments')
    expect(within(table).queryByText('3 satır')).not.toBeInTheDocument()
  })

  it('aylık görünüm gün bantlarını verir; para birimi süzgeci toplamları daraltır', async () => {
    const state = sampleLedger()
    state.income.push(income({ id: 'p-sep', amountMinor: 70_000, date: '2026-10-02' as typeof TODAY }))
    state.expenses.push(
      expense({
        id: 'e-old',
        amountMinor: 10_000,
        description: 'Kırtasiye',
        date: '2026-10-02' as typeof TODAY
      })
    )
    const user = userEvent.setup()
    await render(ledgerTransport(state))
    await user.click(await screen.findByTestId('view-month'))
    const bands = await screen.findByTestId('month-bands')
    expect(within(bands).getAllByTestId('month-band')).toHaveLength(2)
    expect(within(bands).getAllByTestId('month-band')[1]).toHaveTextContent('Selin izin kullandı.')
    // Opening a day draws only that day's band again (faz-15 madde 9).
    const renders = startRenderCount()
    try {
      await user.click(within(bands).getAllByTestId('month-band')[0]!)
      expect(renders['ledger-band']).toBe(1)
    } finally {
      stopRenderCount()
    }
    expect(within(bands).getByText('Kırtasiye')).toBeInTheDocument()
    const totals = screen.getByTestId('month-totals')
    expect(within(totals).getByRole('rowheader', { name: 'EUR' })).toBeInTheDocument()
    await user.click(screen.getByTestId('filter-currency'))
    await user.click(await screen.findByRole('option', { name: 'EUR' }))
    expect(within(totals).queryByRole('rowheader', { name: 'TRY' })).not.toBeInTheDocument()
    // Only today keeps a EUR row (and its note); 2 October drops out.
    expect(within(screen.getByTestId('month-bands')).getAllByTestId('month-band')).toHaveLength(1)
  })

  it('açıklama sözlüğü yazımları gösterir; yeniden adlandırma bütün grubu değiştirir', async () => {
    const state = sampleLedger()
    state.expenses.push(expense({ id: 'e-su1', amountMinor: 1_000, description: 'su', descriptionKey: 'su' }))
    state.expenses.push(
      expense({ id: 'e-su2', amountMinor: 2_000, description: 'Su ', descriptionKey: 'su' })
    )
    const transport = ledgerTransport(state)
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('open-dictionary'))
    const dialog = await screen.findByRole('dialog', { name: 'Açıklama sözlüğü' })
    const group = within(dialog)
      .getAllByTestId('dictionary-group')
      .find((g) => g.textContent?.includes('Yazımlar')) as HTMLElement
    expect(group).toHaveTextContent('"su" (1)')
    await user.click(within(group).getByRole('button', { name: 'Yeniden adlandır' }))
    const input = within(group).getByTestId('dictionary-rename')
    await user.clear(input)
    await user.type(input, 'Su (damacana)')
    await user.click(within(group).getByTestId('dictionary-save'))
    await waitFor(() =>
      expect(transport.callsTo('ledger.renameDescription')).toEqual([
        { key: 'su', description: 'Su (damacana)' }
      ])
    )
  })

  it('telefonda önce gün seçici, sonra kasa paneli ve kart listeleri gelir', async () => {
    phone()
    await render()
    const panel = await screen.findByTestId('cash-panel')
    const bar = screen.getByTestId('day-bar')
    const payments = await screen.findByTestId('day-payments')
    expect(bar.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(payments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(payments).getByRole('list', { name: 'Ödemeler' })).toBeInTheDocument()
    expect(within(payments).queryByRole('table')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('day-expenses')).queryByRole('table')).not.toBeInTheDocument()
    expect(within(bar).getByTestId('day-label')).toHaveTextContent('Paz, 4 Ekim 2026')
    expect(screen.getByTestId('add-payment')).toHaveTextContent('Ödeme ekle')
  })
})

describe('üst çubuktaki kasa düğmesi', { timeout: 30_000 }, () => {
  it('kasada olması gereken tutarı gösterir ve paneli açar; yetkisi olmayan rolde görünmez', async () => {
    const user = userEvent.setup()
    const first = await renderWithProviders(<CashDrawerButton />, { transport: ledgerTransport() })
    const button = await screen.findByTestId('cash-drawer-button')
    expect(button).toHaveAccessibleName('Kasa durumu: kasada ₺2.600 olmalı')
    await user.click(button)
    expect(await screen.findByTestId('cash-drawer-sheet')).toBeInTheDocument()
    expect(await screen.findByTestId('cash-drawer-panel')).toBeInTheDocument()
    first.unmount()
    act(() => setViewAs('housekeeping'))
    await renderWithProviders(<CashDrawerButton />, { transport: ledgerTransport() })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('cash-drawer-button')).not.toBeInTheDocument()
  })

  it('günü yazdırır: A4 düzeninde otel adı, gün, ödemeler ve giderler (faz-15 madde 8)', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    await render()
    await screen.findByTestId('day-payments')
    await user.click(screen.getByTestId('day-print'))
    const root = await screen.findByTestId('print-root')
    await waitFor(() => expect(print).toHaveBeenCalled())
    expect(within(root).getByTestId('print-hotel')).toHaveTextContent('Bismuth')
    expect(within(root).getByText('Günlük defter', { exact: false })).toBeInTheDocument()
    expect(within(within(root).getByTestId('print-income')).getByText('Ayşe Demir')).toBeInTheDocument()
    expect(within(root).getByTestId('print-expenses')).toBeInTheDocument()
    act(() => void window.dispatchEvent(new Event('afterprint')))
    await waitFor(() => expect(screen.queryByTestId('print-root')).not.toBeInTheDocument(), { timeout: 4000 })
  })
})
