import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { ApiError } from '@/lib/transport/types'
import { renderWithProviders } from '@/test/render'
import { adminTransport } from './admin-fake'
import { ListsSection } from './lists-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

/** Phone layout (< 768 px) for the next render. */
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

afterEach(async () => {
  vi.restoreAllMocks()
  const { setViewAs } = await import('@/lib/view-as')
  setViewAs('owner')
})

const render = (transport = adminTransport()) =>
  renderWithProviders(<ListsSection values={SETTINGS_DEFAULTS} />, { transport })

const names = (kind: string) =>
  within(screen.getByTestId(`list-${kind}`))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1]?.textContent)

describe('Listeler', () => {
  it('hazır satır yeniden adlandırılır (adı her dilde bu olur)', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Kredi kartı düzenle' }))
    expect(screen.getByText(/Hazır ad her dilde çevrilir/)).toBeInTheDocument()
    const name = screen.getByTestId('list-name')
    await user.clear(name)
    await user.type(name, 'POS cihazı{Enter}')
    await waitFor(() =>
      expect(transport.callsTo('lists.update')).toEqual([
        { kind: 'paymentMethods', id: 'list-card', patch: { name: 'POS cihazı' } }
      ])
    )
    await waitFor(() => expect(names('paymentMethods')).toContain('POS cihazı'))
  })

  it('kullanılmayan satır kapatılır, silinmez; son nakit yöntemi kapatılamazsa servisin uyarısı görünür', async () => {
    const error = vi.spyOn(toast, 'error')
    const transport = adminTransport({
      refuse: { 'lists.update': new ApiError('CONFLICT', 409, 'errors.cashMethodRequired') }
    })
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('switch', { name: 'Nakit kullanılıyor' }))
    await waitFor(() =>
      expect(transport.callsTo('lists.update')).toEqual([
        { kind: 'paymentMethods', id: 'list-cash', patch: { active: false } }
      ])
    )
    expect(error).toHaveBeenCalled()
    expect(screen.getByTestId('list-row-cash')).toBeInTheDocument()
  })

  it('yeni ödeme yöntemi eklenirken kasa grubu seçilir (P10fix #6)', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('list-add'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByTestId('list-name'), 'Sanal POS')
    await user.click(within(dialog).getByTestId('list-group'))
    await user.click(await screen.findByRole('option', { name: 'Kredi kartı' }))
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(transport.callsTo('lists.create')).toEqual([
        { kind: 'paymentMethods', name: 'Sanal POS', group: 'card' }
      ])
    )
  })

  it('kapatılan satır listede kalır ve yeniden açılabilir', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('switch', { name: 'Havale/EFT kullanılıyor' }))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Havale/EFT kullanılıyor' })).not.toBeChecked()
    )
    expect(transport.state.lists.paymentMethods.find((m) => m.code === 'bank')?.active).toBe(false)
  })

  it('aşağı taşı yalnız sırası değişen satırları yazar', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Aşağı taşı: Nakit' }))
    await waitFor(() =>
      expect(transport.callsTo('lists.update')).toEqual([
        { kind: 'paymentMethods', id: 'list-card', patch: { sort: 1 } },
        { kind: 'paymentMethods', id: 'list-cash', patch: { sort: 2 } }
      ])
    )
    await waitFor(() =>
      expect(
        within(screen.getByTestId('list-paymentMethods'))
          .getAllByRole('row')
          .slice(1)
          .map((row) => row.dataset['testid'])
      ).toEqual(['list-row-card', 'list-row-cash', 'list-row-bank'])
    )
  })

  it('satış kanalına komisyon yazılır; yeni kanal eklenir', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Satış kanalları' }))
    expect(await screen.findByText('Komisyon %15')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Booking.com düzenle' }))
    const commission = await screen.findByTestId('list-commission')
    await user.clear(commission)
    await user.type(commission, '12,5')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('lists.update')).toEqual([
        { kind: 'salesChannels', id: 'list-booking', patch: { commissionBp: 1250 } }
      ])
    )

    await user.click(screen.getByTestId('list-add'))
    await user.type(await screen.findByTestId('list-name'), 'Kapıdan tavsiye')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('lists.create')).toEqual([
        { kind: 'salesChannels', name: 'Kapıdan tavsiye', defaultCollectedBy: 'hotel', commissionBp: null }
      ])
    )
  })

  it('misafir etiketleri listesi boş başlar; yeni etiket eklenir (G-50)', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Misafir etiketleri' }))
    expect(await screen.findByText('Bu listede satır yok')).toBeInTheDocument()
    await user.click(screen.getByTestId('list-add'))
    expect(await screen.findByRole('dialog', { name: 'Yeni misafir etiketi' })).toBeInTheDocument()
    await user.type(screen.getByTestId('list-name'), 'Düzenli')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('lists.create')).toEqual([{ kind: 'guestTags', name: 'Düzenli' }])
    )
  })

  it('yalnız görebilen rol listeleri değiştiremez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('manager')
    await render()
    expect(await screen.findByRole('switch', { name: 'Nakit kullanılıyor' })).toBeDisabled()
    expect(screen.getByTestId('list-add')).toBeDisabled()
  })

  it('telefonda listeler sekme değil seçim kutusuyla açılır', async () => {
    phone()
    await render()
    const user = userEvent.setup()
    expect(await screen.findByTestId('list-paymentMethods')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('list-kind'))
    await user.click(await screen.findByRole('option', { name: 'Satış kanalları' }))
    expect(await screen.findByTestId('list-salesChannels')).toBeInTheDocument()
    expect(screen.queryByTestId('list-paymentMethods')).not.toBeInTheDocument()
  })

  it('para birimi yazılmamış ek hizmet fiyatı otelin ana para birimiyle gösterilir', async () => {
    const transport = adminTransport()
    transport.state.lists.extraServices[0]!.defaultCurrency = null
    await renderWithProviders(
      <ListsSection values={{ ...SETTINGS_DEFAULTS, 'hotel.baseCurrency': 'EUR' }} />,
      { transport }
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Ek hizmetler' }))
    expect(await screen.findByTestId('list-row-luggage')).toHaveTextContent('€100')
  })
})
