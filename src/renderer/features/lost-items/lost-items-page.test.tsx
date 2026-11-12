import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import type { LostItemView } from '@shared/contract/procedures/contacts'
import { setViewAs } from '@/lib/view-as'
import { emptyFaz12, faz12Transport, type Faz12State } from '@/test/faz12-fake'
import { renderWithProviders } from '@/test/render'
import { LostItemsPage } from './lost-items-page'

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

const item = (partial: Partial<LostItemView> & Pick<LostItemView, 'id' | 'description'>): LostItemView => ({
  foundAt: '2026-10-01T10:00',
  roomId: null,
  roomNumber: null,
  locationText: 'Lobi',
  foundBy: 'Ayşe',
  storageLocation: 'Resepsiyon çekmecesi',
  status: 'stored',
  returnedTo: null,
  returnedAt: null,
  note: null,
  createdByName: 'Deniz Arslan',
  createdAt: '2026-10-01T07:00:00.000Z',
  statusChange: null,
  ...partial
})

function hotel(): Faz12State {
  const state = emptyFaz12()
  state.lost.push(
    item({ id: 'l1', description: 'Siyah şarj aleti', roomId: 'r1', roomNumber: '204', locationText: null }),
    item({
      id: 'l2',
      description: 'Mavi şemsiye',
      status: 'returned',
      returnedTo: 'Kemal Yılmaz',
      returnedAt: '2026-10-03T15:30',
      statusChange: { at: '2026-10-03T12:31:00.000Z', byName: 'Deniz Arslan', reason: null }
    })
  )
  return state
}

describe('Kayıp eşya', () => {
  it('kayıt yoksa boş durumu anlatır', async () => {
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport: faz12Transport() })
    expect(await screen.findByText('Kayıp eşya kaydı yok')).toBeInTheDocument()
  })

  it('saklananlar önce görünür; "Tümü" verileni kime ve ne zaman verildiğiyle gösterir', async () => {
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport: faz12Transport(hotel()) })
    const table = await screen.findByTestId('lost-table')
    expect(within(table).getByText('Siyah şarj aleti')).toBeInTheDocument()
    expect(within(table).queryByText('Mavi şemsiye')).toBeNull()
    expect(within(table).getByText('Oda 204')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Tümü/ }))
    expect(within(table).getByText('Verildi: Kemal Yılmaz · 3 Eki 15:30')).toBeInTheDocument()
  })

  it('"Sahibine ver" kime ve ne zaman ile kaydedilir', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('return-l1'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByTestId('return-to'), 'Misafir Ayla Demir')
    const time = within(dialog).getByLabelText('Saat')
    await userEvent.clear(time)
    await userEvent.type(time, '14:20')
    await userEvent.click(within(dialog).getByTestId('return-save'))
    await waitFor(() =>
      expect(transport.callsTo('lostItems.markReturned')).toEqual([
        { id: 'l1', input: { returnedTo: 'Misafir Ayla Demir', returnedAt: '2026-10-04T14:20', note: null } }
      ])
    )
  })

  it('teslimde geçersiz saat ("25") kaydedilmez ve "Saati 14:30 gibi yazın" iletisi görünür (QA2c #10)', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('return-l1'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByTestId('return-to'), 'Misafir Ayla Demir')
    const time = within(dialog).getByLabelText('Saat')
    await userEvent.clear(time)
    await userEvent.type(time, '25')
    await userEvent.click(within(dialog).getByTestId('return-save'))
    const alert = await within(dialog).findByText('Saati 14:30 gibi yazın.')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(time).toHaveAttribute('aria-describedby', alert.id)
    expect(transport.callsTo('lostItems.markReturned')).toEqual([])
  })

  it('kaydın ayrıntısı durumu değiştireni ve zamanını gösterir', async () => {
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport: faz12Transport(hotel()) })
    await userEvent.click(await screen.findByRole('radio', { name: /Verildi/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mavi şemsiye' }))
    const sheet = await screen.findByTestId('lost-detail')
    expect(within(sheet).getByTestId('lost-returned-to')).toHaveTextContent('Kemal Yılmaz')
    expect(within(sheet).getByTestId('lost-changed-by')).toHaveTextContent('Deniz Arslan')
  })

  it('yeni kayıt: zorunlu alanlar söylenir, sonra ortak alanda bulunan eşya yazılır', async () => {
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport })
    await userEvent.click(await screen.findByTestId('lost-add'))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByTestId('lost-save'))
    expect(within(dialog).getByText('Eşyayı kısaca yazın.')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByTestId('lost-what'), 'Gözlük kılıfı')
    await userEvent.type(within(dialog).getByTestId('lost-place'), 'Kahvaltı salonu')
    await userEvent.type(within(dialog).getByTestId('lost-storage'), 'Kasa')
    await userEvent.click(within(dialog).getByTestId('lost-save'))
    await waitFor(() =>
      expect(transport.callsTo('lostItems.create')).toEqual([
        expect.objectContaining({
          description: 'Gözlük kılıfı',
          locationText: 'Kahvaltı salonu',
          roomId: null,
          storageLocation: 'Kasa'
        })
      ])
    )
  })

  it('elden çıkarma gerekçe ister; telefonda kartlar', async () => {
    phone()
    const transport = faz12Transport(hotel())
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport })
    const card = await screen.findByTestId('lost-l1')
    await userEvent.click(within(card).getByRole('button', { name: 'Elden çıkar: Siyah şarj aleti' }))
    const alert = await screen.findByRole('alertdialog')
    expect(within(alert).getByTestId('lost-dispose-confirm')).toBeDisabled()
    await userEvent.type(within(alert).getByLabelText('Neden'), '3 ay doldu')
    await userEvent.click(within(alert).getByTestId('lost-dispose-confirm'))
    await waitFor(() =>
      expect(transport.callsTo('lostItems.markDisposed')).toEqual([{ id: 'l1', reason: '3 ay doldu' }])
    )
  })

  it('görüntüleyen rol kayıt ekleyemez', async () => {
    act(() => setViewAs('housekeeping'))
    await renderWithProviders(<LostItemsPage today={TODAY} />, { transport: faz12Transport(hotel()) })
    await screen.findByTestId('lost-table')
    expect(screen.queryByTestId('lost-add')).toBeNull()
    expect(screen.queryByTestId('return-l1')).toBeNull()
  })
})
