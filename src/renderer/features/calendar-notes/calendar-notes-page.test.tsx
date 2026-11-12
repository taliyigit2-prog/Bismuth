import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { sampleState, withP9c } from '@/test/p9c-fake'
import { setViewAs } from '@/lib/view-as'
import { CalendarNotesPage } from './calendar-notes-page'
import { countDays } from './notes-model'
import { localDate } from '@shared/date'

// jsdom lacks the pointer-capture and scroll APIs the Radix Select calls when it opens.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-05T09:00:00.000Z'))
})
afterEach(() => {
  vi.useRealTimers()
  act(() => setViewAs('owner'))
})

describe('takvim notları modeli', () => {
  it('"her cumartesi" ekim 2026 için 5 gün; aralık ve liste sayısı', () => {
    const from = localDate('2026-10-01')
    const to = localDate('2026-10-31')
    expect(countDays('weekdays', from, to, [6], [])).toBe(5)
    expect(countDays('range', from, to, [], [])).toBe(31)
    expect(countDays('list', from, to, [], ['2026-10-02', '2026-10-09'])).toBe(2)
    expect(countDays('range', to, from, [], [])).toBe(0)
  })
})

describe('takvim notları ve özel günler', () => {
  it('yükleniyor, hata ve yetkisiz durumları', async () => {
    const a = await renderWithProviders(<CalendarNotesPage />, {
      transport: withP9c({ ...sampleState(), hang: ['calendarNotes.list'] })
    })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    a.unmount()
    const b = await renderWithProviders(<CalendarNotesPage />, {
      transport: withP9c({ ...sampleState(), fail: ['calendarNotes.list'] })
    })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
    b.unmount()
    await renderWithProviders(<CalendarNotesPage />, {
      transport: withP9c({ ...sampleState(), denied: ['calendarNotes.list'] })
    })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it("yılın bayramları kendiliğinden gelir; 2036'ya geçince o yılın bayramları üretilir", async () => {
    const transport = withP9c()
    await renderWithProviders(<CalendarNotesPage />, { transport })
    expect(await screen.findByTestId('day-2026-10-29')).toHaveTextContent('Cumhuriyet Bayramı')
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    for (let i = 0; i < 10; i++) await user.click(screen.getByRole('button', { name: 'Sonraki yıl' }))
    expect(screen.getByTestId('notes-year-label')).toHaveTextContent('2036')
    expect(await screen.findByTestId('day-2036-10-29')).toHaveTextContent('Cumhuriyet Bayramı')
    expect(transport.calls).toContainEqual({
      name: 'calendarNotes.list',
      input: { from: '2036-01-01', to: '2037-01-01' }
    })
    await user.click(screen.getByRole('button', { name: 'Bu yıl' }))
    expect(screen.getByTestId('notes-year-label')).toHaveTextContent('2026')
  })

  it('"her cumartesi" toplu notu tek kayıtla bütün günlere eklenir', async () => {
    const transport = withP9c()
    await renderWithProviders(<CalendarNotesPage />, { transport })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('button', { name: 'Not ekle' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Kahvaltı salonu kapalı')
    await user.click(within(dialog).getByRole('radio', { name: 'Haftanın günleri' }))
    // The first day is today (Monday 5 Oct): pick Saturday instead.
    await user.click(within(dialog).getByRole('button', { name: 'Pazartesi' }))
    await user.click(within(dialog).getByRole('button', { name: 'Cumartesi' }))
    expect(within(dialog).getByTestId('note-count')).toHaveTextContent('4 gün seçildi')
    await user.click(within(dialog).getByRole('button', { name: '4 güne ekle' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const add = transport.calls.filter((c) => c.name === 'calendarNotes.add')
    expect(add).toHaveLength(1)
    expect(add[0]!.input).toMatchObject({
      title: 'Kahvaltı salonu kapalı',
      kind: 'note',
      target: { mode: 'weekdays', from: '2026-10-05', to: '2026-11-01', weekdays: [6] }
    })
    for (const day of ['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'])
      expect(await screen.findByTestId(`day-${day}`)).toHaveTextContent('Kahvaltı salonu kapalı')
  })

  it('tek gün, her yıl tekrarlı, renkli özel gün eklenir', async () => {
    const transport = withP9c()
    await renderWithProviders(<CalendarNotesPage />, { transport })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(await screen.findByRole('button', { name: 'Not ekle' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Otelin kuruluş günü')
    await user.click(within(dialog).getByRole('combobox', { name: 'Tür' }))
    await user.click(await screen.findByRole('option', { name: 'Özel gün' }))
    await user.click(within(dialog).getByTestId('note-yearly'))
    await user.click(within(dialog).getByRole('radio', { name: 'Renk 2' }))
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.calls.find((c) => c.name === 'calendarNotes.add')!.input).toMatchObject({
      kind: 'special',
      recurringYearly: true,
      color: '#0ea5e9',
      target: { mode: 'single', date: '2026-10-05' }
    })
    const row = await screen.findByTestId('day-2026-10-05')
    expect(row).toHaveTextContent('Her yıl')
    expect(screen.getAllByTestId('note-colors')[0]!.textContent).toContain('--note-color:#0ea5e9')
  })

  it('bayram düzenlenince "Düzenlendi" olur; toplu notun bütün günleri birlikte iptal edilir', async () => {
    const state = sampleState()
    const transport = withP9c(state)
    await renderWithProviders(<CalendarNotesPage />, { transport })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const republic = await screen.findByTestId('day-2026-10-29')
    // Saved without a change: nothing is sent, the holiday stays generated (P9fix #10).
    await user.click(within(republic).getByRole('button', { name: /^Düzenle:/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(transport.calls.some((c) => c.name === 'calendarNotes.edit')).toBe(false)
    expect(screen.getByTestId('day-2026-10-29')).not.toHaveTextContent('Düzenlendi')
    await user.click(within(screen.getByTestId('day-2026-10-29')).getByRole('button', { name: /^Düzenle:/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Açıklama (isteğe bağlı)'), 'Resepsiyon tam kadro')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.getByTestId('day-2026-10-29')).toHaveTextContent('Düzenlendi'))
    expect(transport.calls.find((c) => c.name === 'calendarNotes.edit')!.input).toEqual({
      id: 'gen-2026-10-29',
      patch: { note: 'Resepsiyon tam kadro' }
    })

    state.days.push(
      ...['2026-11-07', '2026-11-14'].map((date) => ({
        id: `n-${date}`,
        date: localDate(date),
        occurrenceDate: localDate(date),
        kind: 'event' as const,
        title: 'Kongre',
        titleI18n: null,
        note: null,
        color: null,
        source: 'user' as const,
        estimated: false,
        groupKey: 'note:g1',
        recurringYearly: false,
        repeated: false,
        generatedYear: null
      }))
    )
    await user.click(screen.getByRole('radio', { name: 'Notlar' }))
    await user.click(screen.getByRole('button', { name: 'Sonraki yıl' }))
    await user.click(screen.getByRole('button', { name: 'Önceki yıl' }))
    const congress = await screen.findByTestId('day-2026-11-07')
    expect(screen.queryByTestId('day-2026-10-29')).not.toBeInTheDocument()
    await user.click(within(congress).getByRole('button', { name: /^İptal et:/ }))
    await user.click(await screen.findByRole('button', { name: 'Bütün günleri iptal et' }))
    await waitFor(() => expect(screen.queryByTestId('day-2026-11-14')).not.toBeInTheDocument())
    expect(transport.calls).toContainEqual({
      name: 'calendarNotes.cancelGroup',
      input: { groupKey: 'note:g1' }
    })
  })

  it('vurgulu günler ayardan; düzenleme yetkisi olmayan rol not ekleyemez', async () => {
    act(() => setViewAs('accountant'))
    await renderWithProviders(<CalendarNotesPage />, { transport: withP9c() })
    expect(await screen.findByText('Vurgulu günler: Cumartesi, Pazar')).toBeInTheDocument()
    await screen.findByTestId('day-2026-10-29')
    expect(screen.queryByRole('button', { name: 'Not ekle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Düzenle:/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('holiday-check-link')).not.toBeInTheDocument()
  })
})
