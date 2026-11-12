// Flow test A fixes on the Personel screen (QA2a): a text that is not an amount (letters, a minus sign) never
// pays the remaining salary, more than is left is asked once, the month is named instead of "bu ay", a first
// salary starts this month, a card without salary is warned and the schedule is empty after someone left.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { defaultStaffState, staffTransport, type StaffState } from './staff-fake'
import { StaffPage } from './staff-page'

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

const render = (state: Partial<StaffState> = {}) => {
  const transport = staffTransport({ state })
  return renderWithProviders(<StaffPage />, { transport }).then((r) => ({ ...r, transport }))
}

const calls = (t: { staffCalls: { name: string; input: unknown }[] }, name: string) =>
  t.staffCalls.filter((c) => c.name === name)

async function salaryTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Maaş tablosu' }))
  return screen.getByTestId('salary-table')
}

describe('Personel: para alanları (QA2a)', { timeout: 30_000 }, () => {
  it('Maaş öde: kalanla dolu alana "abc" yazılınca ödeme yapılmaz, hata alanın altında', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Olga Petrova: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    const amount = within(dialog).getByLabelText('Ödenen tutar')
    expect(amount).not.toHaveValue('')
    await user.clear(amount)
    await user.type(amount, 'abc')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sayı olmalı')
    expect(calls(transport, 'staff.addTransaction')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Maaş öde' })).toBeInTheDocument()
  })

  it('Avans ver: eksi tutar alanın altında söylenir ve kaydedilmez; boşta "Tutar girin."', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Olga Petrova: avans ver' }))
    const dialog = await screen.findByRole('dialog', { name: 'Avans ver' })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar girin.')
    const amount = within(dialog).getByLabelText('Avans tutarı')
    await user.type(amount, '-100')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(await within(dialog).findByTestId('money-error')).toHaveTextContent('Tutar sıfırdan küçük olamaz.')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(calls(transport, 'staff.addTransaction')).toHaveLength(0)
  })

  it('kalan maaşı aşan avans önce sorulur; ay adıyla söylenir; onaylanınca yazılır', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Olga Petrova: avans ver' }))
    const dialog = await screen.findByRole('dialog', { name: 'Avans ver' })
    await user.type(within(dialog).getByLabelText('Avans tutarı'), '60000')
    await user.tab()
    expect(within(dialog).getByText(/Eylül 2026 için kalan maaşı/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    const ask = await screen.findByRole('alertdialog', { name: 'Kalan maaştan fazla avans verilsin mi?' })
    expect(ask).toHaveTextContent('Eylül 2026 için kalan maaş ₺41.933,33, verilen ₺60.000.')
    await user.click(within(ask).getByRole('button', { name: 'Vazgeç' }))
    expect(calls(transport, 'staff.addTransaction')).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await user.click(await screen.findByTestId('over-amount-confirm'))
    await waitFor(() => expect(calls(transport, 'staff.addTransaction')).toHaveLength(1))
    expect(calls(transport, 'staff.addTransaction')[0]!.input).toMatchObject({
      kind: 'advance',
      amountMinor: 6_000_000
    })
  })

  it('kalan maaşı aşan maaş ödemesi önce sorulur', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await salaryTab(user)
    await user.click(await screen.findByRole('button', { name: 'Olga Petrova: maaş öde' }))
    const dialog = await screen.findByRole('dialog', { name: 'Maaş öde' })
    const amount = within(dialog).getByLabelText('Ödenen tutar')
    await user.clear(amount)
    await user.type(amount, '50000')
    await user.click(within(dialog).getByRole('button', { name: 'Ödemeyi kaydet' }))
    expect(
      await screen.findByRole('alertdialog', { name: 'Kalan maaştan fazla ödeme yapılsın mı?' })
    ).toBeInTheDocument()
    expect(calls(transport, 'staff.addTransaction')).toHaveLength(0)
  })
})

describe('Personel: maaş ve çizelge varsayılanları (QA2a)', { timeout: 30_000 }, () => {
  it("hiç maaşı olmayan çalışanın yeni maaşı bu ayın 1'inden, maaşı olanınki gelecek ayın 1'inden başlar", async () => {
    const user = userEvent.setup()
    const state = defaultStaffState()
    state.salaries = state.salaries.filter((s) => s.employeeId !== 'e3')
    const { transport } = await render(state)
    await user.click(await screen.findByTestId('employee-e3'))
    let sheet = await screen.findByTestId('employee-sheet')
    await user.click(within(sheet).getByRole('button', { name: 'Maaşı değiştir' }))
    let dialog = await screen.findByRole('dialog', { name: 'Yeni maaş · Olga Petrova' })
    await user.type(within(dialog).getByLabelText('Aylık maaş'), '30000')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(calls(transport, 'staff.addSalary')).toHaveLength(1))
    expect(calls(transport, 'staff.addSalary')[0]!.input).toMatchObject({ validFrom: '2026-10-01' })

    await user.keyboard('{Escape}')
    await user.click(await screen.findByTestId('employee-e1'))
    sheet = await screen.findByTestId('employee-sheet')
    await user.click(within(sheet).getByRole('button', { name: 'Maaşı değiştir' }))
    dialog = await screen.findByRole('dialog', { name: 'Yeni maaş · Selin Kaya' })
    await user.type(within(dialog).getByLabelText('Aylık maaş'), '45000')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(calls(transport, 'staff.addSalary')).toHaveLength(2))
    expect(calls(transport, 'staff.addSalary')[1]!.input).toMatchObject({ validFrom: '2026-11-01' })
  })

  it('yeni çalışanda maaş 0 ise uyarı çıkar ama kart kaydedilir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await user.click(await screen.findByRole('button', { name: 'Yeni çalışan' }))
    const dialog = await screen.findByRole('dialog', { name: /Yeni çalışan/ })
    await user.type(within(dialog).getByTestId('employee-firstName'), 'Ece')
    await user.type(within(dialog).getByTestId('employee-lastName'), 'Ak')
    await user.type(within(dialog).getByLabelText('Aylık maaş'), '0')
    await user.tab()
    expect(within(dialog).getByTestId('employee-no-salary')).toHaveTextContent('maaşsız kaydedilir')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(calls(transport, 'staff.createEmployee')).toHaveLength(1))
  })

  it('işten ayrılan çalışanın çizelgesinde çıkış gününden sonraki günler boş ve tıklanmaz', async () => {
    const user = userEvent.setup()
    const state = defaultStaffState()
    state.employees = state.employees.map((e) =>
      // Leaving on 6 October: the card is still on the grid until then (the service keeps it active).
      e.id === 'e3' ? { ...e, endDate: localDate('2026-10-06') } : e
    )
    await render(state)
    await user.click(await screen.findByRole('tab', { name: 'İzin ve çizelge' }))
    const row = screen.getByTestId('schedule-row-e3')
    expect(within(row).getAllByRole('button')).toHaveLength(3) // 4, 5 and 6 October
    expect(within(row).getAllByTestId('schedule-gone')).toHaveLength(11)
    expect(within(row).getAllByTestId('schedule-gone')[0]).toHaveAccessibleName(
      'Olga Petrova, 7 Eki 2026: işten ayrıldı'
    )
  })
})
