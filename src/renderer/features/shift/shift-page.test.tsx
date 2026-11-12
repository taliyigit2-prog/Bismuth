import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import { defaultOperations, operationsTransport, type OperationsState } from '../tasks/operations-fake'
import { ShiftPage } from './shift-page'
import { covers, nextShift, shiftAt } from './shifts'

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

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

let success: MockInstance<typeof toast.success>
beforeEach(() => {
  success = vi.spyOn(toast, 'success')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const render = async (state: OperationsState = defaultOperations(), opts = {}) => {
  const transport = operationsTransport(state, opts)
  const result = await renderWithProviders(<ShiftPage />, { transport })
  return { ...result, transport, state }
}

describe('vardiya düzeni (ayar)', () => {
  const { shifts } = defaultOperations().lookups
  it('gece vardiyası gece yarısını aşar; şu anki ve sıradaki vardiya saate göre bulunur', () => {
    expect(covers(shifts[1]!, '02:00')).toBe(true)
    expect(covers(shifts[1]!, '12:00')).toBe(false)
    expect(shiftAt(shifts, '10:00')?.code).toBe('day')
    expect(shiftAt(shifts, '22:30')?.code).toBe('night')
    expect(nextShift(shifts, 'sh-day')?.code).toBe('night')
    expect(nextShift(shifts, 'sh-night')?.code).toBe('day')
    expect(nextShift([shifts[0]!], 'sh-day')).toBeUndefined()
  })
})

describe('Vardiya devri ekranı', () => {
  it('veri gelene kadar yükleniyor, yetkisiz role "yetkiniz yok"', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    const { unmount } = await renderWithProviders(<ShiftPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    unmount()
    await render(defaultOperations(), { forbid: ['shift.summary', 'shift.unreadHandovers'] })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('okunmamış devir notu ve anlık özetiyle gelir; "Okudum" deyince okundu olur', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const card = await screen.findByTestId('handover-unread')
    expect(within(card).getByTestId('handover-text')).toHaveTextContent('102 geç gelecek')
    expect(within(card).getByText(/Mehmet Yıldız/)).toBeInTheDocument()
    expect(within(card).getByTestId('handover-snapshot')).toHaveTextContent('KBS eksiği1')
    await user.click(within(card).getByTestId('handover-read'))
    expect(transport.calls.find((c) => c.name === 'shift.acknowledge')?.input).toEqual({ id: 'h-unread' })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Devir okundu olarak işaretlendi'))
    expect(
      await within(screen.getByTestId('handover-unread')).findByText('Okunmamış devir yok.')
    ).toBeInTheDocument()
    expect(screen.getByTestId('handover-h-unread')).toHaveTextContent('Okudu: Otel Sahibi')
  })

  it('otomatik özet elle yazılmadan dolar: gelmemiş girişler, KBS eksiği, bakiye, açık görev, kasa', async () => {
    await render()
    const auto = await screen.findByTestId('handover-auto')
    const pending = within(auto).getByRole('region', { name: 'Henüz gelmeyen girişler' })
    expect(pending).toHaveTextContent('Ada Örnek')
    expect(pending).toHaveTextContent('Can Örnek')
    expect(within(auto).getByRole('list', { name: 'KBS eksikleri' })).toHaveTextContent('Efe Örnek')
    expect(within(auto).getByRole('region', { name: 'Ödenmemiş bakiyeler' })).toHaveTextContent('₺6.000')
    expect(within(auto).getByRole('region', { name: 'Açık görevler ve arızalar' })).toHaveTextContent(
      'Çıkış yapmayan odaları ara'
    )
    expect(within(auto).getByTestId('handover-drawer')).toHaveTextContent('₺1.500')
  })

  it('devir notu özetin üstüne yazılır ve gündüzden geceye kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const write = await screen.findByTestId('handover-write')
    await user.type(within(write).getByLabelText('Devir notu'), '201 KBS bildirimini yapın.')
    await user.click(within(write).getByTestId('handover-save'))
    expect(transport.calls.find((c) => c.name === 'shift.saveHandover')?.input).toEqual({
      fromShiftId: 'sh-day',
      toShiftId: 'sh-night',
      text: '201 KBS bildirimini yapın.'
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Devir kaydedildi'))
    expect(within(write).getByLabelText('Devir notu')).toHaveValue('')
  })

  it('kendime not hatırlatma saatiyle eklenir; saati gelen not öne çıkar ve kapatılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const personal = await screen.findByTestId('notes-personal')
    expect(within(screen.getByTestId('note-n-mine')).getByText('Hatırlatma zamanı geldi')).toBeInTheDocument()
    expect(within(screen.getByTestId('note-n-later')).queryByText('Hatırlatma zamanı geldi')).toBeNull()
    // The two "Ekle" buttons have their own names for a screen reader (QA2b).
    expect(screen.getByRole('button', { name: 'Panoya not yaz' })).toBeInTheDocument()
    await user.click(within(personal).getByRole('button', { name: 'Kendime not ekle' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Not'), 'Kasa sayımını kontrol et')
    await user.click(within(dialog).getByRole('switch'))
    await user.clear(within(dialog).getByLabelText('Saat'))
    await user.type(within(dialog).getByLabelText('Saat'), '18:30')
    await user.click(within(dialog).getByTestId('note-save'))
    expect(transport.calls.find((c) => c.name === 'notes.add')?.input).toEqual({
      kind: 'personal',
      text: 'Kasa sayımını kontrol et',
      remindAt: '2026-10-12T18:30',
      pinned: false
    })
    await user.click(within(screen.getByTestId('note-n-mine')).getByRole('button', { name: /Notu kapat/ }))
    expect(transport.calls.find((c) => c.name === 'notes.setState')?.input).toEqual({
      id: 'n-mine',
      done: true
    })
  })

  it('pano: sabit not önde; sabitleme ve panodan kaldırma', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const board = await screen.findByTestId('notes-board')
    const items = within(board).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Asansör öğlen bakımda')
    await user.click(within(screen.getByTestId('note-n-board')).getByRole('button', { name: 'Sabitle' }))
    expect(transport.calls.find((c) => c.name === 'notes.setState')?.input).toEqual({
      id: 'n-board',
      pinned: true
    })
    await user.click(
      within(screen.getByTestId('note-n-pinned')).getByRole('button', { name: /Panodan kaldır/ })
    )
    expect(transport.calls.filter((c) => c.name === 'notes.setState').at(-1)?.input).toEqual({
      id: 'n-pinned',
      archived: true
    })
  })

  it('telefonda devir, notlarım ve pano üç sekmedir', async () => {
    phone()
    const user = userEvent.setup()
    await render()
    expect(await screen.findByRole('tab', { name: 'Devir' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Notlarım' }))
    expect(await screen.findByTestId('notes-personal')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Pano' }))
    expect(await screen.findByTestId('notes-board')).toBeInTheDocument()
  })
})
