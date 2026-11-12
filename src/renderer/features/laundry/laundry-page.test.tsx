import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import type { LaundryDeliveryView } from '@shared/contract/procedures/supply'
import { setViewAs } from '@/lib/view-as'
import { contact, emptyFaz12, faz12Transport, type Faz12State } from '@/test/faz12-fake'
import { renderWithProviders } from '@/test/render'
import { LaundryPage } from './laundry-page'
import { monthLast, priceInfo } from './derive'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 30_000 })

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

const delivery = (
  id: string,
  date: string,
  direction: 'in' | 'out',
  items: [string, number, number?][]
): LaundryDeliveryView => ({
  id,
  date: localDate(date),
  direction,
  laundryContactId: 'lau',
  slipNo: null,
  note: null,
  voidedAt: null,
  createdAt: `${date}T10:00:00.000Z`,
  items: items.map(([itemTypeId, qty, stainedQty = 0]) => ({
    itemTypeId,
    qty,
    stainedQty,
    slipUnitPriceMinor: null,
    amountMinor: null
  }))
})

function hotel(): Faz12State {
  const state = emptyFaz12()
  state.contacts.push(
    contact({
      id: 'lau',
      name: 'Örnek Çamaşırhane',
      category: 'laundry',
      phones: [{ label: '', number: '0216 000 00 00' }]
    })
  )
  const price = (itemTypeId: string, validFrom: string, unitPriceMinor: number) =>
    state.prices.push({
      id: `${itemTypeId}-${validFrom}`,
      laundryContactId: 'lau',
      itemTypeId,
      validFrom: localDate(validFrom),
      unitPriceMinor,
      currency: 'TRY',
      createdAt: '2026-09-01T00:00:00.000Z'
    })
  price('lt-sheet', '2026-09-01', 1_500)
  price('lt-sheet', '2026-10-01', 1_650)
  price('lt-big', '2026-09-01', 1_200)
  return state
}

describe('çamaşırhane hesapları', () => {
  it('ayın son günü ve son zam yüzdesi', () => {
    expect(monthLast({ year: 2026, month: 2 })).toBe('2026-02-28')
    expect(monthLast({ year: 2026, month: 12 })).toBe('2026-12-31')
    const info = priceInfo(hotel().prices, 'lt-sheet', TODAY)
    expect(info?.current.unitPriceMinor).toBe(1_650)
    expect(info?.change).toEqual({ basisPoints: 1_000, from: '2026-10-01' })
  })
})

describe('Çamaşırhane', () => {
  it('rehberde çamaşırhane yoksa ne yapılacağını söyler', async () => {
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport: faz12Transport() })
    expect(await screen.findByText('Çamaşırhane kaydı yok')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rehbere git' })).toBeInTheDocument()
  })

  it('örnek temiz fişi klavyeyle satır satır girilir; Enter sonraki kutuya geçer, sonda kaydeder', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('laundry-in'))
    const dialog = await screen.findByRole('dialog')
    const slip = within(dialog).getByTestId('delivery-slip')
    slip.focus()
    // Çarşaf 17 (1 lekeli), Nevresim 11, Yastık kılıfı 27, Büyük havlu 36, Küçük havlu 5, Ayak havlusu 18.
    await userEvent.keyboard(
      'RC10746{Enter}17{Enter}1{Enter}11{Enter}{Enter}27{Enter}{Enter}36{Enter}{Enter}5{Enter}{Enter}18{Enter}{Enter}'
    )
    await waitFor(() =>
      expect(transport.callsTo('laundry.recordDelivery')).toEqual([
        {
          date: '2026-10-04',
          direction: 'in',
          contactId: 'lau',
          slipNo: 'RC10746',
          note: null,
          items: [
            { itemTypeId: 'lt-sheet', qty: 17, stainedQty: 1, slipUnitPriceMinor: null },
            { itemTypeId: 'lt-duvet', qty: 11, stainedQty: 0, slipUnitPriceMinor: null },
            { itemTypeId: 'lt-pillow', qty: 27, stainedQty: 0, slipUnitPriceMinor: null },
            { itemTypeId: 'lt-big', qty: 36, stainedQty: 0, slipUnitPriceMinor: null },
            { itemTypeId: 'lt-small', qty: 5, stainedQty: 0, slipUnitPriceMinor: null },
            { itemTypeId: 'lt-foot', qty: 18, stainedQty: 0, slipUnitPriceMinor: null }
          ]
        }
      ])
    )
  })

  it('lekeli adet gelen adetten fazlaysa kaydetmez ve satırda söyler', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('laundry-in'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByTestId('qty-lt-sheet'), '2')
    await userEvent.type(within(dialog).getByTestId('stained-lt-sheet'), '3')
    await userEvent.click(within(dialog).getByTestId('delivery-save'))
    expect(await within(dialog).findByText('Lekeli adet, gelen adetten fazla olamaz.')).toBeInTheDocument()
    expect(transport.callsTo('laundry.recordDelivery')).toEqual([])
  })

  it('adet 100001 ya da -5 ise tek, sınırı söyleyen metin; not alanı servis sınırında', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('laundry-in'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Not')).toHaveAttribute('maxlength', '500')
    const qty = within(dialog).getByTestId('qty-lt-sheet')
    for (const bad of ['100001', '-5']) {
      await userEvent.clear(qty)
      await userEvent.type(qty, bad)
      await userEvent.click(within(dialog).getByTestId('delivery-save'))
      expect(await within(dialog).findAllByText('0 ile 100.000 arasında bir tam sayı yazın.')).toHaveLength(1)
      expect(within(dialog).queryByText('En az bir türe adet yazın.')).toBeNull()
    }
    expect(transport.callsTo('laundry.recordDelivery')).toEqual([])
  })

  it('giden − gelen: eksik ve fazla gelen parça uyarılır', async () => {
    const state = hotel()
    state.deliveries.push(
      delivery('o1', '2026-10-01', 'out', [
        ['lt-sheet', 20],
        ['lt-big', 30]
      ]),
      delivery('o2', '2026-10-03', 'out', [['lt-sheet', 18]]),
      delivery('i1', '2026-10-02', 'in', [
        ['lt-sheet', 16],
        ['lt-big', 35, 2]
      ])
    )
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport: faz12Transport(state) })
    // Sheets: 38 sent, 16 back → 22 pending; the latest batch (18) is in the wash, 4 from 1 Oct are missing.
    const sheet = await screen.findByTestId('type-lt-sheet')
    expect(
      within(sheet)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['Çarşaf', '38', '16', '0', '18', '4'])
    expect(screen.getByTestId('laundry-missing')).toHaveTextContent('4 parça geri gelmedi')
    // Towels: 30 sent, 35 back → the laundry brought 5 more than it got.
    expect(screen.getByTestId('laundry-extra')).toHaveTextContent('Gönderilenden 5 parça fazla geldi')
    expect(screen.getByTestId('type-lt-big')).toHaveTextContent('5 fazla geldi')
  })

  it('ay hesabı: fatura farkı vurgulanır, "Ödendi" tek gider yazar', async () => {
    const state = hotel()
    state.deliveries.push(
      delivery('i1', '2026-09-10', 'in', [
        ['lt-sheet', 10, 1],
        ['lt-big', 10]
      ])
    )
    const transport = faz12Transport(state)
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport })
    const card = await screen.findByTestId('laundry-settlement')
    // September: 10 × 15 + 10 × 12 = 270.
    expect(await within(card).findByTestId('settlement-computed')).toHaveTextContent('₺270')
    await userEvent.click(within(card).getByTestId('settlement-invoice-open'))
    const dialog = await screen.findByRole('dialog')
    const amount = within(dialog).getByLabelText('Fatura tutarı')
    await userEvent.type(amount, '300')
    fireEvent.blur(amount)
    await userEvent.click(within(dialog).getByTestId('invoice-save'))
    await waitFor(() =>
      expect(transport.callsTo('laundry.settle')).toEqual([
        { contactId: 'lau', year: 2026, month: 9, invoicedTotalMinor: 30_000, note: null, paid: false }
      ])
    )
    expect(await within(card).findByTestId('invoice-difference')).toHaveTextContent(
      'Fatura hesaplanandan ₺30 fazla'
    )
    await userEvent.click(within(card).getByTestId('settlement-mark-paid'))
    await userEvent.click(await screen.findByTestId('paid-confirm'))
    await waitFor(() => expect(transport.callsTo('laundry.settle')).toHaveLength(2))
    expect(transport.callsTo('laundry.settle')[1]).toMatchObject({ paid: true, invoicedTotalMinor: 30_000 })
    expect(await within(card).findByTestId('settlement-paid')).toBeInTheDocument()
  })

  it('telefonda salt okunur: temiz/kirli giriş düğmeleri yok, türler kart olarak', async () => {
    phone()
    await renderWithProviders(<LaundryPage today={TODAY} />, { transport: faz12Transport(hotel()) })
    expect(await screen.findByTestId('type-lt-sheet')).toBeInTheDocument()
    expect(screen.queryByTestId('laundry-in')).toBeNull()
    expect(screen.queryByTestId('price-open')).toBeNull()
  })
})
