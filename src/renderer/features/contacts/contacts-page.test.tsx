import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ApiError } from '@/lib/transport/types'
import { setViewAs } from '@/lib/view-as'
import { contact, emptyFaz12, faz12Transport } from '@/test/faz12-fake'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { ContactsPage } from './contacts-page'

// The whole suite runs in parallel; give slow machines time before a findBy gives up.
configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

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

function hotel() {
  const state = emptyFaz12()
  state.contacts.push(
    contact({
      id: 'c1',
      name: 'Damacana Ahmet',
      category: 'custom',
      customCategory: 'Sucu',
      phones: [{ label: 'cep', number: '0532 000 00 01' }]
    }),
    contact({
      id: 'c2',
      name: 'Sucu Mehmet',
      category: 'supplier',
      phones: [{ label: '', number: '0532 000 00 02' }]
    }),
    contact({
      id: 'c3',
      name: 'Ambulans',
      category: 'emergency',
      phones: [{ label: '', number: '112' }],
      favorite: true
    }),
    contact({ id: 'c4', name: 'Usta Tesisat', category: 'plumber', note: '7/24 acil' })
  )
  return state
}

const rowNames = (): string[] =>
  within(screen.getByTestId('contact-list'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[1]!.textContent ?? '')

describe('Rehber', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const transport = faz12Transport()
    transport.call = () => new Promise(() => {})
    await renderWithProviders(<ContactsPage />, { transport })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('veri okunamazsa yeniden dene düğmesi çıkar', async () => {
    const base = fakeTransport()
    const transport = {
      ...base,
      call: (name: string, input: unknown) =>
        name === 'contacts.list'
          ? Promise.reject(new ApiError('INTERNAL', 500, 'errors.internal'))
          : base.call(name as never, input as never)
    }
    await renderWithProviders(<ContactsPage />, { transport: transport as never })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('rehber boşsa boş durumu anlatır', async () => {
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport() })
    expect(await screen.findByText('Rehber boş')).toBeInTheDocument()
  })

  it('favoriler önce gelir; "sucu" araması ad ve otelin kendi kategorisi üzerinden bulur', async () => {
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    await screen.findByTestId('contact-list')
    expect(rowNames()[0]).toBe('Ambulans')
    await userEvent.type(screen.getByTestId('contact-search'), 'sucu')
    expect(rowNames()).toEqual(['Damacana Ahmet', 'Sucu Mehmet'])
    await userEvent.clear(screen.getByTestId('contact-search'))
    await userEvent.type(screen.getByTestId('contact-search'), '7/24')
    expect(rowNames()).toEqual(['Usta Tesisat'])
  })

  it('numaraya tıklayınca kopyalanır (masaüstünde arama yok)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    await userEvent.click(await screen.findByRole('button', { name: /Ambulans numarasını kopyala: 112/ }))
    expect(writeText).toHaveBeenCalledWith('112')
  })

  it('pano yokken (HTTP) kopyalanamazsa hata atmaz, "elle seçip kopyalayın" der', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true, writable: true })
    const error = vi.spyOn(toast, 'error')
    const success = vi.spyOn(toast, 'success')
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    await userEvent.click(await screen.findByRole('button', { name: /Ambulans numarasını kopyala: 112/ }))
    await waitFor(() => expect(error).toHaveBeenCalledWith('Kopyalanamadı. Metni elle seçip kopyalayın.'))
    expect(success).not.toHaveBeenCalled()
    Object.defineProperty(document, 'execCommand', { value: undefined, configurable: true, writable: true })
  })

  it('yıldız favori yapar; yeni kişi birden çok numarayla kaydedilir', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<ContactsPage />, { transport })
    await userEvent.click(await screen.findByRole('button', { name: 'Usta Tesisat: favorilere ekle' }))
    await waitFor(() =>
      expect(transport.callsTo('contacts.update')).toEqual([{ id: 'c4', patch: { favorite: true } }])
    )

    await userEvent.click(screen.getByTestId('contact-add'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText('Kişi / firma adı'), 'Durak Taksi')
    await userEvent.type(within(dialog).getByLabelText('1. numaranın etiketi'), 'durak')
    await userEvent.type(within(dialog).getByLabelText('1. numara'), '0212 000 00 00')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Numara ekle' }))
    await userEvent.type(within(dialog).getByLabelText('2. numara'), '0532 999 99 99')
    await userEvent.click(within(dialog).getByTestId('contact-save'))
    await waitFor(() =>
      expect(transport.callsTo('contacts.create')).toEqual([
        expect.objectContaining({
          name: 'Durak Taksi',
          category: 'supplier',
          phones: [
            { label: 'durak', number: '0212 000 00 00' },
            { label: '', number: '0532 999 99 99' }
          ]
        })
      ])
    )
  })

  it('CSV içe aktarma önce gösterir, sonra tek seferde ekler; sorunlu satırı numarasıyla söyler', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<ContactsPage />, { transport })
    await userEvent.click(await screen.findByRole('button', { name: 'İçe aktar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByTestId('import-text'),
      'Klima Servisi;0216 000 00 00;Klimacı{enter};0532;'
    )
    expect(within(dialog).getByText('Eklenecek: 1 kişi')).toBeInTheDocument()
    expect(within(dialog).getByTestId('import-problems')).toHaveTextContent('2. satır: ad yok.')
    await userEvent.click(within(dialog).getByTestId('import-run'))
    await waitFor(() =>
      expect(transport.callsTo('contacts.import')).toEqual([
        {
          contacts: [
            {
              name: 'Klima Servisi',
              phones: [{ label: '', number: '0216 000 00 00' }],
              category: 'custom',
              customCategory: 'Klimacı'
            }
          ]
        }
      ])
    )
  })

  it('içe aktarmada hiç yeni kişi yoksa başarı değil bilgi: "Yeni kişi yok; 1 ad zaten rehberde"', async () => {
    const info = vi.spyOn(toast, 'info')
    const success = vi.spyOn(toast, 'success')
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    await userEvent.click(await screen.findByRole('button', { name: 'İçe aktar' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByTestId('import-text'), 'Sucu Mehmet;0532 000 00 02;Tedarikçi')
    await userEvent.click(within(dialog).getByTestId('import-run'))
    await waitFor(() =>
      expect(info).toHaveBeenCalledWith('Yeni kişi yok; 1 ad zaten rehberde', { description: 'Sucu Mehmet' })
    )
    expect(success).not.toHaveBeenCalled()
  })

  it('ad, adres ve not alanları servisin sınırını taşır (120 / 500 / 1000)', async () => {
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    await userEvent.click(await screen.findByTestId('contact-add'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Kişi / firma adı')).toHaveAttribute('maxlength', '120')
    expect(within(dialog).getByLabelText('Adres')).toHaveAttribute('maxlength', '500')
    expect(within(dialog).getByLabelText('Not')).toHaveAttribute('maxlength', '1000')
    expect(within(dialog).getByLabelText('1. numara')).toHaveAttribute('maxlength', '40')
  })

  it('servisin kabul etmeyeceği ad gönderilmez; hata genel uyarı değil, alanın altında (sözleşme şemasından)', async () => {
    const error = vi.spyOn(toast, 'error')
    const transport = faz12Transport(hotel())
    await renderWithProviders(<ContactsPage />, { transport })
    await userEvent.click(await screen.findByTestId('contact-add'))
    const dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByLabelText('Kişi / firma adı')
    // A pasted text in a browser that ignores maxlength, say.
    name.removeAttribute('maxlength')
    await userEvent.click(name)
    await userEvent.paste('Ç'.repeat(121))
    await userEvent.click(within(dialog).getByTestId('contact-save'))
    expect(await within(dialog).findByText('En çok 120 karakter yazabilirsiniz.')).toBeInTheDocument()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(transport.callsTo('contacts.create')).toEqual([])
    expect(error).not.toHaveBeenCalled()
  })

  it('telefonda kartlar: numara dokununca aranır; görüntüleyen rol kişi ekleyemez', async () => {
    phone()
    act(() => setViewAs('housekeeping'))
    await renderWithProviders(<ContactsPage />, { transport: faz12Transport(hotel()) })
    const list = await screen.findByTestId('contact-list')
    expect(within(list).getByRole('link', { name: /Ambulans ara: 112/ })).toHaveAttribute('href', 'tel:112')
    expect(screen.queryByTestId('contact-add')).toBeNull()
  })
})
