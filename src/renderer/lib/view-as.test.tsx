import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import type { ProcedureName } from '@shared/contract'
import { defaultPermissions } from '@shared/permissions'
import { FAKE_ROLES, fakeTransport, renderWithProviders } from '@/test/render'
import type { Transport } from '@/lib/transport'
import { connection } from '@/lib/transport'
import { setViewAs, useCan } from './view-as'

function Probe() {
  const can = useCan()
  return (
    <ul>
      <li data-testid="staff">{String(can('staff'))}</li>
      <li data-testid="salary">{String(can('staff.salary'))}</li>
      <li data-testid="calendar-edit">{String(can('calendar', 'edit'))}</li>
    </ul>
  )
}

afterEach(() =>
  act(() => {
    setViewAs(null)
    connection.reset()
  })
)

const read = () => ({
  staff: screen.getByTestId('staff').textContent,
  salary: screen.getByTestId('salary').textContent,
  calendarEdit: screen.getByTestId('calendar-edit').textContent
})

describe('yetkiler oturumdan gelir (G-23)', () => {
  it('resepsiyon hesabı personel ve maaşları göremez, takvimi düzenler', async () => {
    await renderWithProviders(<Probe />, {
      transport: fakeTransport(undefined, { signedIn: 'u-deniz' })
    })
    await screen.findByTestId('staff')
    await vi.waitFor(() => expect(read()).toEqual({ staff: 'false', salary: 'false', calendarEdit: 'true' }))
  })

  it('yedek kopya yanıt verirken (P13b) hiçbir düzenleme yetkisi kalmaz; görme yetkileri aynı kalır', async () => {
    await renderWithProviders(<Probe />)
    await screen.findByTestId('staff')
    await vi.waitFor(() => expect(read().calendarEdit).toBe('true'))
    act(() => connection.readOnly())
    expect(read()).toEqual({ staff: 'true', salary: 'true', calendarEdit: 'false' })
    act(() => connection.ok())
    expect(read().calendarEdit).toBe('true')
  })

  it('oturum bilgisi yokken (tek ekran testleri) her şey açıktır', async () => {
    const silent: Transport = {
      kind: 'ipc',
      call: (name: ProcedureName) => Promise.reject(new Error(`unexpected ${name}`))
    }
    await renderWithProviders(<Probe />, { transport: silent })
    await screen.findByTestId('staff')
    expect(read()).toEqual({ staff: 'true', salary: 'true', calendarEdit: 'true' })
  })

  it('"Bu rolün gözüyle bak": rol kimliğiyle o rolün tablosu kullanılır', async () => {
    await renderWithProviders(<Probe />)
    await screen.findByTestId('staff')
    const accountant = FAKE_ROLES.find((r) => r.code === 'accountant')!
    expect(defaultPermissions('accountant')['staff.salary']).toBe('edit')
    act(() => setViewAs(accountant.id))
    await vi.waitFor(() => expect(read()).toEqual({ staff: 'true', salary: 'true', calendarEdit: 'false' }))
    act(() => setViewAs('housekeeping'))
    await vi.waitFor(() => expect(read()).toEqual({ staff: 'false', salary: 'false', calendarEdit: 'false' }))
    act(() => setViewAs(null))
    await vi.waitFor(() => expect(read().salary).toBe('true'))
  })
})
