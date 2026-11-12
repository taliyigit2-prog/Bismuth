import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { setViewAs } from '@/lib/view-as'
import { contact, emptyFaz12, faz12Transport, type Faz12State } from '@/test/faz12-fake'
import { renderWithProviders } from '@/test/render'
import { SupplyPage } from './supply-page'
import { lineAmount, parseQty, unitFromAmount } from './derive'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

const TODAY = localDate('2026-10-04')

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

/** Munzur 0,5 L bought at 60 in September, at 65 in October (the faz-12 example). */
function munzur(): Faz12State {
  const state = emptyFaz12()
  state.contacts.push(contact({ id: 'sup', name: 'Munzur Su Bayii', category: 'supplier' }))
  state.products.push({
    id: 'water',
    name: 'Munzur 0,5 L',
    categoryId: 'cat-drinks',
    supplierContactId: 'sup',
    unit: 'piece',
    trackStock: false,
    stockQtyMilli: null,
    active: true
  })
  const buy = (id: string, date: string, unit: number) =>
    state.purchases.push({
      id,
      date: localDate(date),
      amountMinor: 40 * unit,
      currency: 'TRY',
      description: 'Munzur Su Bayii',
      vendorContactId: 'sup',
      vendorName: 'Munzur Su Bayii',
      paidFromDrawer: false,
      methodId: null,
      sectionCode: 'general',
      voidedAt: null,
      voidReason: null,
      createdAt: `${date}T10:00:00.000Z`,
      items: [
        { id: `${id}-1`, productId: 'water', qtyMilli: 40_000, unitPriceMinor: unit, amountMinor: 40 * unit }
      ]
    })
  buy('e1', '2026-09-20', 6_000)
  buy('e2', '2026-10-02', 6_500)
  return state
}

describe('tedarik hesapları', () => {
  it('miktar binde birim; satır tutarı ve elle yazılan tutardan birim fiyat para modülüyle', () => {
    expect(parseQty('40', 'tr')).toBe(40_000)
    expect(parseQty('1,5', 'tr')).toBe(1_500)
    expect(parseQty('1.5', 'en')).toBe(1_500)
    expect(parseQty('0', 'tr')).toBeNull()
    // A lone dot in Turkish is a decimal mark unless three digits follow (thousands): 1.5 kg is not 15 kg.
    expect(parseQty('1.5', 'tr')).toBe(1_500)
    expect(parseQty('1.500', 'tr')).toBe(1_500_000)
    expect(parseQty('1.250,5', 'tr')).toBe(1_250_500)
    expect(parseQty('2,5', 'en')).toBe(2_500)
    expect(parseQty('1,500', 'en')).toBe(1_500_000)
    expect(lineAmount(6_000, 40_000, 'TRY')).toBe(240_000)
    expect(unitFromAmount(240_000, 40_000, 'TRY')).toBe(6_000)
  })
})

describe('Tedarik', () => {
  it('ürün yoksa boş durum nasıl başlanacağını söyler', async () => {
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport: faz12Transport() })
    expect(await screen.findByText('Henüz ürün yok')).toBeInTheDocument()
    expect(screen.getByTestId('product-add')).toBeInTheDocument()
  })

  it('ikinci alımda 65 TL: ürün satırında "+%8,3 zam" rozeti; fiyat geçmişi açılır', async () => {
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport: faz12Transport(munzur()) })
    const row = await screen.findByTestId('product-water')
    expect(within(row).getByTestId('price-rise')).toHaveTextContent('+%8,3 zam')
    expect(row).toHaveTextContent('₺65')
    expect(row).toHaveTextContent('₺60')
    await userEvent.click(within(row).getByRole('button', { name: 'Munzur 0,5 L' }))
    const sheet = await screen.findByTestId('price-history')
    expect(within(sheet).getByTestId('price-rise')).toHaveTextContent('+%8,3 zam · +₺5')
  })

  it('teslim fişi: 40 × 60 = 2.400 tek gider olarak yazılır', async () => {
    const state = munzur()
    state.purchases = []
    const transport = faz12Transport(state)
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('purchase-open'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByTestId('purchase-product'))
    await userEvent.click(await screen.findByRole('option', { name: 'Munzur 0,5 L' }))
    await userEvent.type(within(dialog).getByTestId('purchase-qty'), '40')
    const unit = within(dialog).getByLabelText('Birim fiyat')
    await userEvent.type(unit, '60')
    fireEvent.blur(unit)
    await waitFor(() => expect(within(dialog).getByLabelText('Tutar')).toHaveValue('2.400'))
    expect(within(dialog).getByTestId('purchase-total')).toHaveTextContent('₺2.400')
    await userEvent.click(within(dialog).getByTestId('purchase-save'))
    await waitFor(() =>
      expect(transport.callsTo('supply.recordPurchase')).toEqual([
        expect.objectContaining({
          date: '2026-10-04',
          amountMinor: 240_000,
          currency: 'TRY',
          sectionId: 'sec-general',
          methodId: 'm-cash',
          vendorContactId: 'sup',
          description: 'Munzur Su Bayii',
          items: [{ productId: 'water', qtyMilli: 40_000, unitPriceMinor: 6_000 }]
        })
      ])
    )
  })

  it('miktar servis sınırını (1.000.000) aşarsa alanın altında söylenir; ürün adı 120 karakter', async () => {
    const state = munzur()
    const transport = faz12Transport(state)
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('purchase-open'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByTestId('purchase-product'))
    await userEvent.click(await screen.findByRole('option', { name: 'Munzur 0,5 L' }))
    await userEvent.type(within(dialog).getByTestId('purchase-qty'), '99999999999')
    expect(within(dialog).getByText('En çok 1.000.000 olabilir.')).toBeInTheDocument()
    expect(within(dialog).getByTestId('purchase-qty')).toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(within(dialog).getByTestId('purchase-save'))
    expect(transport.callsTo('supply.recordPurchase')).toEqual([])
    await userEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))

    await userEvent.click(await screen.findByTestId('product-add'))
    const product = await screen.findByRole('dialog')
    expect(within(product).getByLabelText('Ürün adı')).toHaveAttribute('maxlength', '120')
  })

  it('elle yazılan satır tutarı aynen gider: 2,75 × ? = 1.000 TL, toplam 1.000 TL (P10fix #8)', async () => {
    const state = munzur()
    state.purchases = []
    const transport = faz12Transport(state)
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('purchase-open'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByTestId('purchase-product'))
    await userEvent.click(await screen.findByRole('option', { name: 'Munzur 0,5 L' }))
    await userEvent.type(within(dialog).getByTestId('purchase-qty'), '2,75')
    const amount = within(dialog).getByLabelText('Tutar')
    await userEvent.type(amount, '1000')
    fireEvent.blur(amount)
    await waitFor(() => expect(within(dialog).getByTestId('purchase-total')).toHaveTextContent('₺1.000'))
    await userEvent.click(within(dialog).getByTestId('purchase-save'))
    await waitFor(() =>
      expect(transport.callsTo('supply.recordPurchase')).toEqual([
        expect.objectContaining({
          amountMinor: 100_000,
          items: [{ productId: 'water', qtyMilli: 2_750, unitPriceMinor: 36_364, amountMinor: 100_000 }]
        })
      ])
    )
  })

  it('alım gerekçeyle iptal edilir; iptal edilen alım listede çizili kalır', async () => {
    const transport = faz12Transport(munzur())
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByRole('tab', { name: 'Alımlar' }))
    const item = await screen.findByTestId('purchase-e2')
    await userEvent.click(within(item).getByRole('button', { name: 'Alımı iptal et' }))
    const alert = await screen.findByRole('alertdialog')
    await userEvent.type(within(alert).getByLabelText('İptal nedeni'), 'fiş iki kez girildi')
    await userEvent.click(within(alert).getByRole('button', { name: 'Alımı iptal et' }))
    await waitFor(() =>
      expect(transport.callsTo('supply.voidPurchase')).toEqual([{ id: 'e2', reason: 'fiş iki kez girildi' }])
    )
    expect(
      await within(await screen.findByTestId('purchase-e2')).findByText('İptal edildi')
    ).toBeInTheDocument()
  })

  it('telefonda salt okunur: alım ve ürün formu yok, kartlar var', async () => {
    phone()
    await renderWithProviders(<SupplyPage today={TODAY} />, { transport: faz12Transport(munzur()) })
    expect(await screen.findByTestId('product-card-water')).toBeInTheDocument()
    expect(screen.queryByTestId('purchase-open')).toBeNull()
    expect(screen.queryByTestId('product-add')).toBeNull()
  })
})
