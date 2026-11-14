import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import {
  defaultHousekeeping,
  housekeepingTransport,
  type HousekeepingState
} from '@/features/issues/housekeeping-fake'
import { planRoom } from './room-model'
import { RoomsPage } from './rooms-page'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

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

const render = (state: HousekeepingState = defaultHousekeeping(), opts = {}) => {
  const transport = housekeepingTransport(state, opts)
  return renderWithProviders(<RoomsPage />, { transport }).then((r) => ({ ...r, transport }))
}

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

describe('oda kutusu', () => {
  it('misafir adı görünmeyen rolde dolu oda "Dolu" der; arıza sayısı kutuya geçer', () => {
    const state = defaultHousekeeping()
    const occupied = { ...state.rooms[1]!, guest: null }
    expect(planRoom(occupied, 'Standart', 'Dolu')).toMatchObject({ guest: 'Dolu', departing: true, floor: 1 })
    expect(planRoom(state.rooms[5]!, 'Standart', 'Dolu')).toMatchObject({ guest: null, issues: 1, floor: 2 })
  })
})

describe('oda durumu', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    await renderWithProviders(<RoomsPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('veri okunamazsa yeniden dene düğmesi çıkar', async () => {
    await render(defaultHousekeeping(), { failBoard: true })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('oda tanımlı değilse boş durumu anlatır', async () => {
    await render({ ...defaultHousekeeping(), rooms: [] })
    expect(await screen.findByText('Henüz oda yok')).toBeInTheDocument()
  })

  it('kat planı tüm odaları gösterir; durum süzgeci sayılarıyla odaları daraltır', async () => {
    const user = userEvent.setup()
    const state = defaultHousekeeping()
    await render(state)
    const plan = await screen.findByTestId('floor-plan')
    for (const room of state.rooms)
      expect(within(plan).getByTestId(`plan-room-${room.number}`)).toBeInTheDocument()
    expect(screen.getByText(/kendiliğinden “Kirli” olur/)).toBeInTheDocument()
    const dirtyChip = within(screen.getByTestId('hk-filter')).getByRole('radio', { name: /^Kirli/ })
    expect(dirtyChip).toHaveTextContent('Kirli2')
    await user.click(dirtyChip)
    expect(within(screen.getByTestId('floor-plan')).getAllByRole('button')).toHaveLength(2)
  })

  it('liste görünümü notu, misafiri ve son değiştireni gösterir', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByTestId('floor-plan')
    await user.click(screen.getByRole('radio', { name: 'Liste' }))
    const list = screen.getByTestId('room-list')
    expect(within(list).getByTestId('room-row-101')).toHaveTextContent('Çarşaf eksik')
    expect(within(list).getByTestId('room-row-101')).toHaveTextContent('Deniz Arslan')
    expect(within(list).getByTestId('room-row-102')).toHaveTextContent('Örnek Yılmaz')
    expect(within(list).getByTestId('room-row-203')).toHaveTextContent('1 açık arıza')
  })

  it('odaya tıklayınca tek tıkla durum değişir; kim/ne zaman ve arızaları gösterir', async () => {
    const user = userEvent.setup()
    const saved = vi.spyOn(toast, 'success')
    const { transport } = await render()
    await user.click(await screen.findByTestId('plan-room-203'))
    const sheet = await screen.findByTestId('room-sheet')
    expect(await within(sheet).findByText('Klozet kapağı kırık')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Kirli' }))
    expect(transport.calls.find((c) => c.name === 'housekeeping.setStatus')?.input).toEqual({
      roomId: 'room-203',
      status: 'dirty'
    })
    await vi.waitFor(() => expect(saved).toHaveBeenCalledWith('Oda 203 “Kirli” olarak işaretlendi'))
    expect(await within(sheet).findByText(/Son değişiklik: Otel Sahibi/)).toBeInTheDocument()
  })

  it('bakıma alınan oda takvimde blok alır; not ayrıca kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('plan-room-201'))
    const sheet = await screen.findByTestId('room-sheet')
    await user.click(within(sheet).getByRole('button', { name: 'Bakımda' }))
    expect(await within(sheet).findByTestId('room-block')).toHaveTextContent('Satılmaz')
    await user.type(within(sheet).getByLabelText('Not'), 'Klima değişiyor')
    await user.click(within(sheet).getByRole('button', { name: 'Notu kaydet' }))
    await vi.waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'housekeeping.setNote')?.input).toEqual({
        roomId: 'room-201',
        note: 'Klima değişiyor'
      })
    )
  })

  it('dolu odaya blok açılamayınca yeniden seçmeyi hatırlatan görev yazılır (H-45)', async () => {
    const user = userEvent.setup()
    const { transport } = await render(defaultHousekeeping(), { soldTonight: true })
    await user.click(await screen.findByTestId('plan-room-201'))
    const sheet = await screen.findByTestId('room-sheet')
    await user.click(within(sheet).getByRole('button', { name: 'Bakımda' }))
    await vi.waitFor(() => expect(transport.calls.some((c) => c.name === 'tasks.create')).toBe(true))
    expect(transport.calls.find((c) => c.name === 'tasks.create')?.input).toMatchObject({
      title: 'Oda 201: misafir çıkınca durumu yeniden seçin',
      roomId: 'room-201'
    })
  })

  it('kaydedilmemiş not sayfa kapanırken kaybolmaz, bir kez kaydedilir (H-42)', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('plan-room-201'))
    const sheet = await screen.findByTestId('room-sheet')
    await user.type(within(sheet).getByLabelText('Not'), 'Perde sökük')
    await user.keyboard('{Escape}')
    await vi.waitFor(() =>
      expect(transport.calls.filter((c) => c.name === 'housekeeping.setNote')).toHaveLength(1)
    )
    expect(transport.calls.find((c) => c.name === 'housekeeping.setNote')?.input).toEqual({
      roomId: 'room-201',
      note: 'Perde sökük'
    })
  })

  it('durumu değiştiremeyen rol durum düğmelerini görmez; blok yetkisi olmayan bakıma alamaz', async () => {
    const user = userEvent.setup()
    await render()
    act(() => setViewAs('accountant'))
    await user.click(await screen.findByTestId('plan-room-101'))
    let sheet = await screen.findByTestId('room-sheet')
    expect(within(sheet).queryByRole('group', { name: 'Durumu değiştir' })).not.toBeInTheDocument()
    expect(within(sheet).getByText('Çarşaf eksik')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    act(() => setViewAs('reception'))
    await user.click(await screen.findByTestId('plan-room-101'))
    sheet = await screen.findByTestId('room-sheet')
    expect(within(sheet).getByRole('button', { name: 'Bakımda' })).toBeEnabled()
  })

  it('temizlik rolü sade görünümü görür: kirli odalar ve tek düğmeyle "Temizlendi"', async () => {
    const user = userEvent.setup()
    const state = { ...defaultHousekeeping(), showGuests: false }
    const { transport } = await render(state)
    act(() => setViewAs('housekeeping'))
    const dirty = await screen.findByTestId('dirty-list')
    expect(within(dirty).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByTestId('hk-filter')).not.toBeInTheDocument()
    expect(within(dirty).getByTestId('dirty-101')).toHaveTextContent('Çarşaf eksik')
    await user.click(within(dirty).getByRole('button', { name: 'Oda 101 temizlendi' }))
    await vi.waitFor(() =>
      expect(transport.calls.filter((c) => c.name === 'housekeeping.setStatus').at(-1)?.input).toEqual({
        roomId: 'room-101',
        status: 'clean'
      })
    )
    await vi.waitFor(() =>
      expect(within(screen.getByTestId('dirty-list')).getAllByRole('listitem')).toHaveLength(1)
    )
    // Housekeeping sees that a room is in use, not who is in it.
    expect(screen.getByTestId('room-tile-102')).toHaveTextContent('Dolu')
    // Closing a room for sale is not theirs.
    await user.click(within(screen.getByTestId('room-tile-201')).getByRole('button'))
    const sheet = await screen.findByTestId('room-sheet')
    expect(within(sheet).getByRole('button', { name: 'Bakımda' })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: 'Kirli' })).toBeEnabled()
  })

  it('seçilen durumda oda yoksa bunu söyler; "Filtreyi temizle" bütün odaları geri getirir', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByTestId('floor-plan')
    await user.click(within(screen.getByTestId('hk-filter')).getByRole('radio', { name: /^Bakımda/ }))
    expect(screen.getByText('Bu durumda oda yok')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filtreyi temizle' }))
    expect(within(screen.getByTestId('floor-plan')).getAllByRole('button')).toHaveLength(6)
  })

  it('telefonda kat kat kutular; kirli oda tek dokunuşla temiz yapılır; arıza bildir en üstte', async () => {
    phone()
    const user = userEvent.setup()
    const { transport } = await render()
    const tiles = await screen.findByTestId('room-tiles')
    expect(screen.queryByTestId('floor-plan')).not.toBeInTheDocument()
    expect(within(tiles).getByRole('heading', { name: '2. kat' })).toBeInTheDocument()
    expect(screen.getByTestId('hk-filter')).toHaveClass('max-md:flex-nowrap', 'max-md:overflow-x-auto')
    expect(screen.getByTestId('rooms-report').parentElement).toHaveClass('max-md:w-full')
    await user.click(within(tiles).getByRole('button', { name: 'Oda 202 temizlendi' }))
    await vi.waitFor(() =>
      expect(transport.calls.some((c) => c.name === 'housekeeping.setStatus')).toBe(true)
    )
    expect(
      within(screen.getByTestId('room-tile-201')).queryByRole('button', { name: /temizlendi/ })
    ).toBeNull()
  })
})
