// Early bug hunt fixes on the Personel screen (P7fix): overtime hours that turn back into the same minutes (B13),
// salaries in more than one currency (B18), salary out of the drawer (B9), a closed business day (B8), the ledger
// reads a staff write refreshes (B27) and hiring a former employee again (B6).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate, type LocalDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { defaultStaffState, staffTransport, type StaffState } from './staff-fake'
import { StaffPage } from './staff-page'
import { hoursToMinutes, minutesToText, STAFF_READS } from './use-staff'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-04T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const render = (state: Partial<StaffState> = {}, settings = {}) => {
  const transport = staffTransport({ state })
  return renderWithProviders(<StaffPage />, { transport, settings }).then((r) => ({ ...r, transport }))
}

async function salaryTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Maaş tablosu' }))
  return screen.getByTestId('salary-table')
}

describe('Personel: erken hata avı düzeltmeleri', { timeout: 30_000 }, () => {
  it('ek mesai dakikası en çok iki ondalıklı saat olarak yazılır ve aynı dakikaya döner (B13)', () => {
    for (const minutes of [260, 50, 125, 90, 1])
      expect(hoursToMinutes(minutesToText(minutes, 'tr'))).toBe(minutes)
    expect(minutesToText(260, 'tr')).toBe('4,33')
    expect(minutesToText(260, 'en')).toBe('4.33')
  })

  it('farklı para birimindeki maaş kendi para birimiyle yazılır; toplamlar para birimi başına (B18)', async () => {
    const state = defaultStaffState()
    state.salaries = state.salaries.map((s) => (s.employeeId === 'e3' ? { ...s, currency: 'EUR' } : s))
    const user = userEvent.setup()
    await render(state)
    const table = await salaryTab(user)
    expect(
      within(await within(table).findByTestId('salary-row-e3')).getAllByText(/€/).length
    ).toBeGreaterThan(0)
    expect(within(table).getByTestId('salary-total-EUR')).toHaveTextContent('Toplam · EUR')
    expect(within(table).getByTestId('salary-total-TRY')).toHaveTextContent('₺')
    expect(within(table).getByTestId('salary-total-TRY')).not.toHaveTextContent('€')
  })

  it('maaş "Kasadan (nakit)" ödenince kasadan düşer: paidFromDrawer, yöntem yok (B9)', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Selin Kaya: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    await user.click(within(dialog).getByLabelText('Ödeme yöntemi'))
    await user.click(await screen.findByRole('option', { name: 'Kasadan (nakit)' }))
    expect(within(dialog).getByText(/kasa bu tutar kadar azalır/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() =>
      expect(transport.staffCalls.find((c) => c.name === 'staff.addTransaction')?.input).toMatchObject({
        kind: 'salary_payment',
        paidFromDrawer: true,
        methodId: null
      })
    )
  })

  it('kapalı günde Sahip gerekçe yazar ve ödeme kaydedilir (B8)', async () => {
    const user = userEvent.setup()
    const { transport } = await render({ closedDays: ['2026-10-04'] })
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Selin Kaya: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    const reason = await within(dialog).findByTestId('closed-day-reason')
    await user.type(within(reason).getByRole('textbox'), 'unutulan ödeme')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    await waitFor(() =>
      expect(
        transport.staffCalls.filter((c) => c.name === 'staff.addTransaction').at(-1)?.input
      ).toMatchObject({ reason: 'unutulan ödeme' })
    )
  })

  it('kapalı güne yazma yetkisi olmayan rol gerekçe alanı değil kilit açıklaması görür (B8, B26)', async () => {
    act(() => setViewAs('accountant'))
    const user = userEvent.setup()
    await render({ closedDays: ['2026-10-04'] })
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Selin Kaya: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    expect(await within(dialog).findByTestId('closed-day-locked')).toBeInTheDocument()
  })

  it('personel yazması defteri, kasa düğmesini ve Bugün kartını da yeniler (B27)', () => {
    expect(STAFF_READS).toEqual(
      expect.arrayContaining(['ledger.day', 'ledger.month', 'ledger.cashPanel', 'ledger.drawerSummary'])
    )
  })

  it('çıkış tarihli çalışan yeni giriş tarihiyle yeniden işe alınır (B6)', async () => {
    const state = defaultStaffState()
    state.employees = state.employees.map((e) =>
      e.id === 'e2' ? { ...e, active: false, endDate: localDate('2026-03-31') } : e
    )
    const user = userEvent.setup()
    const { transport } = await render(state)
    await user.click(await screen.findByRole('button', { name: /Ayrılanları göster/ }))
    await user.click(await screen.findByTestId('employee-e2'))
    const sheet = await screen.findByTestId('employee-sheet')
    await user.click(within(sheet).getByTestId('employee-rehire'))
    const dialog = await screen.findByRole('dialog', { name: 'Yeniden işe al · Murat Demir' })
    expect(dialog).toHaveTextContent('31 Mart 2026')
    await user.click(within(dialog).getByRole('button', { name: 'Yeniden işe al' }))
    await waitFor(() =>
      expect(transport.staffCalls.find((c) => c.name === 'staff.rehire')?.input).toEqual({
        employeeId: 'e2',
        startDate: '2026-10-04' as LocalDate
      })
    )
  })
})
