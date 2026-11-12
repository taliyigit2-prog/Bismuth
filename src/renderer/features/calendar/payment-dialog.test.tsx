// The reservation panel's payment window (P7fix, calendar hunt #13 and #24): the typed rate only when no rate is
// known, always "1 <currency> = ? <base currency>", one per currency that needs it (K-43); a closed business day asks
// for a reason from those who may write into it and is locked for the others (G-72).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProcedureName } from '@shared/contract'
import { renderWithProviders } from '@/test/render'
import { ApiError } from '@/lib/transport/types'
import { setViewAs } from '@/lib/view-as'
import { bookingTransport } from './booking-fake'
import { PaymentDialog } from './payment-dialog'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => act(() => setViewAs('owner')))

/** The booking fake plus the rates the service knows and a day it closed. */
function transportWith(opts: { missing?: string[]; closed?: boolean } = {}) {
  const t = bookingTransport()
  const inner = t.call.bind(t)
  t.call = (async (name: ProcedureName, input: unknown) => {
    if (name === 'ledger.knownRates') {
      t.calls.push({ name, input })
      const asked = (input as { currencies: string[] }).currencies
      return { base: 'TRY', missing: asked.filter((c) => opts.missing?.includes(c)) }
    }
    if (
      name === 'booking.addPayment' &&
      opts.closed &&
      !(input as { dayClosedReason?: string }).dayClosedReason
    ) {
      t.calls.push({ name, input })
      throw new ApiError('CONFLICT', 409, 'errors.dayClosed')
    }
    return inner(name, input as never)
  }) as typeof t.call
  return t
}

const open = (transport: ReturnType<typeof transportWith>, folioCurrency = 'EUR') =>
  renderWithProviders(
    <PaymentDialog
      open
      onOpenChange={() => {}}
      reservationId="res-1"
      defaultMinor={10_000}
      folioCurrency={folioCurrency}
      channelId={null}
    />,
    { transport }
  )

describe('rezervasyon panelindeki ödeme penceresi', { timeout: 30_000 }, () => {
  it('kurlar biliniyorsa elle kur alanı yok (K-43, #13)', async () => {
    const transport = transportWith()
    await open(transport)
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(transport.callsTo('ledger.knownRates').length).toBeGreaterThan(0))
    expect(within(dialog).queryByTestId('manual-rate')).not.toBeInTheDocument()
  })

  it('internetsiz EUR folyoya TL ödeme: "1 EUR kaç TRY" sorulur ve folyo kuru olarak gider (K-43, #13)', async () => {
    const transport = transportWith({ missing: ['EUR'] })
    const user = userEvent.setup()
    await open(transport)
    const dialog = await screen.findByRole('dialog')
    // EUR payment into the EUR folio: the base value's rate (optional).
    expect(await within(dialog).findByLabelText('Kur: 1 EUR kaç TRY')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('combobox', { name: 'Para birimi' }))
    await user.click(await screen.findByRole('option', { name: /TRY/ }))
    const folioRate = await within(dialog).findByTestId('manual-rate-folio')
    expect(within(dialog).queryByTestId('manual-rate-pay')).not.toBeInTheDocument()
    await user.type(folioRate, '38')
    await user.click(within(dialog).getByTestId('payment-save'))
    await waitFor(() => expect(transport.callsTo('booking.addPayment')).toHaveLength(1))
    expect(transport.callsTo('booking.addPayment')[0]).toMatchObject({
      currency: 'TRY',
      manualFolioRateMicro: 38_000_000
    })
  })

  it('kapalı günde Sahip gerekçe yazar ve ödeme kaydedilir (#24)', async () => {
    const transport = transportWith({ closed: true })
    const user = userEvent.setup()
    await open(transport, 'TRY')
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByTestId('payment-save'))
    const reason = await within(dialog).findByTestId('closed-day-reason')
    await user.type(within(reason).getByRole('textbox'), 'geç gelen ödeme')
    await user.click(within(dialog).getByTestId('payment-save'))
    await waitFor(() => expect(transport.callsTo('booking.addPayment')).toHaveLength(2))
    expect(transport.callsTo('booking.addPayment')[1]).toMatchObject({ dayClosedReason: 'geç gelen ödeme' })
  })

  it('kapalı güne yazma yetkisi olmayan rol kilit açıklamasını görür (#24, B26)', async () => {
    act(() => setViewAs('reception'))
    const transport = transportWith({ closed: true })
    const user = userEvent.setup()
    await open(transport, 'TRY')
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByTestId('payment-save'))
    expect(await within(dialog).findByTestId('closed-day-locked')).toBeInTheDocument()
    expect(within(dialog).queryByTestId('closed-day-reason')).not.toBeInTheDocument()
  })
})

describe('rezervasyon panelindeki ödeme: tutar alanı ve fazla ödeme (QA2a)', { timeout: 30_000 }, () => {
  const openWithBalance = (transport: ReturnType<typeof transportWith>, balanceMinor: number | null) =>
    renderWithProviders(
      <PaymentDialog
        open
        onOpenChange={() => {}}
        reservationId="res-1"
        defaultMinor={Math.max(0, balanceMinor ?? 0)}
        folioCurrency="TRY"
        channelId={null}
        balanceMinor={balanceMinor}
      />,
      { transport }
    )

  it('bakiyeyle dolu alana "abc" yazılınca ödeme yazılmaz, hata alanın altında', async () => {
    const transport = transportWith()
    const user = userEvent.setup()
    await openWithBalance(transport, 500_000)
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByLabelText('Tutar')
    expect(field).toHaveValue('5.000')
    await user.clear(field)
    await user.type(field, 'abc')
    await user.click(within(dialog).getByTestId('payment-save'))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sayı olmalı')
    expect(transport.callsTo('booking.addPayment')).toHaveLength(0)
  })

  it('₺5.000 bakiyeye ₺99.999,99 ödeme önce sorulur, onaylanınca yazılır; iade sorulmaz', async () => {
    const transport = transportWith()
    const user = userEvent.setup()
    await openWithBalance(transport, 500_000)
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByLabelText('Tutar')
    await user.clear(field)
    await user.type(field, '99.999,99')
    await user.click(within(dialog).getByTestId('payment-save'))
    const ask = await screen.findByRole('alertdialog', { name: 'Bakiyeden fazla ödeme alınsın mı?' })
    expect(ask).toHaveTextContent('Bakiye ₺5.000, alınan ₺99.999,99.')
    expect(transport.callsTo('booking.addPayment')).toHaveLength(0)
    await user.click(within(ask).getByTestId('over-amount-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.addPayment')).toHaveLength(1))
    expect(transport.callsTo('booking.addPayment')[0]).toMatchObject({ amountMinor: 9_999_999 })

    await user.click(within(dialog).getByTestId('pay-kind-refund'))
    await user.click(within(dialog).getByTestId('payment-save'))
    await waitFor(() => expect(transport.callsTo('booking.addPayment')).toHaveLength(2))
  })
})
