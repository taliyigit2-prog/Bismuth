import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { today } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { adminTransport } from './admin-fake'
import { RoomsSection } from './rooms-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.restoreAllMocks())

const render = (transport = adminTransport()) =>
  renderWithProviders(<RoomsSection values={SETTINGS_DEFAULTS} />, { transport })

describe('Odalar ve tipler', () => {
  it('kullanılan tipler fiyatlarıyla, odalar toplam oda ve yatakla görünür', async () => {
    await render()
    const double = await screen.findByTestId('type-double')
    expect(within(double).getByText('₺2.800')).toBeInTheDocument()
    expect(within(double).getByText('₺3.200')).toBeInTheDocument()
    expect(screen.queryByTestId('type-single')).not.toBeInTheDocument()
    expect(screen.getByTestId('room-summary')).toHaveTextContent('3 oda7 yatak3 satılabilir')
    // A type rooms use cannot be switched off from the list.
    expect(within(double).getByRole('switch')).toBeDisabled()
  })

  it('"Toplu ekle" kat kat numara üretir, var olanları atlar ve geçerlilik tarihiyle ekler', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('bulk-rooms'))
    // Starts on the floor above the highest one in use.
    const first = await screen.findByTestId('bulk-first')
    expect(first).toHaveValue(3)
    await user.clear(first)
    await user.type(first, '1')
    const last = screen.getByTestId('bulk-last')
    await user.clear(last)
    await user.type(last, '2')
    const per = screen.getByTestId('bulk-per')
    await user.clear(per)
    await user.type(per, '2')
    const preview = screen.getByTestId('bulk-preview')
    expect(
      within(preview)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['202'])
    expect(screen.getByText('Zaten var, atlanır: 101, 102, 201')).toBeInTheDocument()
    expect(screen.getByTestId('bulk-valid-from')).toHaveTextContent(
      'Geçmiş ayların doluluk ve bakanlık istatistiği'
    )
    await user.click(screen.getByRole('button', { name: '1 oda ekle' }))
    await waitFor(() =>
      expect(transport.callsTo('rooms.createMany')).toEqual([
        {
          rooms: [
            {
              number: '202',
              floor: '2',
              roomTypeId: 'type-double',
              beds: 2,
              sellable: true,
              sort: 0,
              validFrom: today()
            }
          ]
        }
      ])
    )
    expect(await screen.findByTestId('room-202')).toBeInTheDocument()
  })

  it('yatak sayısı değişince geçerlilik tarihi sorulur; yalnız ad/kat değişince sorulmaz', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Odayı düzenle: 201' }))
    expect(screen.queryByTestId('room-valid-from')).not.toBeInTheDocument()
    const beds = await screen.findByTestId('room-beds')
    await user.clear(beds)
    await user.type(beds, '4')
    expect(screen.getByTestId('room-valid-from')).toBeInTheDocument()
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('rooms.update')).toEqual([
        { id: 'room-201', patch: { beds: 4, validFrom: today() } }
      ])
    )
  })

  it('aynı numara ikinci kez eklenmez', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-room'))
    await user.type(await screen.findByTestId('room-number'), '101')
    await user.click(screen.getByTestId('dialog-save'))
    expect(await screen.findByText('Bu oda numarası zaten var.')).toBeInTheDocument()
    expect(transport.callsTo('rooms.create')).toEqual([])
  })

  it('otelin kendi tipi fiyatlarıyla eklenir', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-type'))
    await user.type(await screen.findByTestId('type-name'), 'Aile odası')
    await user.type(screen.getByLabelText('Hafta içi fiyatı'), '4.000')
    await user.type(screen.getByLabelText('Hafta sonu fiyatı'), '4.500')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('rooms.createType')).toEqual([
        {
          name: 'Aile odası',
          group: 'custom',
          basePriceMinor: 400_000,
          weekendPriceMinor: 450_000,
          baseCurrency: 'TRY'
        }
      ])
    )
  })

  it('aynı ad ikinci kez verilirse alanın altında söylenir; bildirim çıkmaz', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-type'))
    await user.type(await screen.findByTestId('type-name'), 'Süit')
    await user.click(screen.getByTestId('dialog-save'))
    expect(await screen.findByText('Bu ad zaten kullanılıyor. Başka bir ad yazın.')).toBeInTheDocument()
    expect(screen.getByTestId('type-name')).toHaveAttribute('aria-invalid', 'true')
    await user.type(screen.getByTestId('type-name'), ' 2')
    expect(screen.queryByText('Bu ad zaten kullanılıyor. Başka bir ad yazın.')).not.toBeInTheDocument()
  })

  it('kapatılan özel tip tabloda soluk satır olarak kalır ve yeniden açılabilir', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-type'))
    await user.type(await screen.findByTestId('type-name'), 'Aile odası')
    await user.click(screen.getByTestId('dialog-save'))
    const row = await screen.findByRole('row', { name: /Aile odası/ })
    await user.click(within(row).getByRole('switch'))
    await waitFor(() => expect(transport.callsTo('rooms.updateType').length).toBe(1))
    const faded = await screen.findByRole('row', { name: /Aile odası/ })
    expect(faded).toHaveClass('opacity-60')
    expect(within(faded).getByText('Kapalı')).toBeInTheDocument()
    await user.click(within(faded).getByRole('switch'))
    await waitFor(() => expect(screen.getByRole('row', { name: /Aile odası/ })).not.toHaveClass('opacity-60'))
  })

  it('hazır tiplerden biri kullanıma alınır', async () => {
    const transport = adminTransport()
    await render(transport)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Hazır tiplerden seç' }))
    await user.click(await screen.findByRole('button', { name: 'Kullan: Süit' }))
    await waitFor(() =>
      expect(transport.callsTo('rooms.updateType')).toEqual([{ id: 'type-suite', patch: { active: true } }])
    )
    expect(await screen.findByTestId('type-suite')).toBeInTheDocument()
  })

  it('toplu eklemede yanlış kat hemen söylenir; 500 odadan fazlası bir seferde eklenmez', async () => {
    await render()
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('bulk-rooms'))
    const first = await screen.findByTestId('bulk-first')
    const last = screen.getByTestId('bulk-last')
    const per = screen.getByTestId('bulk-per')
    // The last floor under the first: said at once, though the save button cannot be pressed.
    await user.clear(last)
    await user.type(last, '1')
    expect(screen.getByTestId('bulk-error')).toHaveTextContent('son kat ilk kattan küçük olamaz')
    expect(last).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('dialog-save')).toBeDisabled()
    await user.clear(first)
    await user.type(first, '1')
    await user.clear(last)
    await user.type(last, '10')
    await user.clear(per)
    await user.type(per, '60')
    expect(screen.queryByTestId('bulk-error')).not.toBeInTheDocument()
    // 600 numbers, 3 of them in use: 597 new — more than one save may add.
    expect(screen.getByTestId('bulk-too-many')).toHaveTextContent('en çok 500 oda')
    const preview = within(screen.getByTestId('bulk-preview')).getAllByRole('listitem')
    expect(preview).toHaveLength(501)
    expect(preview.at(-1)).toHaveTextContent('ve 97 numara daha')
    expect(screen.getByTestId('dialog-save')).toBeDisabled()
  })

  it('planlı kapasite değişikliği ve açılış tarihi satırda; geçmiş diyalogda görünür, plan geri alınır (K-27)', async () => {
    const later = '2099-12-01'
    const planned = {
      id: 'cap-plan',
      roomId: 'room-101',
      validFrom: later,
      active: true,
      sellable: true,
      beds: 3,
      note: 'ek yatak',
      createdAt: '2026-10-05T09:00:00.000Z',
      createdBy: null,
      cancelledAt: null,
      cancelledBy: null
    }
    const opening = { ...planned, id: 'cap-open', validFrom: '2026-01-01', beds: 2, note: null }
    const transport = adminTransport({
      state: {
        rooms: [
          {
            id: 'room-101',
            number: '101',
            floor: '1',
            roomTypeId: 'type-double',
            beds: 2,
            sellable: true,
            notes: null,
            sort: 0,
            active: true,
            nextChange: { id: 'cap-plan', validFrom: later, active: true, sellable: true, beds: 3 }
          },
          {
            id: 'room-601',
            number: '601',
            floor: '6',
            roomTypeId: 'type-double',
            beds: 2,
            sellable: true,
            notes: null,
            sort: 0,
            active: false,
            opensOn: later
          }
        ],
        capacity: { 'room-101': [planned, opening] }
      }
    })
    await render(transport)
    const user = userEvent.setup()
    expect(await screen.findByTestId('planned-101')).toHaveTextContent('3 yatak · satışta')
    expect(screen.getByTestId('room-601')).toHaveTextContent('açılır')
    // Only rooms in use today count.
    expect(screen.getByTestId('room-summary')).toHaveTextContent('1 oda2 yatak')
    await user.click(screen.getByRole('button', { name: 'Odayı düzenle: 101' }))
    const history = await screen.findByTestId('capacity-history')
    expect(within(history).getByTestId(`capacity-${later}`)).toHaveTextContent('Planlı')
    expect(within(history).getByText('ek yatak')).toBeInTheDocument()
    // The opening row cannot be withdrawn; the plan can.
    expect(within(history).queryByTestId('withdraw-2026-01-01')).not.toBeInTheDocument()
    // A change from an earlier day replaces the plan, and the dialog says so.
    const beds = screen.getByTestId('room-beds')
    await user.clear(beds)
    await user.type(beds, '1')
    expect(screen.getByTestId('replaces-plan')).toHaveTextContent('3 yatak · satışta')
    await user.click(within(history).getByTestId(`withdraw-${later}`))
    await waitFor(() => expect(transport.callsTo('rooms.cancelCapacityChange')).toEqual([{ id: 'cap-plan' }]))
    expect(await within(history).findByText('Geri alındı')).toBeInTheDocument()
  })

  it('ekranda tek dolu düğme var: "Oda ekle"; "Tip ekle" ikincil', async () => {
    await render()
    expect(await screen.findByTestId('add-type')).toHaveAttribute('data-variant', 'outline')
    expect(screen.getByTestId('add-room')).toHaveAttribute('data-variant', 'default')
  })
})
