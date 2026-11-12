import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { localDate } from '@shared/date'
import type { Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import {
  defaultOperations,
  FAKE_TODAY,
  operationsTransport,
  template,
  type OperationsState
} from '../tasks/operations-fake'
import { nextDueIfDone, reminderRows } from './derive'
import { MaintenancePage } from './maintenance-page'

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
  const result = await renderWithProviders(<MaintenancePage />, { transport })
  return { ...result, transport, state }
}

describe('bakım görünümü', () => {
  it('geciken önce; uyarı günleri ya da bir hafta içinde olan "yaklaşıyor"', () => {
    const rows = reminderRows(
      [
        template('a', { nextDueAt: '2026-12-01T10:00' }),
        template('b', { nextDueAt: '2026-10-10T10:00' }),
        template('c', { nextDueAt: '2026-10-25T10:00', remindMinutesBefore: 14 * 1440 })
      ],
      FAKE_TODAY
    )
    expect(rows.map((r) => [r.template.id, r.state, r.daysLeft])).toEqual([
      ['b', 'overdue', -2],
      ['c', 'soon', 13],
      ['a', 'ok', 50]
    ])
  })

  it('aylık bakım 31’inde yapılınca sonraki ayın son gününe; geç yapılınca yapıldığı günden sayılır', () => {
    const [row] = reminderRows(
      [
        template('x', {
          recurrence: { kind: 'interval', unit: 'months', every: 1, time: '10:00' },
          firstDueAt: '2027-01-31T10:00',
          nextDueAt: '2027-01-31T10:00'
        })
      ],
      localDate('2027-01-31')
    )
    expect(nextDueIfDone(row!, localDate('2027-01-31'))).toBe('2027-02-28')
    expect(nextDueIfDone(row!, localDate('2027-02-03'))).toBe('2027-03-03')
  })
})

describe('Bakım ekranı', () => {
  it('veri gelene kadar yükleniyor; hiç bakım yoksa ne yapılacağını söyler', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    const { unmount } = await renderWithProviders(<MaintenancePage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    unmount()
    await render({ ...defaultOperations(), templates: [], counters: [] })
    expect(await screen.findByText('Bakım kaydı yok')).toBeInTheDocument()
  })

  it('geciken bakım kırmızı ve görevlerde; sorumlu ve sıklık yazılı', async () => {
    await render()
    const late = await screen.findByTestId('reminder-tpl-elevator')
    expect(late).toHaveAttribute('data-state-due', 'overdue')
    expect(late).toHaveTextContent('2 gün gecikti')
    expect(late).toHaveTextContent('Görevlerde')
    const water = screen.getByTestId('reminder-tpl-water')
    expect(water).toHaveTextContent('Temizlik')
    expect(water).toHaveTextContent('6 ayda bir')
    expect(screen.getByTestId('maintenance-summary')).toHaveTextContent('1 bakım gecikti')
  })

  it('"Yapıldı" yapıldığı günle kaydedilir ve sonraki tarihi gösterir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const row = await screen.findByTestId('reminder-tpl-elevator')
    await user.click(within(row).getByRole('button', { name: 'Yapıldı' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Bir sonraki tarih: 12 Kasım 2026 Perşembe')
    await user.click(within(dialog).getByTestId('maintenance-done-save'))
    expect(transport.calls.find((c) => c.name === 'tasks.completeTemplate')?.input).toEqual({
      id: 'tpl-elevator',
      roomId: null,
      doneOn: FAKE_TODAY,
      note: null
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Yapıldı olarak kaydedildi'))
  })

  it('derin temizlik sayacı: dolan oda vurgulu; "Temizlendi" odayla kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const due = await screen.findByTestId('deep-clean-102')
    expect(due).toHaveTextContent('10/10')
    expect(screen.getByTestId('deep-clean-101')).toHaveTextContent('4/10')
    expect(screen.getByTestId('deep-clean-201')).toHaveTextContent('Henüz yapılmadı')
    await user.click(within(due).getByRole('button', { name: 'Oda 102 derin temizlendi' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Sayaç sıfırlanır')
    await user.click(within(dialog).getByTestId('maintenance-done-save'))
    expect(transport.calls.find((c) => c.name === 'tasks.completeTemplate')?.input).toMatchObject({
      id: 'tpl-deep',
      roomId: 'room-102'
    })
    expect(await screen.findByTestId('deep-clean-102')).toHaveTextContent('0/10')
  })

  it('tarihi gelmemiş, görevi olmayan bakımda "erken mi yapıldı" uyarısı çıkar (P9fix #1)', async () => {
    const user = userEvent.setup()
    await render()
    const row = await screen.findByTestId('reminder-tpl-water')
    await user.click(within(row).getByRole('button', { name: 'Yapıldı' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('maintenance-done-early')).toHaveTextContent(
      'Bu bakımın tarihi henüz gelmedi (1 Aralık 2026 Salı)'
    )
    await user.keyboard('{Escape}')
    await user.click(
      within(await screen.findByTestId('reminder-tpl-elevator')).getByRole('button', { name: 'Yapıldı' })
    )
    expect(within(await screen.findByRole('dialog')).queryByTestId('maintenance-done-early')).toBeNull()
  })

  it('N konaklamada bir değeri Bakım kartında değişir (P9fix #16)', async () => {
    const user = userEvent.setup()
    const state = defaultOperations()
    state.templates.push(
      template('tpl-deep', {
        code: 'deep_clean_every_n',
        kind: 'maintenance',
        recurrence: { kind: 'everyNStays', n: 10, countDayUse: true }
      })
    )
    const { transport } = await render(state)
    const form = await screen.findByTestId('deep-clean-n')
    const input = within(form).getByLabelText('Kaç konaklamada bir')
    expect(input).toHaveValue(10)
    expect(within(form).getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    await user.clear(input)
    await user.type(input, '8')
    await user.click(within(form).getByRole('button', { name: 'Kaydet' }))
    expect(transport.calls.find((c) => c.name === 'tasks.editTemplate')?.input).toEqual({
      id: 'tpl-deep',
      patch: { recurrence: { kind: 'everyNStays', n: 8, countDayUse: true } }
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Derin temizlik artık 8 konaklamada bir'))
  })

  it('görev yöneticisi olmayan rol N’i değiştiremez; yalnız kendisine görev düşen odada "Temizlendi" görür (P9fix #2)', async () => {
    const state = defaultOperations()
    state.lookups = { ...state.lookups, canManage: false }
    state.counters = state.counters.map((g) => ({
      ...g,
      rooms: g.rooms.map((r) => (r.roomId === 'room-201' ? { ...r, count: 10 } : r))
    }))
    await render(state)
    const waiting = await screen.findByTestId('deep-clean-102')
    expect(within(waiting).getByRole('button', { name: 'Oda 102 derin temizlendi' })).toBeInTheDocument()
    const full = screen.getByTestId('deep-clean-201')
    expect(within(full).queryByRole('button')).toBeNull()
    expect(full).toHaveTextContent('Zamanı geldi')
    expect(screen.queryByTestId('deep-clean-n')).toBeNull()
  })

  it('otelin kendi "her N konaklamada" görevi derin temizlik diye değil, kendi başlığıyla görünür', async () => {
    const state = defaultOperations()
    state.counters = [
      ...state.counters,
      {
        templateId: 'tpl-minibar',
        code: null,
        title: 'Mini bar sayımı',
        titleI18n: null,
        n: 3,
        rooms: [
          {
            roomId: 'room-101',
            roomNumber: '101',
            count: 3,
            since: localDate('2026-10-01'),
            lastDoneAt: null,
            openTaskId: null
          }
        ]
      }
    ]
    await render(state)
    const deep = await screen.findByTestId('maintenance-deep-clean')
    expect(within(deep).queryByText('Mini bar sayımı')).toBeNull()
    expect(within(deep).getAllByText(/derin temizlenir/)).toHaveLength(1)
    const own = screen.getByTestId('maintenance-stay-counters')
    expect(own).toHaveTextContent('Konaklama sayısına göre işler')
    expect(within(own).getByText('Mini bar sayımı')).toBeInTheDocument()
    expect(own).toHaveTextContent('Her oda 3 konaklamada bir yapılır.')
    expect(own).not.toHaveTextContent(/derin/i)
    expect(within(own).getByRole('button', { name: 'Oda 101: Mini bar sayımı yapıldı' })).toBeInTheDocument()
  })

  it('"Kaç konaklamada bir" sınır dışıysa sınırı söyleyen tek metin (Görevler ile aynı 1–500)', async () => {
    const user = userEvent.setup()
    const state = defaultOperations()
    state.templates.push(
      template('tpl-deep', {
        code: 'deep_clean_every_n',
        kind: 'maintenance',
        recurrence: { kind: 'everyNStays', n: 10, countDayUse: true }
      })
    )
    await render(state)
    const form = await screen.findByTestId('deep-clean-n')
    const input = within(form).getByLabelText('Kaç konaklamada bir')
    for (const bad of ['0', '501', '1.5']) {
      await user.clear(input)
      await user.type(input, bad)
      expect(within(form).getByText('1 ile 500 arasında bir tam sayı yazın.')).toBeInTheDocument()
      expect(within(form).getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    }
  })

  it('hatırlatıcı: sıklık 1000 / 1,5 ve uyarı günü -1 / 366 alanın altında sınırıyla söylenir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('reminder-add'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Ne yapılacak?'), 'Klima filtreleri')
    const every = within(dialog).getByLabelText('Sıklık')
    const remind = within(dialog).getByLabelText('Kaç gün önce uyarsın?')
    for (const [e, r] of [
      ['1000', '-1'],
      ['1.5', '366']
    ] as const) {
      await user.clear(every)
      await user.type(every, e)
      await user.clear(remind)
      await user.type(remind, r)
      await user.click(within(dialog).getByTestId('reminder-save'))
      expect(within(dialog).getByText('1 ile 999 arasında bir tam sayı yazın.')).toBeInTheDocument()
      expect(within(dialog).getByText('0 ile 365 arasında bir tam sayı yazın.')).toBeInTheDocument()
      expect(remind).toHaveAttribute('aria-invalid', 'true')
    }
    expect(transport.calls.some((c) => c.name === 'tasks.addTemplate')).toBe(false)
  })

  it('yeni hatırlatıcı: her N ay, ilk tarih, kaç gün önce uyarı ve sorumlu ile kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('reminder-add'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Ne yapılacak?'), 'Klima filtreleri')
    await user.clear(within(dialog).getByLabelText('Sıklık'))
    await user.type(within(dialog).getByLabelText('Sıklık'), '3')
    await user.clear(within(dialog).getByLabelText('Kaç gün önce uyarsın?'))
    await user.type(within(dialog).getByLabelText('Kaç gün önce uyarsın?'), '7')
    await user.click(within(dialog).getByRole('combobox', { name: 'Sorumlu (isteğe bağlı)' }))
    await user.click(await screen.findByRole('option', { name: 'Fatma Kaya' }))
    await user.click(within(dialog).getByTestId('reminder-save'))
    expect(transport.calls.find((c) => c.name === 'tasks.addTemplate')?.input).toEqual({
      title: 'Klima filtreleri',
      kind: 'maintenance',
      description: null,
      recurrence: { kind: 'interval', unit: 'months', every: 3, time: '10:00' },
      remindMinutesBefore: 7 * 1440,
      assigneeUserId: 'u-fatma',
      assigneeRoleId: null,
      firstDueAt: `${FAKE_TODAY}T10:00`
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Hatırlatıcı kaydedildi'))
  })

  it('örnek hatırlatıcı ilk tarihi sorularak açılır (çevirisi korunur)', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const card = await screen.findByTestId('maintenance-suggestions')
    await user.click(within(card).getByRole('button', { name: 'Ekle: Baca temizliği' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Ne yapılacak?')).toHaveValue('Baca temizliği')
    await user.click(within(dialog).getByTestId('reminder-save'))
    const edit = transport.calls.find((c) => c.name === 'tasks.editTemplate')?.input as {
      id: string
      patch: Record<string, unknown>
    }
    expect(edit.id).toBe('tpl-chimney')
    expect(edit.patch).not.toHaveProperty('title')
    expect(edit.patch).toMatchObject({ recurrence: { kind: 'interval', unit: 'years', every: 1 } })
    await vi.waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'tasks.setTemplateActive')?.input).toEqual({
        id: 'tpl-chimney',
        active: true
      })
    )
  })

  it('telefonda hatırlatıcılar kart olarak; görevlere bağlantı', async () => {
    phone()
    await render()
    const late = await screen.findByTestId('reminder-tpl-elevator')
    expect(late.tagName).toBe('LI')
    expect(screen.getByRole('link', { name: /Görevlere git/ })).toHaveAttribute('href', '/tasks')
  })
})
