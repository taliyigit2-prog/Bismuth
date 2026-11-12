// Flow test A fixes on the ledger (QA2a): a text that is not an amount never saves the older amount, the "⋯" menu
// opens only what was chosen, a payment above the balance is asked once, "Teslim al" shows the net the history
// keeps (cash − drawer expenses − staff money), a foreign expense without a rate is warned before saving, and a
// group of voided rows does not say "0 satır".
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { CashDrawerPanel } from '@/components/cash-drawer/cash-drawer-panel'
import { scopeSummary } from '@/components/cash-drawer/handover-dialog'
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

describe('Defter: para alanları ve satır menüsü (QA2a)', { timeout: 30_000 }, () => {
  it('bakiyeyle dolu tutara "abc" yazılıp Kaydet\'e basılınca ödeme yazılmaz, hata alanın altında', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    const field = within(dialog).getByLabelText('Tutar')
    expect(field).toHaveValue('4.500')
    await user.clear(field)
    await user.type(field, 'abc')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sayı olmalı')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveValue('abc')
    // Enter in the field does not send it either.
    await user.type(field, '{Enter}')
    expect(transport.callsTo('ledger.addPayment')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Ödeme ekle' })).toBeInTheDocument()
  })

  it('eksi ve sınırı aşan tutar alanın altında söylenir, kaydedilmez', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    const field = within(dialog).getByLabelText('Tutar')
    await user.clear(field)
    await user.type(field, '-100')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sıfırdan küçük olamaz.')
    await user.clear(field)
    await user.type(field, '99.999.999.999')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent(
      'Tutar çok büyük. En fazla ₺1.000.000.000 yazılabilir.'
    )
    expect(transport.callsTo('ledger.addPayment')).toHaveLength(0)
  })

  it('boş gönderimde "Tutarı yazın" tutar alanının altında ve alan kırmızı', async () => {
    const user = userEvent.setup()
    await render()
    await user.click(await screen.findByTestId('add-payment'))
    const dialog = await screen.findByRole('dialog', { name: 'Ödeme ekle' })
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    const field = within(dialog).getByLabelText('Tutar')
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutarı yazın')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field.getAttribute('aria-describedby')).toBe(within(dialog).getByTestId('money-error').id)
  })

  it('gider düzenlerken "abc" eski tutarla kaydedilmez', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const rows = await screen.findAllByTestId('expense-row')
    await user.click(within(rows[0]!).getByText('Market'))
    const dialog = await screen.findByRole('dialog', { name: 'Gideri düzenle' })
    const field = within(dialog).getByLabelText('Tutar')
    expect(field).toHaveValue('400')
    await user.clear(field)
    await user.type(field, 'abc')
    await user.click(within(dialog).getByTestId('ledger-expense-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sayı olmalı')
    expect(transport.callsTo('ledger.updateExpense')).toHaveLength(0)
  })

  it('satır menüsünden "İptal et" yalnız iptal penceresini açar, düzenle penceresi açılmaz', async () => {
    const user = userEvent.setup()
    await render()
    const rows = await screen.findAllByTestId('income-row')
    const cash = rows.find((r) => r.textContent?.includes('₺3.000')) as HTMLElement
    await user.click(within(cash).getByRole('button', { name: /Satır işlemleri/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'İptal et' }))
    expect(await screen.findByRole('dialog', { name: /iptal edilsin mi/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ödemeyi düzenle' })).not.toBeInTheDocument()

    const expenseRow = (await screen.findAllByTestId('expense-row'))[0]!
    await user.keyboard('{Escape}')
    await user.click(within(expenseRow).getByRole('button', { name: /Gider işlemleri/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'İptal et' }))
    expect(await screen.findByRole('dialog', { name: /iptal edilsin mi/ })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Gideri düzenle' })).not.toBeInTheDocument()
  })

  it('satıra tıklamak düzenle penceresini açmaya devam eder', async () => {
    const user = userEvent.setup()
    await render()
    const rows = await screen.findAllByTestId('income-row')
    const cash = rows.find((r) => r.textContent?.includes('₺3.000')) as HTMLElement
    await user.click(within(cash).getByText('101'))
    expect(await screen.findByRole('dialog', { name: 'Ödemeyi düzenle' })).toBeInTheDocument()
  })

  it('bakiyeyi aşan ödeme önce sorulur; "Vazgeç" yazmaz, "Yine de kaydet" yazar', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    const field = within(dialog).getByLabelText('Tutar')
    await user.clear(field)
    await user.type(field, '99.999,99')
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    const ask = await screen.findByRole('alertdialog', { name: 'Bakiyeden fazla ödeme alınsın mı?' })
    expect(ask).toHaveTextContent(
      'Bakiye ₺4.500, alınan ₺99.999,99. Fazlası (₺95.499,99) misafire borç olarak kalır.'
    )
    await user.click(within(ask).getByRole('button', { name: 'Vazgeç' }))
    expect(transport.callsTo('ledger.addPayment')).toHaveLength(0)
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await user.click(await screen.findByTestId('over-amount-confirm'))
    await waitFor(() => expect(transport.callsTo('ledger.addPayment')).toHaveLength(1))
    expect(transport.callsTo('ledger.addPayment')[0]).toMatchObject({ amountMinor: 9_999_999 })
  })

  it('bakiyeyi aşmayan ödeme sorulmadan yazılır', async () => {
    const transport = ledgerTransport()
    const user = userEvent.setup()
    await render(transport)
    const dialog = await openPayment(user)
    await user.click(within(dialog).getByTestId('ledger-payment-save'))
    await waitFor(() => expect(transport.callsTo('ledger.addPayment')).toHaveLength(1))
    expect(screen.queryByTestId('over-amount-dialog')).not.toBeInTheDocument()
  })

  it('kur bilinmeyen EUR giderde kaydetmeden önce "kur yok" uyarısı çıkar, kur yazılınca kalkar', async () => {
    const state = sampleLedger()
    state.missingRates = ['EUR']
    const transport = ledgerTransport(state)
    const user = userEvent.setup()
    await render(transport)
    await user.click(await screen.findByTestId('add-expense'))
    const dialog = await screen.findByRole('dialog', { name: 'Gider ekle' })
    expect(within(dialog).queryByTestId('expense-no-rate')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('combobox', { name: 'Para birimi' }))
    await user.click(await screen.findByRole('option', { name: /EUR/ }))
    expect(await within(dialog).findByTestId('expense-no-rate')).toHaveTextContent('kur yok')
    await user.type(await within(dialog).findByLabelText('Kur: 1 EUR kaç TRY'), '38,5')
    expect(within(dialog).queryByTestId('expense-no-rate')).not.toBeInTheDocument()
  })

  it('yalnız iptal edilmiş satırı olan yöntem başlığı "0 satır" değil "İptal edildi" der', async () => {
    const state = sampleLedger()
    state.income = [
      income({
        id: 'p-only-void',
        amountMinor: 50_000,
        methodId: 'm-card',
        methodCode: 'card',
        methodGroup: 'card',
        isCash: false,
        voided: true
      }),
      income({ id: 'p-cash-live', amountMinor: 20_000 })
    ]
    await render(ledgerTransport(state))
    const table = await screen.findByTestId('day-payments')
    const rowsOf = within(table).getAllByRole('row')
    const header = rowsOf.find((r) => r.textContent?.startsWith('Kredi kartı')) as HTMLElement
    expect(header).toHaveTextContent('İptal edildi')
    expect(header).not.toHaveTextContent('0 satır')
    expect(rowsOf.find((r) => r.textContent?.startsWith('Nakit'))).toHaveTextContent('1 satır')
  })
})

describe('yetkisiz rol (QA2a)', () => {
  it('Temizlik defteri açınca "yetkiniz yok" görür ve defter sorgusu hiç atılmaz', async () => {
    act(() => setViewAs('housekeeping'))
    const transport = ledgerTransport()
    await render(transport)
    expect(await screen.findByText(/yetkiniz yok/)).toBeInTheDocument()
    expect(transport.callsTo('ledger.options')).toHaveLength(0)
    expect(transport.callsTo('ledger.day')).toHaveLength(0)
  })
})

describe('Teslim al: net tutar ve dökümü (QA2a)', { timeout: 30_000 }, () => {
  it('"Yalnız nakit" kasadan giderleri ve avansları düşer; döküm yazılır', async () => {
    const state = sampleLedger()
    state.income = [
      income({ id: 'c1', amountMinor: 280_000 }),
      income({ id: 'k1', amountMinor: 90_000, methodId: 'm-card', methodGroup: 'card', isCash: false })
    ]
    state.expenses = [
      expense({ id: 'e1', amountMinor: 30_000, description: 'Market' }),
      expense({
        id: 'e2',
        amountMinor: 20_000,
        description: 'Avans',
        kind: 'staff',
        staffKind: 'advance',
        employeeName: 'Selin Kaya'
      })
    ]
    const user = userEvent.setup()
    await renderWithProviders(<CashDrawerPanel />, { transport: ledgerTransport(state) })
    const panel = await screen.findByTestId('cash-drawer-panel')
    await user.click(within(panel).getByTestId('drawer-collect'))
    const dialog = await screen.findByRole('dialog', { name: 'Para teslim alınsın mı?' })
    await user.click(within(dialog).getByTestId('handover-scope-cash'))
    const total = within(dialog).getByTestId('handover-total')
    expect(within(total).getByTestId('handover-net')).toHaveTextContent('₺2.300')
    const parts = within(total).getByTestId('handover-parts')
    expect(parts).toHaveTextContent('Nakit ödemeler₺2.800')
    expect(parts).toHaveTextContent('Kasadan ödenen giderler-₺300')
    expect(parts).toHaveTextContent('Kasadan verilen avans ve maaş-₺200')
    expect(total).not.toHaveTextContent('Kredi kartı')
    await user.click(within(dialog).getByTestId('handover-scope-all'))
    expect(within(total).getByTestId('handover-net')).toHaveTextContent('₺2.300')
    expect(total).toHaveTextContent('Kredi kartı₺900')
  })

  it('özet servisin teslim kuralıyla aynı: ileri tarihli gider düşülmez, seçili satırda en yeni nakit güne kadar', () => {
    const panel = {
      pendingToday: { TRY: { cash: 100_000, card: 50_000 } },
      cashToday: { TRY: 100_000 },
      drawerOut: [
        { date: '2026-10-02' as typeof TODAY, currency: 'TRY', expensesMinor: 10_000, staffMinor: 0 },
        { date: '2026-10-03' as typeof TODAY, currency: 'TRY', expensesMinor: 0, staffMinor: 5_000 },
        { date: '2026-10-09' as typeof TODAY, currency: 'TRY', expensesMinor: 7_000, staffMinor: 0 }
      ]
    }
    expect(scopeSummary(panel, 'cash', [], TODAY).TRY).toEqual({
      cash: 100_000,
      expenses: 10_000,
      staff: 5_000,
      net: 85_000,
      others: {}
    })
    expect(scopeSummary(panel, 'all', [], TODAY).TRY?.others).toEqual({ card: 50_000 })
    const picked = scopeSummary(
      panel,
      'selected',
      [
        { id: 'a', amountMinor: 40_000, currency: 'TRY', date: '2026-10-02', isCash: true },
        {
          id: 'b',
          amountMinor: 9_000,
          currency: 'TRY',
          date: '2026-10-04',
          isCash: false,
          methodGroup: 'card'
        }
      ],
      TODAY
    ).TRY
    expect(picked).toEqual({ cash: 40_000, expenses: 10_000, staff: 0, net: 30_000, others: { card: 9_000 } })
  })
})
