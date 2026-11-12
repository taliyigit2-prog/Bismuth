import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { FAKE_ACCOUNTS, fakeTransport, renderWithProviders } from '@/test/render'
import { FirstReservationHint } from './first-reservation-hint'

function transport(total: number, signedIn?: string) {
  const t = fakeTransport(SETTINGS_DEFAULTS, {
    accounts: [
      ...FAKE_ACCOUNTS,
      { id: 'u-acc', username: 'muhasebe', displayName: 'Muhasebe', roleCode: 'accountant', password: 'x' }
    ],
    ...(signedIn ? { signedIn } : {})
  })
  const call = t.call.bind(t)
  t.call = ((name, input) =>
    name === 'guests.list'
      ? Promise.resolve({ rows: [], total, counts: {}, baseCurrency: 'TRY', moneyHidden: false })
      : call(name, input)) as typeof t.call
  return t
}

describe('takvimin ilk kurulum yönlendirmesi', () => {
  it('otelde hiç misafir (dolayısıyla rezervasyon) yokken "İlk rezervasyonunuzu ekleyin" çıkar', async () => {
    await renderWithProviders(<FirstReservationHint />, { transport: transport(0) })
    expect(await screen.findByText('İlk rezervasyonunuzu ekleyin')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kılavuzda oku' })).toHaveAttribute(
      'href',
      expect.stringContaining('s=reservations')
    )
  })

  it('ilk misafirden sonra kaybolur', async () => {
    const t = transport(3)
    await renderWithProviders(<FirstReservationHint />, { transport: t })
    await waitFor(() => expect(t.calls.some((c) => c.name === 'auth.state')).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('first-reservation-hint')).toBeNull()
  })

  it('rezervasyon yazamayan role gösterilmez', async () => {
    const t = transport(0, 'u-acc')
    await renderWithProviders(<FirstReservationHint />, { transport: t })
    await waitFor(() => expect(t.calls.some((c) => c.name === 'auth.state')).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByTestId('first-reservation-hint')).toBeNull()
  })
})
