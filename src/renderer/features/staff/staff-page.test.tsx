import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { ApiError } from '@/lib/transport/types'
import { setViewAs } from '@/lib/view-as'
import { staffTransport, type StaffState } from './staff-fake'
import { StaffPage } from './staff-page'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  // The hotel's today: Sunday 4 October 2026 (only Date is faked, timers run).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
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

/** September as in the owner's Excel: Selin 40.000, advance 12.500, one rest day → net 31.500. */
function september(): Partial<StaffState> {
  return {
    txns: [
      {
        id: 't-sel',
        employeeId: 'e1',
        date: '2026-09-05' as LocalDate,
        kind: 'advance',
        amountMinor: 1_250_000,
        currency: 'TRY',
        periodYear: 2026,
        periodMonth: 9,
        expenseId: 'x-1',
        note: null,
        voidedAt: null,
        voidReason: null,
        createdAt: '2026-09-05T09:00:00.000Z'
      }
    ],
    leave: [
      {
        id: 'l-1',
        employeeId: 'e1',
        date: '2026-09-10' as LocalDate,
        kind: 'rest_day',
        note: null,
        voidedAt: null,
        createdAt: '2026-09-10T09:00:00.000Z'
      },
      {
        id: 'l-2',
        employeeId: 'e2',
        date: '2026-10-04' as LocalDate,
        kind: 'sick',
        note: null,
        voidedAt: null,
        createdAt: '2026-10-04T09:00:00.000Z'
      }
    ]
  }
}

const render = (state: Partial<StaffState> = september(), settings = {}) => {
  const transport = staffTransport({ state })
  return renderWithProviders(<StaffPage />, { transport, settings }).then((r) => ({ ...r, transport }))
}

async function salaryTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Maaş tablosu' }))
  return screen.getByTestId('salary-table')
}

describe('Personel', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const transport = staffTransport()
    const call = transport.call.bind(transport)
    transport.call = (name, input) => (name === 'staff.employees' ? new Promise(() => {}) : call(name, input))
    await renderWithProviders(<StaffPage />, { transport })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('veri okunamazsa yeniden dene düğmesi çıkar', async () => {
    const transport = staffTransport({
      refuse: { 'staff.employees': new ApiError('INTERNAL', 500, 'errors.internal') }
    })
    await renderWithProviders(<StaffPage />, { transport })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('çalışan yoksa boş durum ilk çalışanın nasıl ekleneceğini söyler', async () => {
    await render({ employees: [], salaries: [] })
    expect(await screen.findByText('Henüz çalışan yok')).toBeInTheDocument()
    expect(screen.getByText(/"Yeni çalışan"a basın/)).toBeInTheDocument()
  })

  it('çalışan listesi görev, bağlı hesabın rolü, bugünkü durum ve maaşı gösterir', async () => {
    await render()
    const table = await screen.findByTestId('employee-table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Selin Kaya')
    expect(rows[0]).toHaveTextContent('Resepsiyon')
    expect(rows[0]).toHaveTextContent('₺40.000')
    expect(rows[1]).toHaveTextContent('Hesap yok')
    await waitFor(() => expect(rows[1]).toHaveTextContent('Hastalık'))
    expect(rows[1]).toHaveTextContent('₺35.000')
    expect(screen.getByTestId('staff-panel')).toHaveTextContent('Personel durumu · Ekim 2026')
  })

  it('maaş tablosu borcu kalan geçen ayla açılır: 40.000 − 12.500 + 4.000 = 31.500', async () => {
    const user = userEvent.setup()
    await render()
    await salaryTab(user)
    expect(screen.getByTestId('salary-month')).toHaveTextContent('Eylül 2026')
    const row = await screen.findByTestId('salary-row-e1')
    for (const text of ['₺40.000', '₺12.500', '₺4.000', '₺31.500']) expect(row).toHaveTextContent(text)
    expect(screen.getByTestId('salary-debt-e1')).toHaveTextContent('₺31.500')
    // Maaş geçmişi: Murat's September uses the new salary (35.000), August the old one (30.000).
    expect(screen.getByTestId('salary-row-e2')).toHaveTextContent('₺35.000')
    await user.click(screen.getByRole('button', { name: 'Önceki ay' }))
    expect(await screen.findByTestId('salary-month')).toHaveTextContent('Ağustos 2026')
    await waitFor(() => expect(screen.getByTestId('salary-row-e2')).toHaveTextContent('₺30.000'))
  })

  it('avans verilince servis çağrılır ve tablo yenilenir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Olga Petrova: avans ver' }))
    const dialog = await screen.findByRole('dialog', { name: 'Avans ver' })
    expect(within(dialog).getByText(/^Eylül 2026 için kalan maaş:/)).toHaveTextContent('₺41.933')
    await user.type(within(dialog).getByLabelText('Avans tutarı'), '5000')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.staffCalls.find((c) => c.name === 'staff.addTransaction')?.input).toMatchObject({
      employeeId: 'e3',
      kind: 'advance',
      amountMinor: 500_000,
      periodYear: 2026,
      periodMonth: 9,
      paidFromDrawer: false
    })
    await waitFor(() => expect(screen.getByTestId('salary-debt-e3')).toHaveTextContent('₺36.933'))
  })

  it('kasadan avans ayarı açıksa "kasadan verildi" seçeneği çıkar', async () => {
    const user = userEvent.setup()
    await render(september(), { 'staff.advanceFromDrawer': true })
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Avans ver' }))
    const dialog = await screen.findByRole('dialog', { name: 'Avans ver' })
    expect(within(dialog).getByRole('switch', { name: /Kasadan verildi/ })).toBeChecked()
  })

  it('maaş parça parça ödenir: kalan borç ödemeden sonra görünür', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Selin Kaya: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    expect(within(dialog).getByTestId('pay-summary')).toHaveTextContent('₺31.500')
    const amount = within(dialog).getByLabelText('Ödenen tutar')
    await user.clear(amount)
    await user.type(amount, '20000')
    await user.tab()
    expect(within(dialog).getByTestId('pay-after')).toHaveTextContent('Ödemeden sonra kalan: ₺11.500')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() => expect(screen.getByTestId('salary-debt-e1')).toHaveTextContent('₺11.500'))
    expect(transport.staffCalls.find((c) => c.name === 'staff.addTransaction')?.input).toMatchObject({
      kind: 'salary_payment',
      amountMinor: 2_000_000,
      methodId: 'pm-cash'
    })
  })

  it('ay onayla kilitlenir; kilitli ayda işlem düğmeleri kalkar, kilit gerekçeyle açılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Ayı kilitle' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Eylül 2026 kilitlensin mi?' })
    await user.click(within(confirm).getByRole('button', { name: 'Kilitle' }))
    expect(await screen.findByTestId('month-locked')).toHaveTextContent('Bu ay kilitli')
    expect(screen.queryByRole('button', { name: 'Avans ver' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Kilidi aç' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eylül 2026 kilidi açılsın mı?' })
    await user.click(within(dialog).getByRole('button', { name: 'Kilidi aç' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Nedenini yazın')
    await user.type(within(dialog).getByLabelText('İptal nedeni'), 'avans eksik girilmiş')
    await user.click(within(dialog).getByRole('button', { name: 'Kilidi aç' }))
    await waitFor(() => expect(screen.queryByTestId('month-locked')).not.toBeInTheDocument())
    expect(transport.staffCalls.find((c) => c.name === 'staff.unlockMonth')?.input).toEqual({
      year: 2026,
      month: 9,
      reason: 'avans eksik girilmiş'
    })
  })

  it('çizelgede boş güne tıklayınca izin penceresi, izinli güne tıklayınca iptal penceresi açılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByRole('tab', { name: 'İzin ve çizelge' }))
    const legend = screen.getByRole('list', { name: 'Çizelge renkleri' })
    expect(within(legend).getAllByRole('listitem')).toHaveLength(6)
    const selin = screen.getByTestId('schedule-row-e1')
    await user.click(within(selin).getAllByRole('button')[2]!)
    const dialog = await screen.findByRole('dialog', { name: 'İzin kaydet' })
    expect(within(dialog).getByRole('combobox', { name: 'Çalışan' })).toHaveTextContent('Selin Kaya')
    expect(within(dialog).getByTestId('leave-balance-line')).toHaveTextContent('0/4')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.staffCalls.find((c) => c.name === 'staff.addLeaveDays')?.input).toMatchObject({
      employeeId: 'e1',
      from: '2026-10-06',
      days: 1,
      kind: 'rest_day'
    })
    const murat = screen.getByTestId('schedule-row-e2')
    await user.click(within(murat).getAllByRole('button')[0]!)
    expect(await screen.findByRole('dialog', { name: 'İzin iptal edilsin mi?' })).toHaveTextContent(
      'Murat Demir'
    )
  })

  it('çalışan kartı hesabı, bu ayın hareketlerini ve maaş geçmişini gösterir; avans gerekçeyle iptal edilir', async () => {
    const user = userEvent.setup()
    const state = september()
    state.txns![0] = { ...state.txns![0]!, periodMonth: 10, date: '2026-10-02' as LocalDate }
    const { transport } = await render(state)
    await user.click(await screen.findByTestId('employee-e1'))
    const sheet = await screen.findByTestId('employee-sheet')
    expect(within(sheet).getByRole('region', { name: 'Kullanıcı hesabı' })).toHaveTextContent('Resepsiyon')
    expect(await within(sheet).findByTestId('sheet-month')).toHaveTextContent('₺12.500')
    expect(within(sheet).getByTestId('salary-history')).toHaveTextContent('₺40.000')
    await user.click(within(sheet).getByRole('button', { name: 'Avans kaydını iptal et' }))
    const dialog = await screen.findByRole('dialog', { name: 'Avans iptal edilsin mi?' })
    expect(dialog).toHaveTextContent('defterdeki gideriyle birlikte')
    await user.type(within(dialog).getByLabelText('İptal nedeni'), 'yanlış kişi')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydı iptal et' }))
    await waitFor(() =>
      expect(transport.staffCalls.find((c) => c.name === 'staff.voidTransaction')?.input).toEqual({
        id: 't-sel',
        reason: 'yanlış kişi'
      })
    )
  })

  it('müdür maaşları görmez ama mesai sekmesinde öneriyi onaylar; resepsiyon ekranı göremez', async () => {
    const user = userEvent.setup()
    const { transport } = await render({
      ...september(),
      work: [
        {
          id: 'w-1',
          employeeId: 'e1',
          date: '2026-10-02' as LocalDate,
          startTime: '08:00',
          endTime: '18:00',
          minutesWorked: 600,
          overtimeMinutes: 0,
          kind: 'normal',
          note: null,
          createdBy: null
        }
      ]
    })
    await screen.findByTestId('employee-table')
    act(() => setViewAs('manager'))
    expect(screen.queryByRole('tab', { name: 'Maaş tablosu' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('employee-table')).queryByText('₺40.000')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Mesai' }))
    const day = await screen.findByTestId('work-row-2026-10-02')
    expect(day).toHaveTextContent('10 sa')
    await user.click(within(day).getByRole('button', { name: '2 sa onayla' }))
    await waitFor(() =>
      expect(transport.staffCalls.find((c) => c.name === 'staff.recordWork')?.input).toEqual({
        employeeId: 'e1',
        date: '2026-10-02',
        overtimeMinutes: 120
      })
    )
    act(() => setViewAs('reception'))
    expect(screen.getByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('kartı olan kullanıcı kendi geliş/çıkış saatini girer; sabah girilen gece vardiyası başladığı güne yazılır (B28)', async () => {
    const user = userEvent.setup()
    const { transport } = await render({ ...september(), myEmployeeId: 'e1' })
    const card = await screen.findByTestId('my-hours')
    await user.click(within(card).getByRole('button', { name: 'Bugünün saatlerini gir' }))
    const dialog = await screen.findByRole('dialog', { name: 'Geliş ve çıkış saati' })
    await user.type(within(dialog).getByLabelText('Geliş'), '22:00')
    await user.type(within(dialog).getByLabelText('Çıkış'), '07:00')
    expect(within(dialog).getByTestId('work-overnight-day')).toHaveTextContent('3 Ekim 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(transport.staffCalls.find((c) => c.name === 'staff.recordWork')?.input).toEqual({
        date: '2026-10-03',
        startTime: '22:00',
        endTime: '07:00'
      })
    )
    expect(within(dialog).queryByLabelText('Ek mesai (saat)')).not.toBeInTheDocument()
  })

  it('yeni çalışan ad ve soyadla eklenir; maaş ilk kayıt olarak gider', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByTestId('employee-table')
    await user.click(screen.getByRole('button', { name: 'Yeni çalışan' }))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni çalışan' })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(within(dialog).getAllByRole('alert')[0]).toHaveTextContent('Bu alan zorunlu.')
    await user.type(within(dialog).getByLabelText('Ad'), 'Ayşe')
    await user.type(within(dialog).getByLabelText('Soyad'), 'Deneme')
    await user.type(within(dialog).getByLabelText('Aylık maaş'), '32000')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.getByTestId('employee-sheet')).toHaveTextContent('Ayşe Deneme'))
    expect(transport.staffCalls.find((c) => c.name === 'staff.createEmployee')?.input).toMatchObject({
      firstName: 'Ayşe',
      lastName: 'Deneme',
      salary: { monthlyMinor: 3_200_000, currency: 'TRY' }
    })
  })

  it('telefonda çalışanlar ve maaş tablosu kart listesi olarak açılır', async () => {
    phone()
    const user = userEvent.setup()
    await render()
    expect(await screen.findByTestId('employee-cards')).toBeInTheDocument()
    expect(screen.queryByTestId('employee-table')).not.toBeInTheDocument()
    await salaryTab(user)
    expect(await screen.findByTestId('salary-cards')).toHaveTextContent('₺31.500')
  })
})
