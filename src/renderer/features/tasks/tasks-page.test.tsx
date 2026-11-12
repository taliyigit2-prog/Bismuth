import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { LocalDateTime } from '@shared/domain/local-datetime'
import type { Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import {
  defaultOperations,
  FAKE_TODAY,
  operationsTransport,
  task,
  type OperationsState
} from './operations-fake'
import { TasksPage } from './tasks-page'
import { countOf, matchesFilter, tasksOf } from './task-views'

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

// jsdom lacks the pointer-capture and scroll APIs the Radix Select calls when it opens.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

let success: MockInstance<typeof toast.success>
beforeEach(() => {
  success = vi.spyOn(toast, 'success')
  // The fake hotel's "now": 12 Oct 2026, 10:00 (only Date is faked; timers stay real for user events).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const render = async (state: OperationsState = defaultOperations(), opts = {}) => {
  const transport = operationsTransport(state, opts)
  const result = await renderWithProviders(<TasksPage />, { transport })
  return { ...result, transport, state }
}

const NOW = `${FAKE_TODAY}T10:00` as LocalDateTime

describe('görev görünümleri', () => {
  const { tasks } = defaultOperations()

  it('bugün: bugüne kadar açıklar (geciken önce), sonra tarihsiz derin temizlik, sonra bugün yapılan', () => {
    expect(tasksOf(tasks, 'today', NOW).map((t) => t.id)).toEqual(['t-late', 't-call', 't-deep', 't-done'])
    expect(countOf(tasks, 'today', NOW)).toBe(3)
  })

  it('geciken yalnız saati geçmiş açık görev; yaklaşan yarından sonrası; yapılan en yeni üstte', () => {
    expect(tasksOf(tasks, 'overdue', NOW).map((t) => t.id)).toEqual(['t-late'])
    expect(tasksOf(tasks, 'upcoming', NOW).map((t) => t.id)).toEqual(['t-201', 't-tourism'])
    expect(tasksOf(tasks, 'done', NOW).map((t) => t.id)).toEqual(['t-done'])
  })

  it('süzgeç: kişi, rol, vardiya, oda ve "bana verilenler"', () => {
    const t1 = task('a', { assigneeUserId: 'u-1', roomId: 'r-1' })
    const t2 = task('b', { assigneeRoleId: 'role-x' })
    const t3 = task('c', { assigneeShiftId: 'sh-1' })
    expect(matchesFilter(t1, 'user:u-1', 'all', null)).toBe(true)
    expect(matchesFilter(t1, 'me', 'all', 'u-1')).toBe(true)
    expect(matchesFilter(t1, 'all', 'r-2', null)).toBe(false)
    expect(matchesFilter(t2, 'role:role-x', 'all', null)).toBe(true)
    expect(matchesFilter(t3, 'shift:sh-1', 'all', null)).toBe(true)
    expect(matchesFilter(t3, 'role:role-x', 'all', null)).toBe(false)
  })
})

describe('Görevler ekranı', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    await renderWithProviders(<TasksPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('liste okunamazsa hata ve "Yeniden dene"; yetkisi olmayana "yetkiniz yok"', async () => {
    const { unmount } = await render(defaultOperations(), { fail: ['tasks.list'] })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
    unmount()
    await render(defaultOperations(), { forbid: ['tasks.list', 'tasks.lookups'] })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('görev yokken ne yapılacağını söyler', async () => {
    await render({ ...defaultOperations(), tasks: [] })
    expect(await screen.findByText(/Henüz görev yok/)).toBeInTheDocument()
  })

  it('geciken görev vurgulu ve rozetli; derin temizlik oda ile; yapılan görevde yapan ve saat', async () => {
    await render()
    const late = await screen.findByTestId('task-t-late')
    expect(late).toHaveTextContent('Gecikti')
    expect(within(screen.getByTestId('task-tab-overdue')).getByText('1')).toBeInTheDocument()
    expect(screen.getByTestId('task-t-deep')).toHaveTextContent('Oda 102')
    expect(screen.getByTestId('task-t-done')).toHaveTextContent('Yapan: Deniz Arslan')
  })

  it('tek tıkla yapıldı: servis çağrılır, görev yapılanlara geçer', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByRole('checkbox', { name: /Yapıldı olarak işaretle: Çıkış yapmayan/ }))
    expect(transport.calls.find((c) => c.name === 'tasks.done')?.input).toEqual({ id: 't-call' })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Görev yapıldı olarak işaretlendi'))
    await user.click(screen.getByTestId('task-tab-done'))
    expect(await screen.findByTestId('task-t-call')).toHaveAttribute('data-status', 'done')
  })

  it('oda süzgeci yalnız o odanın görevlerini bırakır; temizlenince hepsi döner', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByTestId('task-t-late')
    await user.click(screen.getByTestId('task-tab-upcoming'))
    await user.click(screen.getByRole('combobox', { name: 'Oda' }))
    await user.click(await screen.findByRole('option', { name: 'Oda 201' }))
    expect(await screen.findByTestId('task-t-201')).toBeInTheDocument()
    expect(screen.queryByTestId('task-t-tourism')).toBeNull()
    await user.click(screen.getByRole('combobox', { name: 'Oda' }))
    await user.click(await screen.findByRole('option', { name: 'Oda 102' }))
    await user.click(await screen.findByRole('button', { name: 'Filtreyi temizle' }))
    expect(await screen.findByTestId('task-t-tourism')).toBeInTheDocument()
  })

  it('iptal neden ister; nedenle iptal edilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('task-t-call-menu'))
    await user.click(await screen.findByRole('menuitem', { name: 'Görevi iptal et' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Görevi iptal et' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nedenini yazın.')
    await user.type(within(dialog).getByLabelText('Neden'), 'Misafir erken çıktı')
    await user.click(within(dialog).getByRole('button', { name: 'Görevi iptal et' }))
    expect(transport.calls.find((c) => c.name === 'tasks.cancel')?.input).toEqual({
      id: 't-call',
      reason: 'Misafir erken çıktı'
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Görev iptal edildi'))
  })

  it('turizm istatistiği hatırlatıcısı ilgili ekrana bağlantı verir', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByTestId('task-t-late')
    await user.click(screen.getByTestId('task-tab-upcoming'))
    const row = await screen.findByTestId('task-t-tourism')
    expect(within(row).getByRole('link', { name: 'Turizm istatistiğini aç' })).toHaveAttribute(
      'href',
      '/tourism'
    )
  })

  it('yeni görev: tekrarsız görev son tarih-saatle, "her gün" görev şablon olarak kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('task-new'))
    let dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByTestId('task-save'))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Başlık yazın.')
    await user.type(within(dialog).getByLabelText('Başlık'), '302 klima filtresi')
    await user.click(within(dialog).getByTestId('task-save'))
    expect(transport.calls.find((c) => c.name === 'tasks.create')?.input).toMatchObject({
      title: '302 klima filtresi',
      dueAt: `${FAKE_TODAY}T12:00`,
      assigneeUserId: null
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Görev kaydedildi'))

    await user.click(screen.getByTestId('task-new'))
    dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Kat depolarını say')
    await user.click(within(dialog).getByRole('radio', { name: 'Rol' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Rol' }))
    await user.click(await screen.findByRole('option', { name: 'Temizlik' }))
    await user.click(within(dialog).getByTestId('task-repeat'))
    await user.click(await screen.findByRole('option', { name: 'Her gün, belirli saatte' }))
    await user.clear(within(dialog).getByLabelText('Saat'))
    await user.type(within(dialog).getByLabelText('Saat'), '10:30')
    await user.click(within(dialog).getByTestId('task-save'))
    expect(transport.calls.find((c) => c.name === 'tasks.addTemplate')?.input).toMatchObject({
      title: 'Kat depolarını say',
      kind: 'general',
      assigneeRoleId: 'role-housekeeping',
      recurrence: { kind: 'daily', time: '10:30' },
      firstDueAt: `${FAKE_TODAY}T10:30`
    })
  })

  it('öneri eklenir ya da "gerek yok" denir; yasal hatırlatıcı kapatılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    const card = await screen.findByTestId('task-suggestions')
    await user.click(
      await within(card).findByRole('button', { name: 'Ekle: Kirli çamaşırları çamaşırhaneye teslim et' })
    )
    expect(transport.calls.find((c) => c.name === 'tasks.setTemplateActive')?.input).toEqual({
      id: 'tpl-laundry',
      active: true
    })
    expect(await within(card).findByText('Önerilerin hepsine baktınız.')).toBeInTheDocument()

    const legal = screen.getByTestId('legal-list')
    await user.click(within(legal).getByRole('switch', { name: 'KBS çıkış bildirimlerini kontrol et' }))
    expect(transport.calls.filter((c) => c.name === 'tasks.setTemplateActive').at(-1)?.input).toEqual({
      id: 'tpl-kbs',
      active: false
    })
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith('Hatırlatıcı kapatıldı'))
  })

  it('"Her N konaklamada" ve ayın günü sınır dışıysa alan altında sınırı söyleyen metin; kaydedilmez', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('task-new'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Perdeleri yıka')
    // "Herkes" is explained: only roles that see the whole task list see it.
    expect(within(dialog).getByTestId('task-everyone-hint')).toHaveTextContent(
      'Bütün görev listesini görebilen roller görür'
    )
    await user.click(within(dialog).getByTestId('task-repeat'))
    await user.click(await screen.findByRole('option', { name: 'Her N konaklamada (oda bazında)' }))
    const n = within(dialog).getByLabelText('Kaç konaklamada bir')
    expect(n).toHaveAttribute('max', '500')
    for (const bad of ['0', '-1', '501', '1000000']) {
      await user.clear(n)
      await user.type(n, bad)
      await user.click(within(dialog).getByTestId('task-save'))
      expect(within(dialog).getByText('1 ile 500 arasında bir tam sayı yazın.')).toBeInTheDocument()
    }
    await user.click(within(dialog).getByTestId('task-repeat'))
    await user.click(await screen.findByRole('option', { name: 'Ayın belirli günü' }))
    const day = within(dialog).getByLabelText('Ayın günü')
    for (const bad of ['0', '32', '-3']) {
      await user.clear(day)
      await user.type(day, bad)
      await user.click(within(dialog).getByTestId('task-save'))
      expect(within(dialog).getByText('1 ile 31 arasında bir tam sayı yazın.')).toBeInTheDocument()
    }
    expect(transport.calls.some((c) => c.name === 'tasks.addTemplate')).toBe(false)
  })

  it('saat geçersizse "Kaydet" alanın altında ne yapılacağını söyler (yalnız kırmızı kenarlık değil)', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByTestId('task-new'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Kazan dairesine bak')
    const time = within(dialog).getByLabelText('Saat')
    await user.clear(time)
    await user.click(within(dialog).getByTestId('task-save'))
    expect(within(dialog).getByText('Saati 14:30 gibi yazın.')).toBeInTheDocument()
    expect(time).toHaveAttribute('aria-invalid', 'true')
    expect(time).toHaveAccessibleDescription('Saati 14:30 gibi yazın.')
    expect(transport.calls.some((c) => c.name === 'tasks.create')).toBe(false)
  })

  it('yalnız kendi görevlerini gören rol öneri kartını ve tekrar seçimini görmez', async () => {
    const user = userEvent.setup()
    const state = defaultOperations()
    state.lookups = { ...state.lookups, canManage: false }
    await render(state)
    await screen.findByTestId('task-t-late')
    expect(screen.queryByTestId('task-suggestions')).toBeNull()
    await user.click(screen.getByTestId('task-new'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByTestId('task-repeat')).toBeNull()
  })

  it('telefonda sekmeler ve süzgeçler tek sütunda; görev satırı açılır', async () => {
    phone()
    await render()
    expect(await screen.findByTestId('task-filters')).toBeInTheDocument()
    expect(screen.getByTestId('task-tab-today')).toBeInTheDocument()
    expect(screen.getByTestId('task-t-late')).toBeInTheDocument()
  })
})
